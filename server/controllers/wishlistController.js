// =============================================================================
// REUSE RADAR - WISHLIST CONTROLLER (wishlistController.js)
// Purpose: Manages campus "I Need This" requests — public posts where students
//          say what item they urgently need. Other students who have that item
//          can donate/sell it to them.
//          Also provides the campus needs feed for HomeScreen.
// Routes handled:
//   POST  /api/wishlist              — Post a new campus need
//   GET   /api/wishlist              — Browse campus needs feed
//   GET   /api/wishlist/my           — View my own posted requests
//   PATCH /api/wishlist/:id/status   — Update status (active/matched/fulfilled)
//   DELETE /api/wishlist/:id         — Remove a posted request
// =============================================================================

// Wishlist model — campus request documents
const Wishlist = require('../models/Wishlist');

// =============================================================================
// @desc    Post a campus wishlist / item request
// @route   POST /api/wishlist
// @access  Protected (requires JWT)
// Creates a public "I need this" post visible in the campus community feed
// =============================================================================

exports.createWishlist = async (req, res) => {
  try {
    const { title, category, urgency, description } = req.body;

    // Validate required fields
    if (!title || !category || !description) {
      return res.status(400).json({
        success: false,
        message: 'Title, category, and description are required',
      });
    }

    // Create the wishlist document in MongoDB
    const wishlist = await Wishlist.create({
      requester: req.user._id,              // Linked to the authenticated user
      title: String(title).trim(),          // Clean up whitespace
      category,                             // Must match Wishlist model enum
      urgency: urgency === 'High' ? 'High' : 'Medium', // Default to Medium if invalid value
      description: String(description).trim(),
      status: 'active',                     // All new requests start as active (visible in feed)
    });

    // Populate requester info for the response (so the UI can show the poster's name/avatar)
    const populated = await Wishlist.findById(wishlist._id).populate(
      'requester',
      'name avatar collegeName department isVerified'
    );

    res.status(201).json({
      success: true,
      message: 'Campus request posted successfully',
      wishlist: populated,
    });
  } catch (error) {
    console.error('[CreateWishlist Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error creating campus request',
    });
  }
};

// =============================================================================
// @desc    Campus Requests Feed — active requests posted by college mates
// @route   GET /api/wishlist
// @access  Public (anyone can browse campus needs, even without login)
// Shows what your college community members urgently need
// =============================================================================

exports.getWishlistFeed = async (req, res) => {
  try {
    const { category, search, status = 'active', limit = 50 } = req.query;

    // Build the MongoDB query object based on provided filters
    const query = {};

    // Filter by status (default: show only active requests, not fulfilled/matched)
    if (status && status !== 'All') query.status = status;

    // Filter by category (e.g., show only 'Books' requests)
    if (category && category !== 'All') query.category = category;

    // Text search across title and description using case-insensitive regex
    if (search && String(search).trim()) {
      const searchRegex = new RegExp(String(search).trim(), 'i'); // 'i' = case-insensitive
      query.$or = [
        { title: searchRegex },       // Match if title contains search term
        { description: searchRegex }, // OR description contains search term
      ];
    }

    const wishlists = await Wishlist.find(query)
      .populate('requester', 'name avatar collegeName department isVerified') // Who needs it
      .populate('matchedItem', 'title images category')                       // Which item matched (if any)
      // Sort: urgency ascending (High=1 comes before Medium=2), then newest first
      // This makes high-urgency requests appear at the top of the feed
      .sort({ urgency: 1, createdAt: -1 })
      // Clamp limit: minimum 1, maximum 100 (parseInt handles string query params)
      .limit(Math.min(100, Math.max(1, parseInt(limit, 10) || 50)))
      .lean(); // Plain JS objects (no Mongoose document overhead)

    res.status(200).json({
      success: true,
      count: wishlists.length,
      wishlists,
    });
  } catch (error) {
    console.error('[GetWishlistFeed Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error fetching campus requests',
    });
  }
};

// =============================================================================
// @desc    My own wishlist requests
// @route   GET /api/wishlist/my
// @access  Protected
// Called from ProfileScreen to show the user's own posted campus requests
// =============================================================================

exports.getMyWishlists = async (req, res) => {
  try {
    // Filter by requester = current user (only my posts)
    const wishlists = await Wishlist.find({ requester: req.user._id })
      .populate('matchedItem', 'title images category') // Show matched item details if found
      .sort({ createdAt: -1 })                          // Newest first
      .lean();

    res.status(200).json({
      success: true,
      count: wishlists.length,
      wishlists,
    });
  } catch (error) {
    console.error('[GetMyWishlists Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error fetching your campus requests',
    });
  }
};

// =============================================================================
// @desc    Update wishlist status (matched / fulfilled / active)
// @route   PATCH /api/wishlist/:id/status
// @access  Protected (only the original poster can update)
// Called when requester's need is met and they want to mark it fulfilled
// =============================================================================

exports.updateWishlistStatus = async (req, res) => {
  try {
    const { status } = req.body;

    // Validate status value against allowed enum values
    if (!['active', 'matched', 'fulfilled'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be active, matched or fulfilled',
      });
    }

    // findOneAndUpdate with { requester: req.user._id } ensures:
    // - Only the original poster can update their own request (authorization)
    // - Other users cannot change someone else's request status
    const wishlist = await Wishlist.findOneAndUpdate(
      { _id: req.params.id, requester: req.user._id }, // Must be owner
      { status },                                       // Update only the status field
      { new: true }                                     // Return updated document
    );

    if (!wishlist) {
      // Either doesn't exist OR doesn't belong to this user
      return res.status(404).json({
        success: false,
        message: 'Campus request not found or not yours',
      });
    }

    res.status(200).json({
      success: true,
      message: `Campus request marked ${status}`,
      wishlist,
    });
  } catch (error) {
    console.error('[UpdateWishlistStatus Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error updating campus request',
    });
  }
};

// =============================================================================
// @desc    Delete my campus request
// @route   DELETE /api/wishlist/:id
// @access  Protected (only the original poster can delete)
// Called from MyItemsScreen when user wants to remove a posted request
// =============================================================================

exports.deleteWishlist = async (req, res) => {
  try {
    // findOneAndDelete with { requester: req.user._id } ensures:
    // - User can only delete their OWN requests
    // - If _id matches but requester doesn't, findOneAndDelete returns null (safe)
    const wishlist = await Wishlist.findOneAndDelete({
      _id: req.params.id,
      requester: req.user._id, // Authorization: must be the original poster
    });

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Campus request not found or not yours',
      });
    }

    res.status(200).json({ success: true, message: 'Campus request removed' });
  } catch (error) {
    console.error('[DeleteWishlist Error]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error deleting campus request',
    });
  }
};
