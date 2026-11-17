// =============================================================================
// REUSE RADAR - REQUEST CONTROLLER (requestController.js)
// Purpose: Manages the full lifecycle of item claim/exchange requests.
//          A Request is created when a student wants to claim, buy, or borrow an item.
//          Includes: submit request → accept/reject → verify PIN → complete handover
//                    → (for borrows) return confirmation
// Routes handled:
//   POST /api/requests                   — Submit item claim request
//   GET  /api/requests/incoming          — Requests received on my items
//   GET  /api/requests/outgoing          — Requests I sent
//   PUT  /api/requests/:id/respond       — Accept or reject (owner only)
//   PUT  /api/requests/:id/cancel        — Cancel my own request
//   POST /api/requests/:id/complete      — Verify 4-digit PIN & complete handover
//   POST /api/requests/:id/return        — Confirm borrowed item returned (owner only)
// =============================================================================

// Models
const Request = require('../models/Request');         // Exchange requests
const Item = require('../models/Item');               // Item listings
const User = require('../models/User');               // User accounts
const Notification = require('../models/Notification'); // In-app notifications

// Push notification utility (sends Expo push alerts to device)
const { sendPushNotification } = require('../utils/pushNotifier');

// =============================================================================
// @desc    Submit item request (Feature 8 — Claim/Request Flow)
// @route   POST /api/requests
// @access  Protected
// Flow: validate item → check not own item → check not completed → check no duplicate → create
// =============================================================================

exports.createRequest = async (req, res) => {
  try {
    const { itemId, message } = req.body;

    if (!itemId) {
      return res.status(400).json({ success: false, message: 'Item ID is required' });
    }

    // Load item with donor's name and push token for notification
    const item = await Item.findById(itemId).populate('donor', 'name expoPushToken');
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    // Validation: Cannot request your own item (prevents self-dealing)
    // item.donor._id is an ObjectId; .equals() does proper MongoDB ObjectId comparison
    if (item.donor._id.equals(req.user._id)) {
      return res.status(400).json({
        success: false,
        message: 'You cannot request your own item',
      });
    }

    // Validation: Cannot request an already-completed item (already claimed by someone else)
    if (item.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'This item has already been claimed and completed',
      });
    }

    // Validation: Cannot submit a second active request for the same item
    // $in checks if the status is any of these values (pending or already accepted)
    const existingActiveRequest = await Request.findOne({
      item: itemId,
      sender: req.user._id,
      status: { $in: ['pending', 'accepted'] }, // Only check for open/active requests
    });

    if (existingActiveRequest) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active request for this item',
      });
    }

    // Create the Request document in MongoDB
    const newRequest = await Request.create({
      item: itemId,
      sender: req.user._id,     // Requester (the student who wants the item)
      receiver: item.donor._id, // Owner (the student who listed the item)
      message: message ? message.trim() : 'Hi! I am interested in reusing this item.', // Default message
      status: 'pending',        // All new requests start in pending state
    });

    // Create in-app notification for the item donor (they'll see it in NotificationsScreen)
    await Notification.create({
      recipient: item.donor._id,     // The item owner receives the notification
      sender: req.user._id,          // The requester triggered it
      type: 'new_request',           // Notification type for icon and routing
      title: 'New Item Request! 🎁',
      message: `${req.user.name} requested your item: "${item.title}"`,
      relatedItem: item._id,
      relatedRequest: newRequest._id,
    });

    // Send Expo push notification if the item owner has registered their device token
    // .catch() prevents push failures from breaking the API response
    if (item.donor.expoPushToken) {
      sendPushNotification(
        item.donor.expoPushToken,
        'New Item Request! 🎁',
        `${req.user.name} is interested in your "${item.title}"`,
        { requestId: newRequest._id, itemId: item._id }
      );
    }

    // Return the populated request (with full item and receiver details for the UI)
    const populatedRequest = await Request.findById(newRequest._id)
      .populate('item')
      .populate('receiver', 'name phone email avatar collegeName');

    res.status(201).json({
      success: true,
      message: 'Request submitted successfully to the item owner',
      request: populatedRequest,
    });
  } catch (error) {
    console.error('[CreateRequest Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error creating request',
    });
  }
};

// =============================================================================
// @desc    Get received requests for my items (Feature 13 - Received tab)
// @route   GET /api/requests/incoming
// @access  Protected
// Called by RequestsScreen "Received" tab — shows what others want from me
// =============================================================================

exports.getIncomingRequests = async (req, res) => {
  try {
    const { status } = req.query;

    // Filter: show requests where I am the receiver (item owner)
    const query = { receiver: req.user._id };

    // Optional status filter: 'pending', 'accepted', 'completed', etc.
    if (status && status !== 'all') {
      query.status = status;
    }

    const requests = await Request.find(query)
      // Populate item details so the card can show the item being requested
      .populate(
        'item',
        'title category condition images status addressText location listingType borrowDays'
      )
      // Populate the requester's profile for displaying who is requesting
      .populate(
        'sender',
        'name phone email avatar collegeName karmaPoints isVerified department addressName location'
      )
      // Populate my own profile details (receiver)
      .populate(
        'receiver',
        'name phone avatar collegeName isVerified department addressName location'
      )
      .sort({ createdAt: -1 }) // Newest requests first
      .lean();

    res.status(200).json({
      success: true,
      count: requests.length,
      requests,
    });
  } catch (error) {
    console.error('[GetIncomingRequests Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error fetching incoming requests',
    });
  }
};

// =============================================================================
// @desc    Get sent requests by logged-in user (Feature 13 - Sent tab)
// @route   GET /api/requests/outgoing
// @access  Protected
// Called by RequestsScreen "Sent" tab — shows my own submitted requests
// =============================================================================

exports.getOutgoingRequests = async (req, res) => {
  try {
    const { status } = req.query;

    // Filter: show requests where I am the sender (requester)
    const query = { sender: req.user._id };

    if (status && status !== 'all') {
      query.status = status;
    }

    const requests = await Request.find(query)
      // Item details for the request card header
      .populate(
        'item',
        'title category condition images status addressText location listingType borrowDays'
      )
      // My own profile (the sender)
      .populate(
        'sender',
        'name phone email avatar collegeName karmaPoints isVerified department addressName location'
      )
      // The item owner's profile (who I requested from)
      .populate(
        'receiver',
        'name phone avatar collegeName isVerified department addressName location'
      )
      .sort({ createdAt: -1 }) // Newest requests first
      .lean();

    res.status(200).json({
      success: true,
      count: requests.length,
      requests,
    });
  } catch (error) {
    console.error('[GetOutgoingRequests Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error fetching outgoing requests',
    });
  }
};

// =============================================================================
// @desc    Accept or reject a request (Feature 8 — Owner response)
// @route   PUT /api/requests/:id/respond
// @access  Protected (only the item owner can respond)
// ACCEPT: generates a 4-digit handover PIN and marks item as 'requested'
// REJECT: marks request rejected and notifies the requester
// =============================================================================

exports.respondToRequest = async (req, res) => {
  try {
    const { action } = req.body; // 'accept' or 'reject' sent by the UI

    // Load request with item and sender (requester) details needed for notifications
    const request = await Request.findById(req.params.id)
      .populate('item', 'title status listingType borrowDays')
      .populate('sender', 'name expoPushToken');

    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    // Authorization: only the item owner (receiver) can accept/reject
    // request.receiver is an ObjectId; .equals() does proper comparison
    if (!request.receiver.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to respond to this request',
      });
    }

    // Can only respond to pending requests (not already accepted/rejected/completed)
    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `This request is already ${request.status}`,
      });
    }

    if (action === 'accept') {
      // ── ACCEPT FLOW ───────────────────────────────────────────────────────

      // Generate a 4-digit PIN for physical handover verification
      // Math.floor(1000 + Math.random() * 9000) generates a number from 1000 to 9999
      // .toString() converts it to a string for storage
      const handoverCode = Math.floor(1000 + Math.random() * 9000).toString();

      // Update request status and store the generated PIN
      request.status = 'accepted';
      request.handoverCode = handoverCode;
      await request.save();

      // Mark the item as 'requested' (reserved for this requester)
      // This prevents other students from claiming it while this request is active
      await Item.findByIdAndUpdate(request.item._id, { status: 'requested' });

      // Notify the requester that their request was approved
      // Important: Include the handover code in the notification message!
      await Notification.create({
        recipient: request.sender._id,       // Notify the requester
        sender: req.user._id,               // From the item owner
        type: 'request_accepted',
        title: 'Request Accepted! 🎉',
        message: `Your request for "${request.item.title}" was approved! Handover Code: ${handoverCode}`,
        relatedItem: request.item._id,
        relatedRequest: request._id,
      });

      // Also send a device push notification with the approval
      if (request.sender.expoPushToken) {
        sendPushNotification(
          request.sender.expoPushToken,
          'Request Accepted! 🎉',
          `Your request for "${request.item.title}" has been approved!`,
          { requestId: request._id, itemId: request.item._id }
        );
      }

      return res.status(200).json({
        success: true,
        message: 'Request accepted successfully! Handover code generated.',
        request,
      });

    } else if (action === 'reject') {
      // ── REJECT FLOW ───────────────────────────────────────────────────────

      request.status = 'rejected';
      await request.save();
      // Note: item status stays 'available' (item is still claimable by others)

      // Notify the requester that their request was declined
      await Notification.create({
        recipient: request.sender._id,
        sender: req.user._id,
        type: 'request_rejected',
        title: 'Request Update',
        message: `Your request for "${request.item.title}" was declined by the owner.`,
        relatedItem: request.item._id,
        relatedRequest: request._id,
      });

      if (request.sender.expoPushToken) {
        sendPushNotification(
          request.sender.expoPushToken,
          'Request Update',
          `Your request for "${request.item.title}" was declined.`,
          { requestId: request._id }
        );
      }

      return res.status(200).json({
        success: true,
        message: 'Request rejected',
        request,
      });

    } else {
      // Invalid action value provided
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Must be "accept" or "reject"',
      });
    }
  } catch (error) {
    console.error('[RespondToRequest Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error responding to request',
    });
  }
};

// =============================================================================
// @desc    Cancel a pending or accepted request (Feature 8 — Requester withdrawal)
// @route   PUT /api/requests/:id/cancel
// @access  Protected (only the original requester can cancel)
// If the request was accepted (item reserved), item status reverts to 'available'
// =============================================================================

exports.cancelRequest = async (req, res) => {
  try {
    const request = await Request.findById(req.params.id)
      .populate('item', 'title status')
      .populate('receiver', 'name expoPushToken');

    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    // Authorization: only the requester (sender) can cancel their own request
    if (!request.sender.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'You can only cancel your own requests',
      });
    }

    // Cannot cancel requests that are already in a final state
    if (['completed', 'cancelled', 'rejected'].includes(request.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel a request that is already ${request.status}`,
      });
    }

    // Remember if the request was accepted (meaning item was reserved for this requester)
    const wasAccepted = request.status === 'accepted';

    // Mark as cancelled
    request.status = 'cancelled';
    await request.save();

    // If the request was accepted, the item was marked 'requested' (reserved)
    // Now that the request is cancelled, release the item back to 'available'
    if (wasAccepted) {
      await Item.findByIdAndUpdate(request.item._id, { status: 'available' });
    }

    // Notify the item owner that the requester withdrew their request
    await Notification.create({
      recipient: request.receiver._id,  // Notify the item owner
      sender: req.user._id,             // From the requester
      type: 'request_cancelled',
      title: 'Request Cancelled',
      message: `${req.user.name} cancelled their request for "${request.item.title}".`,
      relatedItem: request.item._id,
      relatedRequest: request._id,
    });

    res.status(200).json({
      success: true,
      message: 'Request cancelled successfully',
      request,
    });
  } catch (error) {
    console.error('[CancelRequest Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error cancelling request',
    });
  }
};

// =============================================================================
// @desc    Complete exchange & verify handover (Feature 8 — PIN verification)
// @route   POST /api/requests/:id/complete
// @access  Protected (either participant can complete)
// Flow:
//   1. Requester enters the 4-digit handover PIN shown by the item owner
//   2. Backend verifies the PIN matches request.handoverCode
//   3. Request marked 'completed', item status updated
//   4. Karma points awarded to donor (+50)
//   5. Borrow clock started if listingType='borrow' (sets dueAt)
//   6. Both parties notified
// =============================================================================

exports.completeRequest = async (req, res) => {
  try {
    const { enteredCode } = req.body; // The 4-digit PIN entered by the requester

    // Load full request with all related documents for validation and updates
    const request = await Request.findById(req.params.id)
      .populate('item')
      .populate('sender', 'name expoPushToken')
      .populate('receiver', 'name expoPushToken');

    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    // Authorization: only the two participants (owner or requester) can complete
    const isOwner = request.receiver._id.equals(req.user._id);
    const isRequester = request.sender._id.equals(req.user._id);

    if (!isOwner && !isRequester) {
      return res.status(403).json({
        success: false,
        message: 'You are not a participant in this exchange',
      });
    }

    // Prevent completing an already-completed exchange (idempotency check)
    if (request.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'This exchange is already completed',
      });
    }

    // PIN Verification: if a code was entered, compare it to the stored handover code
    // .trim() ensures whitespace doesn't cause false mismatches
    if (enteredCode && enteredCode.trim() !== request.handoverCode) {
      return res.status(400).json({
        success: false,
        message: 'Incorrect handover verification code',
      });
    }

    // ── Mark request as completed ─────────────────────────────────────────────
    request.status = 'completed';
    request.completedAt = new Date(); // Record exactly when the handover happened
    request.handedOverAt = request.completedAt; // Start the borrow clock from this moment

    // ── Borrow duration clock ─────────────────────────────────────────────────
    const isBorrow = request.item.listingType === 'borrow';
    if (isBorrow) {
      // Calculate return deadline: handover time + borrowDays in milliseconds
      // 86400000 ms = 1 day (24 * 60 * 60 * 1000)
      const borrowDays = Math.max(1, Number(request.item.borrowDays) || 7);
      request.dueAt = new Date(request.completedAt.getTime() + borrowDays * 86400000);
      // dueAt is shown in the app as a countdown timer reminding the borrower to return
    }

    await request.save();

    // Update item status:
    // - Donations (sell/donate): 'completed' — item is permanently given away
    // - Borrows: 'requested'   — item is on loan, will return to 'available' after return
    await Item.findByIdAndUpdate(request.item._id, {
      status: isBorrow ? 'requested' : 'completed',
    });

    // ── Gamification: Award karma points to the donor ─────────────────────────
    // $inc: MongoDB atomic increment operator (thread-safe, no race conditions)
    // Donor gets +50 karma for every successful item handover
    await User.findByIdAndUpdate(request.receiver._id, {
      $inc: { karmaPoints: 50, itemsDonatedCount: 1 }, // Reward the giver
    });

    // Increment the requester's claimed items counter
    await User.findByIdAndUpdate(request.sender._id, {
      $inc: { itemsClaimedCount: 1 }, // Track how many items this person received
    });

    // ── Notify both parties ───────────────────────────────────────────────────

    // Notify the requester: "Reuse complete!"
    await Notification.create({
      recipient: request.sender._id,     // Requester gets this notification
      sender: request.receiver._id,
      type: 'request_completed',
      title: 'Reuse Complete! 🌱',
      message: `Exchange for "${request.item.title}" is complete. Thank you for reusing!`,
      relatedItem: request.item._id,
      relatedRequest: request._id,
    });

    // Notify the donor: "Karma points earned!"
    await Notification.create({
      recipient: request.receiver._id,   // Donor gets this notification
      sender: request.sender._id,
      type: 'request_completed',
      title: '50 Karma Points Earned! ⭐',
      message: `You successfully handed over "${request.item.title}". You earned 50 Karma points!`,
      relatedItem: request.item._id,
      relatedRequest: request._id,
    });

    res.status(200).json({
      success: true,
      message: 'Exchange completed successfully! Karma points awarded.',
      request,
    });
  } catch (error) {
    console.error('[CompleteRequest Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error completing exchange',
    });
  }
};

// =============================================================================
// @desc    Mark a borrowed item as returned (owner only)
// @route   POST /api/requests/:id/return
// @access  Protected (only the item owner can confirm return)
// Called when the item owner physically receives their item back from the borrower.
// Sets returnedAt timestamp and resets item status to 'available' for future borrows.
// =============================================================================

exports.markReturned = async (req, res) => {
  try {
    const request = await Request.findById(req.params.id)
      .populate('item', 'title status listingType borrowDays')
      .populate('sender', 'name expoPushToken')  // The borrower (sender of original request)
      .populate('receiver', 'name');              // The item owner (receiver of request)

    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    // Authorization: only the item owner (receiver) can confirm the return
    // The borrower cannot self-certify a return (requires owner confirmation)
    if (!request.receiver._id.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Only the item owner can mark a borrowed item as returned',
      });
    }

    // Cannot mark as returned if the item was never handed over
    if (!request.handedOverAt) {
      return res.status(400).json({
        success: false,
        message: 'This item has not been handed over yet',
      });
    }

    // Prevent double-marking (idempotency check)
    if (request.returnedAt) {
      return res.status(400).json({
        success: false,
        message: 'This borrowed item is already marked as returned',
      });
    }

    // Record the exact return timestamp
    request.returnedAt = new Date();
    await request.save();

    // Reset item status back to 'available' — it can now be borrowed again
    await Item.findByIdAndUpdate(request.item._id, { status: 'available' });

    // Notify the borrower that the owner confirmed the return
    await Notification.create({
      recipient: request.sender._id,     // Notify the borrower
      sender: request.receiver._id,      // From the item owner
      type: 'borrow_returned',
      title: 'Borrowing Complete ✅',
      message: `Your borrow of "${request.item.title}" was marked as returned. Thank you for reusing!`,
      relatedItem: request.item._id,
      relatedRequest: request._id,
    });

    // Send a device push notification to the borrower
    if (request.sender.expoPushToken) {
      sendPushNotification(
        request.sender.expoPushToken,
        'Borrowing Complete ✅',
        `Your borrow of "${request.item.title}" was marked as returned.`,
        { requestId: request._id, itemId: request.item._id }
      );
    }

    res.status(200).json({
      success: true,
      message: 'Borrowed item marked as returned',
      request,
    });
  } catch (error) {
    console.error('[MarkReturned Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error marking item returned',
    });
  }
};
