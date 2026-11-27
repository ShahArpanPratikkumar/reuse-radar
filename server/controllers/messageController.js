// =============================================================================
// REUSE RADAR - MESSAGE CONTROLLER (messageController.js)
// Purpose: Handles real-time-like chat messaging between students about items.
//          In ReUse Radar, conversations are always tied to a specific item.
//          This prevents confusion when two users discuss multiple items separately.
// Routes handled:
//   POST /api/messages                      — Send a chat message
//   GET  /api/messages/conversations        — Get inbox (all conversation threads)
//   GET  /api/messages/:itemId/:otherUserId — Get conversation history for one item
// =============================================================================

// 'mongoose' needed for ObjectId validation
const mongoose = require('mongoose');

// Models
const Message = require('../models/Message');           // Individual messages
const Item = require('../models/Item');                 // Items conversations are about
const Wishlist = require('../models/Wishlist');         // Campus wishlist requests (also chat-able)
const User = require('../models/User');                 // Users (sender/receiver profiles)
const Notification = require('../models/Notification'); // In-app notification system

// Push notification utility (sends Expo push alerts to the recipient's device)
const { sendPushNotification } = require('../utils/pushNotifier');

// Maximum characters per message (enforced both in schema and here)
const MAX_MESSAGE_LENGTH = 1000;

// =============================================================================
// @desc    Send a message regarding an item
// @route   POST /api/messages
// @access  Protected (requires JWT)
// Flow: validate → save message → create in-app notification → send push notification
// =============================================================================

exports.sendMessage = async (req, res) => {
  try {
    const { itemId, receiverId, text } = req.body || {};

    // ── Validation ──────────────────────────────────────────────────────────

    // Both itemId and receiverId are required to identify the conversation context
    if (!itemId || !receiverId) {
      return res.status(400).json({
        success: false,
        message: 'Item ID and receiver ID are required',
      });
    }

    // Validate both ObjectIds (prevents MongoDB injection via malformed IDs)
    if (!mongoose.isValidObjectId(itemId) || !mongoose.isValidObjectId(receiverId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid item ID or receiver ID',
      });
    }

    // Message text must exist and not be just whitespace
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message text cannot be empty',
      });
    }

    const cleanText = text.trim(); // Remove surrounding whitespace

    // Enforce message length limit
    if (cleanText.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters`,
      });
    }

    // Prevent sending a message to yourself (would create a confusing conversation)
    if (String(receiverId) === String(req.user._id)) {
      return res.status(400).json({
        success: false,
        message: 'You cannot send a message to yourself',
      });
    }

    // Verify the item or campus wishlist request exists
    let item = await Item.findById(itemId);
    if (!item) {
      item = await Wishlist.findById(itemId);
    }
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    // Verify the recipient exists (can't message a deleted/non-existent user)
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ success: false, message: 'Recipient not found' });
    }

    // ── Persist Message to Database ─────────────────────────────────────────

    const message = await Message.create({
      item: itemId,              // Which item this conversation is about
      sender: req.user._id,     // Who is sending the message
      receiver: receiverId,     // Who should receive it
      text: cleanText,          // The sanitized message text
      isRead: false,            // All new messages start as unread
    });

    // Populate sender/receiver names and avatars for the immediate UI response
    const populatedMessage = await Message.findById(message._id)
      .populate('sender', 'name avatar')
      .populate('receiver', 'name avatar')
      .lean();

    // ── In-App Notification ─────────────────────────────────────────────────
    // Create a database notification so it appears in NotificationsScreen

    // Truncate long messages to 80 chars for the notification preview
    const preview =
      cleanText.length > 80 ? `${cleanText.substring(0, 80)}…` : cleanText;

    try {
      await Notification.create({
        recipient: receiverId,           // Who receives the notification
        sender: req.user._id,           // Who sent the message
        type: 'new_message',            // Type for icon/routing in NotificationsScreen
        title: `Message from ${req.user.name} 💬`,
        message: `${preview}${item.title ? ` — re: ${item.title}` : ''}`, // Preview + item context
        relatedItem: itemId,            // Deep link to this item when notification is tapped
      });
    } catch (notifError) {
      // Notification failures MUST NEVER block message delivery
      // A chat message is more critical than the notification
      console.error('[SendMessage Notification Error]', notifError.message);
    }

    // ── Expo Push Notification ───────────────────────────────────────────────
    // If the receiver has registered for push notifications, send a device alert

    if (receiver.expoPushToken) {
      // .catch() prevents any push error from blocking the response
      sendPushNotification(
        receiver.expoPushToken,                     // Device token from User document
        `Message from ${req.user.name} 💬`,         // Notification title
        preview,                                     // Notification body (truncated message)
        {
          // Extra data delivered with the notification (used to navigate when tapped)
          type: 'new_message',
          itemId: String(itemId),
          senderId: String(req.user._id),
          receiverId: String(receiverId),
        }
      ).catch((e) => console.error('[SendMessage Push Error]', e.message));
    }

    // Return the populated message object for immediate UI display (ChatScreen appends it)
    return res.status(201).json({
      success: true,
      message: populatedMessage, // The 'message' field here is the Message document
    });
  } catch (error) {
    console.error('[SendMessage Error]', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error sending message',
    });
  }
};

// =============================================================================
// @desc    Get the signed-in user's active conversations (inbox)
// @route   GET /api/messages/conversations
// @access  Protected
// Algorithm:
//   1. Fetch all messages where user is sender OR receiver (last 500, newest first)
//   2. Group by (itemId, otherUserId) key to identify unique conversations
//   3. Keep only the latest message per conversation (the preview)
//   4. Count unread messages per conversation (the badge number)
//   5. Batch-fetch item and user details for all conversations
//   6. Sort by most recent message
// =============================================================================

exports.getConversations = async (req, res) => {
  try {
    const userId = req.user._id;

    // Step 1: Fetch recent messages involving this user (as sender OR receiver)
    // $or: MongoDB operator that matches documents where ANY condition is true
    // .limit(500): cap to avoid loading too much data for active users
    const messages = await Message.find({
      $or: [{ sender: userId }, { receiver: userId }],
    })
      .sort({ createdAt: -1 }) // Newest first (so first occurrence = latest message)
      .limit(500)              // Performance cap
      .lean();                 // Plain JS objects

    // Step 2: Group messages into unique conversations using a Map
    // Map key: "itemId:otherUserId" — unique per conversation
    const conversationMap = new Map();

    messages.forEach((msg) => {
      const senderId = String(msg.sender);
      const receiverId = String(msg.receiver);

      // "otherUser" = the person who is NOT the current user in this message
      const otherUserId = senderId === String(userId) ? receiverId : senderId;
      const itemId = String(msg.item);

      // Composite key: identifies a unique conversation (item + other person)
      const key = `${itemId}:${otherUserId}`;

      // Only set once — first occurrence is the LATEST message (we sorted newest first)
      if (!conversationMap.has(key)) {
        conversationMap.set(key, {
          id: key,
          itemId,
          otherUserId,
          lastMessage: {
            _id: msg._id,
            text: msg.text,
            sender: senderId,
            receiver: receiverId,
            isRead: !!msg.isRead, // !! converts to boolean (null → false)
            createdAt: msg.createdAt,
          },
          unreadCount: 0,       // Will be incremented below
          lastMessageAt: msg.createdAt,
        });
      }

      const conversation = conversationMap.get(key);

      // Step 3: Count unread messages (only messages where CURRENT USER is the receiver)
      // We only count messages the current user hasn't read yet
      if (receiverId === String(userId) && !msg.isRead) {
        conversation.unreadCount += 1;
      }
    });

    const conversationList = Array.from(conversationMap.values());

    // If no conversations found, return early
    if (conversationList.length === 0) {
      return res.status(200).json({ success: true, count: 0, conversations: [] });
    }

    // Step 4: Batch-fetch item and user data for ALL conversations at once
    // Using Set to deduplicate IDs (avoid fetching the same item/user multiple times)
    const itemIds = [...new Set(conversationList.map((c) => c.itemId))];
    const userIds = [...new Set(conversationList.map((c) => c.otherUserId))];

    // Promise.all runs queries in parallel (faster than sequential awaits)
    const [items, wishlists, users] = await Promise.all([
      Item.find({ _id: { $in: itemIds } })
        .select('title images category status') // Only fields needed for conversation preview
        .lean(),
      Wishlist.find({ _id: { $in: itemIds } })
        .select('title category status')
        .lean(),
      User.find({ _id: { $in: userIds } })
        .select('name avatar isVerified')       // Only fields needed for user preview
        .lean(),
    ]);

    // Step 5: Build lookup Maps for O(1) access when enriching each conversation
    const itemMap = new Map();
    items.forEach((i) => itemMap.set(String(i._id), i));
    wishlists.forEach((w) => itemMap.set(String(w._id), { ...w, images: [] }));
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    // Step 6: Enrich each conversation with item and user details, then sort
    const conversations = conversationList
      .map((c) => ({
        id: c.id,
        itemId: c.itemId,
        otherUserId: c.otherUserId,
        // Look up item details; fallback gracefully if item was deleted
        item: itemMap.get(c.itemId) || { _id: c.itemId, title: 'Item unavailable', images: [] },
        // Look up other user's profile; fallback if user was deleted
        otherUser: userMap.get(c.otherUserId) || { _id: c.otherUserId, name: 'ReUse Radar Member' },
        lastMessage: c.lastMessage,     // Most recent message text/timestamp
        unreadCount: c.unreadCount,     // Badge number for this conversation
        lastMessageAt: c.lastMessageAt, // For sorting
      }))
      // Sort by most recent message first (newest conversation at top of inbox)
      .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));

    return res.status(200).json({
      success: true,
      count: conversations.length,
      conversations,
    });
  } catch (error) {
    console.error('[GetConversations Error]', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error fetching conversations',
    });
  }
};

// =============================================================================
// @desc    Get messages between two users for a specific item (chronological)
// @route   GET /api/messages/:itemId/:otherUserId
// @access  Protected
// Called by ChatScreen when user opens a conversation
// Also marks all received messages as read (read receipts)
// =============================================================================

exports.getMessages = async (req, res) => {
  try {
    const { itemId, otherUserId } = req.params;

    // Validate both IDs
    if (!mongoose.isValidObjectId(itemId) || !mongoose.isValidObjectId(otherUserId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid item ID or user ID',
      });
    }

    // ── Mark messages as read (read receipts) ───────────────────────────────
    // When current user opens the chat, mark all INCOMING messages as read
    // This reduces the unread badge count and shows "read" status to the sender
    await Message.updateMany(
      {
        item: itemId,            // About this specific item
        sender: otherUserId,     // Sent BY the other person
        receiver: req.user._id, // Received BY the current user
        isRead: false,           // Only update unread messages
      },
      { $set: { isRead: true, readAt: new Date() } } // Mark as read with timestamp
    );

    // ── Fetch conversation history ───────────────────────────────────────────
    // Get all messages in BOTH directions (sent by me and sent by other user)
    const messages = await Message.find({
      item: itemId, // This specific item's conversation
      $or: [
        { sender: req.user._id, receiver: otherUserId }, // Messages I sent
        { sender: otherUserId, receiver: req.user._id }, // Messages they sent
      ],
    })
      .populate('sender', 'name avatar')   // Needed to show sender's name/avatar in chat
      .populate('receiver', 'name avatar')
      .sort({ createdAt: 1 })             // Ascending (oldest first = bottom of chat)
      .limit(200)                          // Cap at 200 messages per conversation
      .lean();

    return res.status(200).json({
      success: true,
      count: messages.length,
      messages, // Array of message objects in chronological order
    });
  } catch (error) {
    console.error('[GetMessages Error]', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error fetching messages',
    });
  }
};
