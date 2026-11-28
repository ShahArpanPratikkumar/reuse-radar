// =============================================================================
// REUSE RADAR - MESSAGE SERVICE (messageService.js)
// Purpose: Wraps all chat message API calls.
//          Used by: ChatScreen (send/receive messages), MessagesListScreen (inbox).
// API Endpoints covered:
//   POST /api/messages                        — Send a chat message
//   GET  /api/messages/:itemId/:otherUserId   — Load conversation history
//   GET  /api/messages/conversations          — Get inbox (all conversation threads)
// =============================================================================

// 'api' is our configured Axios instance with JWT auth and retry logic
import api from './api';

export const messageService = {
  // ── Send a Chat Message (ChatScreen) ─────────────────────────────────────
  // In ReUse Radar, conversations are always tied to a specific item.
  // itemId     = the item being discussed (links messages to the right context)
  // receiverId = the other person's MongoDB _id (donor or requester)
  // text       = the message content (max 1000 characters)
  // Backend creates a Message document and may send a push notification to the receiver
  async sendMessage(itemId, receiverId, text) {
    return await api.post('/messages', { itemId, receiverId, text });
  },

  // ── Load Conversation History (ChatScreen) ────────────────────────────────
  // Retrieves all messages exchanged between current user and 'otherUserId' about 'itemId'
  // Messages are sorted by createdAt ascending (oldest first, like WhatsApp)
  async getMessages(itemId, otherUserId) {
    return await api.get(`/messages/${itemId}/${otherUserId}`);
    // Backend also marks all received messages in this conversation as isRead=true
  },

  // ── Get Inbox / Conversation List (MessagesListScreen) ───────────────────
  // Returns one entry per active conversation (grouped by item + other user)
  // Each entry includes: latest message preview, sender name, item title, unread count
  // Sorted by most recent message first
  async getConversations() {
    return await api.get('/messages/conversations');
  },

  // ── Delete a Message (ChatScreen — sender only) ───────────────────────────
  // Permanently removes the message from MongoDB for both sides.
  // Only the original sender can delete their message.
  async deleteMessage(messageId) {
    return await api.delete(`/messages/${messageId}`);
  },
};
