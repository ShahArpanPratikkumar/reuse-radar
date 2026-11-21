// =============================================================================
// REUSE RADAR - REQUEST SERVICE (requestService.js)
// Purpose: Wraps all item request (claim/exchange) API calls.
//          Used by: ItemDetailsScreen (create), RequestsScreen (view/respond),
//                   RequestItemScreen (compose), MyItemsScreen (track).
// API Endpoints covered:
//   POST /api/requests                        — Submit item claim request
//   GET  /api/requests/incoming               — Requests received on my items
//   GET  /api/requests/outgoing               — Requests I sent
//   PUT  /api/requests/:id/respond            — Accept or reject a request
//   PUT  /api/requests/:id/cancel             — Cancel a pending request
//   POST /api/requests/:id/complete           — Verify 4-digit PIN and complete handover
//   POST /api/requests/:id/return             — Confirm borrowed item returned
// =============================================================================

// 'api' is our configured Axios instance with JWT auth and retry logic
import api from './api';

export const requestService = {
  // ── Submit Item Request (RequestItemScreen / ItemDetailsScreen) ───────────
  // itemId = MongoDB _id of the item being requested
  // message = optional note explaining why the student wants the item
  // Backend generates a 'pending' Request document and notifies the item owner
  async createRequest(itemId, message) {
    return await api.post('/requests', { itemId, message });
  },

  // ── Incoming Requests (RequestsScreen "Received" tab) ─────────────────────
  // Returns all requests submitted on items I own (I am the receiver/donor)
  // status = 'all' | 'pending' | 'accepted' | 'completed' | 'rejected'
  async getIncomingRequests(status = 'all') {
    return await api.get('/requests/incoming', { params: { status } });
  },

  // ── Outgoing Requests (RequestsScreen "Sent" tab) ─────────────────────────
  // Returns all requests I submitted (I am the sender/requester)
  // status = 'all' | 'pending' | 'accepted' | 'completed'
  async getOutgoingRequests(status = 'all') {
    return await api.get('/requests/outgoing', { params: { status } });
  },

  // ── Accept or Reject a Request (RequestsScreen owner actions) ─────────────
  // Only the item owner can respond to incoming requests
  // action = 'accept' (generates 4-digit handover PIN) or 'reject'
  async respondToRequest(requestId, action) {
    return await api.put(`/requests/${requestId}/respond`, { action });
  },

  // ── Cancel a Pending Request (RequestsScreen requester action) ────────────
  // Only the sender can cancel their own pending request
  // Cannot cancel after the owner has accepted (must wait for rejection)
  async cancelRequest(requestId) {
    return await api.put(`/requests/${requestId}/cancel`);
  },

  // ── Complete Exchange with Handover PIN (RequestsScreen) ──────────────────
  // The item owner shows the 4-digit PIN to the requester at the meetup.
  // Requester enters the PIN in the app to confirm physical handover.
  // Backend verifies PIN → marks request 'completed' → updates item status → awards karma
  async completeRequest(requestId, enteredCode) {
    return await api.post(`/requests/${requestId}/complete`, { enteredCode });
  },

  // ── Confirm Borrowed Item Return (RequestsScreen for borrow listings) ─────
  // After the borrower returns the item, the owner confirms receipt here.
  // Backend sets returnedAt timestamp and resets item status to 'available'.
  async markReturned(requestId) {
    return await api.post(`/requests/${requestId}/return`);
  },
};
