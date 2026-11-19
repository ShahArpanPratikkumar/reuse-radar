// =============================================================================
// REUSE RADAR - ITEM CARD COMPONENT (ItemCard.jsx)
// Purpose: Reusable card component for displaying a single item listing.
//          Used in HomeScreen grid, ExploreScreen list, FavoritesScreen, etc.
//          Handles: image loading, distance calculation, favorite toggle,
//                   listing type badges (Free/Paid/Borrow), donor display.
// Features:
//   1. Automatic image URL resolution (relative → absolute using apiConfig)
//   2. Distance display: uses API-provided distanceKm OR calculates Haversine distance
//   3. Listing type badges: 🎁 Free Giveaway | ₹Price | 🔄 Borrow
//   4. Heart/favorite toggle with optimistic UI + API rollback on error
//   5. Haptic feedback on favorite toggle (vibration on Android/web)
//   6. Condition color pill (Like New=teal, Good=amber, Fair=gray)
//   7. Photo count badge (shows "📷 3" if item has multiple images)
//   8. Donor row: avatar, name, verified badge
//   9. Relative timestamp (Just now / 5m ago / 2h ago / 3d ago)
//  10. Grid/Full width layout support (isGrid prop)
// =============================================================================

// React core and hooks
import React, { useState, useEffect } from 'react';

// React Native UI primitives
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Platform,   // Tells us if we're on iOS, Android, or web
  Vibration,  // Native vibration API for haptic feedback
} from 'react-native';

// Favorite API service (add/remove from favorites)
import { favoriteService } from '../services/favoriteService';

// VerifiedBadge shows the ✓ checkmark for verified students
import VerifiedBadge from './VerifiedBadge';

// Design system color palette
import { COLORS } from '../utils/constants';

// getImageBaseUrl: returns the backend server origin for building image URLs
import { getImageBaseUrl } from '../services/apiConfig';

// =============================================================================
// Image URL Resolution
// IMAGE_BASE_URL is computed once at component load time from the resolved backend host.
// Example: "http://192.168.1.185:5000"
// =============================================================================

// Resolved at runtime from the active API host — never a hardcoded LAN IP.
const IMAGE_BASE_URL = getImageBaseUrl();

// Fallback image shown when item has no photo or the photo fails to load
const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1532012164546-f432f2e3777a?auto=format&fit=crop&w=600&q=80';

// =============================================================================
// Helper: resolveImageUri
// Converts a possibly-relative server path to a full image URL.
// Relative paths from the server look like: "/uploads/item-123.jpg"
// Full URL needed by React Native <Image>: "http://192.168.1.185:5000/uploads/item-123.jpg"
// =============================================================================

const resolveImageUri = (path) => {
  if (!path || typeof path !== 'string') return null;
  // If already a full URL (http:// or https://), return as-is
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  // Combine base URL + path, handling leading slash
  return `${IMAGE_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
};

// =============================================================================
// Helper: tapFeedback
// Provides haptic feedback (vibration) when the favorite heart is tapped.
// Falls back gracefully on devices/platforms that don't support vibration.
// =============================================================================

const tapFeedback = () => {
  try {
    if (Platform.OS === 'web') {
      // Web vibration API (supported in Chrome on Android)
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(12); // 12ms vibration
      }
    } else {
      // Native Android vibration (12ms — just a quick tap confirmation)
      Vibration.vibrate(12);
    }
  } catch (e) {
    // Vibration is best-effort — if it fails, we silently ignore it
  }
};

// =============================================================================
// ItemCard Component
// Props:
//   item             — The item object from the API (required)
//   onPress          — Callback when card is tapped (navigates to ItemDetails)
//   userLocation     — { latitude, longitude } for distance calculation
//   isGrid           — boolean: true=grid layout (smaller), false=full-width list
//   isFavoriteInitial — boolean: initial heart state (from parent's favorites list)
//   onFavoriteToggle — callback to sync parent state when heart is toggled
// =============================================================================

const ItemCard = ({
  item,
  onPress,
  userLocation,
  isGrid = true,          // Default to grid view (2 columns)
  isFavoriteInitial = false,
  onFavoriteToggle,
}) => {
  // ── State ─────────────────────────────────────────────────────────────────

  // isFavorited: local state for the heart icon (filled=❤️ or empty=🤍)
  // Uses either the prop value OR item.isFavorite (whichever is set)
  const [isFavorited, setIsFavorited] = useState(
    Boolean(isFavoriteInitial || item?.isFavorite)
  );

  // toggling: prevents double-taps while the API request is in-flight
  const [toggling, setToggling] = useState(false);

  // Sync the heart state if the parent updates isFavoriteInitial
  // (e.g., when navigating to FavoritesScreen and removing items)
  useEffect(() => {
    if (isFavoriteInitial !== undefined) {
      setIsFavorited(isFavoriteInitial);
    }
  }, [isFavoriteInitial]);

  // Safety: don't render if item is null/undefined
  if (!item) return null;

  // ── Image Resolution ───────────────────────────────────────────────────────
  // Use the first image from the item's images array, with fallback if none
  let imageUri = FALLBACK_IMAGE;
  if (item.images && item.images.length > 0) {
    imageUri = resolveImageUri(item.images[0]) || FALLBACK_IMAGE;
  }

  // ── Distance Calculation ───────────────────────────────────────────────────
  // Priority 1: Use item.distanceKm if provided by the API (from $near query)
  // Priority 2: Calculate Haversine distance from userLocation
  // Haversine formula: calculates straight-line distance between two GPS coordinates
  let distanceKm = null;

  if (item.distanceKm !== undefined && item.distanceKm !== null && !isNaN(item.distanceKm)) {
    // Use API-provided distance (more accurate — calculated server-side from actual GPS)
    distanceKm = Number(item.distanceKm);
  } else if (
    userLocation &&
    userLocation.latitude &&
    userLocation.longitude &&
    item.location?.coordinates &&
    Array.isArray(item.location.coordinates) &&
    item.location.coordinates.length === 2
  ) {
    // Calculate distance client-side using the Haversine formula
    // GeoJSON coordinates: [longitude, latitude] (longitude FIRST!)
    const lat1 = userLocation.latitude;    // User's latitude
    const lon1 = userLocation.longitude;   // User's longitude
    const lon2 = item.location.coordinates[0]; // Item's longitude (index 0 = longitude in GeoJSON)
    const lat2 = item.location.coordinates[1]; // Item's latitude  (index 1 = latitude  in GeoJSON)

    if (!isNaN(lat1) && !isNaN(lon1) && !isNaN(lon2) && !isNaN(lat2)) {
      const R = 6371; // Earth's radius in kilometers
      // dLat and dLon: differences in coordinates, converted from degrees to radians
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      // Haversine formula components:
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) + // Square of half the lat difference
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2); // Square of half the lon difference
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); // Angular distance
      distanceKm = R * c; // Final distance in kilometers
    }
  }

  // Format the distance for display (or show "Nearby" if unknown)
  const distanceLabel = distanceKm !== null
    ? distanceKm < 0.1
      ? 'Here'                        // Less than 100m — show "Here"
      : `${distanceKm.toFixed(1)} km` // e.g., "2.3 km"
    : 'Nearby';                       // Unknown distance fallback

  // ── Area Name & Time Ago ───────────────────────────────────────────────────
  // Extract a readable area name from the addressText string
  const addressParts = String(item.addressText || '')
    .split(',')               // Split "274, Ahmedabad" by comma
    .map((part) => part.trim()) // Trim whitespace from each part
    .filter(Boolean);           // Remove empty strings

  // Find the first part that contains letters (avoids showing just a number)
  const areaName =
    addressParts.find((part) => /[a-zA-Z\u00C0-\u024F]/.test(part)) ||
    addressParts[0] ||
    'Campus Area'; // Final fallback

  // Calculate relative time string (how long ago the item was posted)
  const getTimeAgo = () => {
    if (!item.createdAt) return 'Just now';
    const diff = (Date.now() - new Date(item.createdAt).getTime()) / 1000; // Seconds since posted
    if (diff < 60) return 'Just now';                                       // < 1 minute
    if (diff < 3600) return `${Math.max(1, Math.round(diff / 60))}m ago`;  // < 1 hour → "5m ago"
    if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;            // < 1 day  → "2h ago"
    return `${Math.round(diff / 86400)}d ago`;                              // 1+ days  → "3d ago"
  };

  // ── Condition Badge Colors ─────────────────────────────────────────────────
  // Maps item condition strings to background and text color pairs
  const getConditionStyle = (cond) => {
    switch ((cond || '').toLowerCase()) {
      case 'like new':
      case 'new':
      case 'mint':
        return { bg: '#CCFBF1', text: '#0F766E' }; // Teal — excellent quality
      case 'excellent':
        return { bg: '#DCFCE7', text: '#15803D' }; // Green — very good quality
      case 'good':
        return { bg: '#FEF3C7', text: '#92400E' }; // Amber — decent quality
      case 'fair':
      case 'used':
      default:
        return { bg: '#F1F5F9', text: '#475569' }; // Gray — older/worn
    }
  };

  // Get the color pair for the item's condition
  const condStyle = getConditionStyle(item.condition || 'Good');

  // ── Donor Information ──────────────────────────────────────────────────────
  // The user who listed this item (the donor/seller/lender)
  const donorName = item.donor?.name || 'Campus Donor';
  const donorAvatar = resolveImageUri(item.donor?.avatar); // Resolve relative avatar path
  const donorVerified = Boolean(item.donor?.isVerified);   // Show ✓ badge if verified

  // ── Listing Type Classification ────────────────────────────────────────────
  // Determines which badge to show on the card body
  const isBorrow = item.listingType === 'borrow';                 // 🔄 Borrow badge
  const isPaid = item.listingType === 'sell' && Number(item.price) > 0; // ₹Price badge
  // If neither borrow nor paid → it's a free donation (🎁 Free Giveaway badge)

  const borrowDays = Number(item.borrowDays) || 7; // Default 7 days if not specified
  // Show "End of Semester" for very long borrows (100+ days) for better UX
  const borrowLabel = borrowDays >= 100 ? 'End of Semester' : `${borrowDays} days`;

  // ── Favorite Toggle Handler ────────────────────────────────────────────────
  // Uses optimistic UI: immediately updates the heart icon, then calls the API.
  // If the API call fails, rolls back to the previous state (error recovery).
  const handleToggleFavorite = async () => {
    if (toggling) return; // Prevent double-taps while API is in-flight

    const previousState = isFavorited;  // Save current state for rollback
    const nextState = !previousState;   // Toggle to opposite state

    // ── Optimistic Update (immediate visual feedback) ──────────────────────
    tapFeedback();                      // Haptic feedback
    setIsFavorited(nextState);          // Immediately show the new heart state
    if (onFavoriteToggle) onFavoriteToggle(item, nextState); // Notify parent

    // Skip API call for sample/demo items (no real _id)
    const canPersist =
      item._id &&
      !item._id.startsWith('sample-') &&
      !item._id.startsWith('stitch-');

    if (canPersist) {
      setToggling(true); // Lock to prevent double-taps
      try {
        if (nextState) {
          await favoriteService.addFavorite(item._id);    // Add to favorites in DB
        } else {
          await favoriteService.removeFavorite(item._id); // Remove from favorites in DB
        }
      } catch (err) {
        // ── Rollback on API Error ──────────────────────────────────────────
        console.log('[ItemCard Favorite Error]', err.message);
        setIsFavorited(previousState);                           // Revert heart icon
        if (onFavoriteToggle) onFavoriteToggle(item, previousState); // Revert parent state
      } finally {
        setToggling(false); // Unlock for next tap
      }
    }
  };

  // ── JSX Render ────────────────────────────────────────────────────────────
  return (
    <TouchableOpacity
      style={[styles.card, isGrid ? styles.cardGrid : styles.cardFull]} // Grid or full-width
      onPress={onPress}        // Navigate to ItemDetailsScreen when card is tapped
      activeOpacity={0.9}      // Slight fade on press (feels more responsive)
    >
      {/* ── Image Section with Overlay Badges ─────────────────────────── */}
      <View style={[styles.imageWrap, isGrid ? styles.imageWrapGrid : styles.imageWrapFull]}>
        {/* Item photo — fills the entire image container */}
        <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />

        {/* Top-left badge: Distance from user (e.g., "🧭 2.3 km") */}
        <View style={styles.distancePill}>
          <Text style={styles.distanceIcon}>🧭</Text>
          <Text style={styles.distanceText}>{distanceLabel}</Text>
        </View>

        {/* Below distance: photo count badge (shown only when item has multiple images) */}
        {Array.isArray(item.images) && item.images.length > 1 ? (
          <View style={styles.photoCountBadge}>
            <Text style={styles.photoCountText}>📷 {item.images.length}</Text>
          </View>
        ) : null}

        {/* Top-right: Favorite heart button (❤️ or 🤍) */}
        <TouchableOpacity
          style={[styles.heartBtn, isFavorited && styles.heartBtnActive]} // Red bg when active
          onPress={handleToggleFavorite}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} // Larger tap target for accessibility
        >
          <Text style={styles.heartIcon}>{isFavorited ? '❤️' : '🤍'}</Text>
        </TouchableOpacity>

        {/* Bottom-left: Item condition pill (Like New / Good / Fair) */}
        <View style={[styles.conditionPill, { backgroundColor: condStyle.bg }]}>
          <Text style={[styles.conditionText, { color: condStyle.text }]} numberOfLines={1}>
            {item.condition || 'Good'}
          </Text>
        </View>
      </View>

      {/* ── Card Body ─────────────────────────────────────────────────── */}
      <View style={styles.body}>
        {/* Listing type badge: exactly one of these is shown per item */}
        {isPaid ? (
          // Paid listing: show price in green badge (e.g., "₹500")
          <View style={styles.priceBadge}>
            <Text style={styles.priceBadgeText}>
              ₹{Number(item.price).toLocaleString('en-IN')} {/* Indian number format */}
            </Text>
          </View>
        ) : isBorrow ? (
          // Borrow listing: show return duration (e.g., "🔄 Borrow (Return in 7 days)")
          <View style={styles.borrowBadge}>
            <Text style={styles.borrowBadgeText}>🔄 Borrow (Return in {borrowLabel})</Text>
          </View>
        ) : (
          // Free donation: show "🎁 Free Giveaway" badge
          <View style={styles.freeBadge}>
            <Text style={styles.freeBadgeText}>🎁 Free Giveaway</Text>
          </View>
        )}

        {/* Item title (max 2 lines to keep card compact) */}
        <Text style={styles.title} numberOfLines={2}>
          {item.title || 'Untitled listing'}
        </Text>

        {/* Meta line: area name + time since posted */}
        <Text style={styles.metaLine} numberOfLines={1}>
          📍 {areaName} • {getTimeAgo()}
        </Text>

        {/* Donor row: avatar, name, verified badge */}
        <View style={styles.donorRow}>
          {donorAvatar ? (
            // Show donor's profile photo if available
            <Image source={{ uri: donorAvatar }} style={styles.donorAvatarImg} />
          ) : (
            // Fall back to initial letter avatar (first letter of donor's name)
            <View style={styles.donorAvatar}>
              <Text style={styles.donorInitial}>
                {donorName.charAt(0).toUpperCase()} {/* e.g., "A" for "Arpan" */}
              </Text>
            </View>
          )}
          <Text style={styles.donorName} numberOfLines={1}>
            👤 {donorName}
          </Text>
          {/* VerifiedBadge shows ✓ checkmark only if donor's isVerified=true */}
          <VerifiedBadge verified={donorVerified} size={13} />
        </View>
      </View>
    </TouchableOpacity>
  );
};

// =============================================================================
// Styles — Stitch Design System
// =============================================================================

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',       // White card background
    borderRadius: 16,                 // Rounded corners (Stitch design)
    overflow: 'hidden',               // Clip the image to card's rounded corners
    borderWidth: 1,
    borderColor: '#E9EEF4',           // Light gray border
    shadowColor: '#0F172A',           // Slate-900 shadow (dark, subtle)
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,                     // Android shadow
    marginBottom: 12,
  },
  cardGrid: {
    flex: 1,          // Takes equal share of the row in a 2-column grid
    marginHorizontal: 5, // Gap between grid cards
  },
  cardFull: {
    width: '100%',    // Full width for list view
  },
  imageWrap: {
    width: '100%',
    backgroundColor: '#F1F5F9',  // Gray placeholder while image loads
    position: 'relative',        // Required for absolute-positioned overlay badges
  },
  imageWrapGrid: {
    height: 150, // Shorter image for compact grid cards
  },
  imageWrapFull: {
    height: 200, // Taller image for full-width list cards
  },
  image: {
    width: '100%',
    height: '100%',
  },
  distancePill: {
    position: 'absolute',    // Float over the image
    top: 8,
    left: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.95)', // Near-white with slight transparency
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,        // Pill shape
    gap: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  distanceIcon: {
    fontSize: 9,
  },
  distanceText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0F172A',
  },
  photoCountBadge: {
    position: 'absolute',
    top: 34,         // Below the distance pill
    left: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.72)', // Semi-transparent dark
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
  },
  photoCountText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  heartBtn: {
    position: 'absolute',  // Float over the image (top-right corner)
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,      // Perfect circle
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  heartBtnActive: {
    backgroundColor: '#FEE2E2', // Light red background when favorited
  },
  heartIcon: {
    fontSize: 14,
  },
  conditionPill: {
    position: 'absolute', // Float over image (bottom-left)
    bottom: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    // backgroundColor is set dynamically by condStyle.bg
  },
  conditionText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
    // color is set dynamically by condStyle.text
  },
  body: {
    paddingHorizontal: 10,
    paddingTop: 9,
    paddingBottom: 10,
  },
  freeBadge: {
    alignSelf: 'flex-start',   // Don't stretch the badge to full width
    backgroundColor: '#DCFCE7', // Light green background
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
  },
  freeBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#15803D', // Dark green text
    letterSpacing: 0.2,
  },
  borrowBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E0F2FE', // Light blue background
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
  },
  borrowBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#075985', // Dark blue text
    letterSpacing: 0.1,
  },
  priceBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#047857', // Forest green background for price
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
  },
  priceBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF', // White price text on green background
    letterSpacing: 0.2,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',       // Slate-900 — darkest text for item name
    lineHeight: 18,
    minHeight: 36,          // Reserves space for 2 lines (consistent card heights)
    marginBottom: 6,
  },
  metaLine: {
    fontSize: 10.5,
    color: '#64748B',       // Slate-500 — muted gray for metadata
    fontWeight: '600',
    marginBottom: 8,
  },
  donorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9', // Very light separator above donor row
  },
  donorAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,           // Perfect circle avatar
    backgroundColor: '#D1FAE5', // Mint green for initial letter avatars
    alignItems: 'center',
    justifyContent: 'center',
  },
  donorAvatarImg: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#D1FAE5',
  },
  donorInitial: {
    fontSize: 10,
    fontWeight: '900',
    color: '#059669', // Emerald green for the initial letter
  },
  donorName: {
    flex: 1,          // Takes remaining space (pushes verified badge to the right)
    fontSize: 10.5,
    fontWeight: '700',
    color: '#334155', // Slate-700
  },
});

// Export ItemCard as the default export
// Used as: import ItemCard from '../components/ItemCard'
export default ItemCard;
