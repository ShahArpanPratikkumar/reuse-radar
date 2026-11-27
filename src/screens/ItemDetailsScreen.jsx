// =============================================================================
// REUSE RADAR - ITEM DETAILS SCREEN (ItemDetailsScreen.jsx)
// Purpose: Full-detail presentation screen for a reusable campus listing.
// Features:
//   1. Multi-photo carousel with pagination dots & high-res image modal preview
//   2. Direct Connect: Unlocks seller/donor phone & WhatsApp only after active exchange
//   3. Mutual Location Radar: Displays live walking distance & travel time estimate
//   4. Claim / Request modal with customizable student pickup note
//   5. Wishlist alert matching badge & Karma reward points preview
//   6. Native device sharing (SMS, WhatsApp, Social) with app deep linking
//   7. Donor anti-fraud moderation reporting (spam, misleading, prohibited items)
//   8. Listing management controls (Edit, Toggle Status, Delete) for listing donor
// =============================================================================

import React, { useState, useEffect, useContext, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Share,
  Modal,
  TextInput,
  ActivityIndicator,
  StatusBar,
  Dimensions,
  Platform,
  Linking,
  FlatList,
} from 'react-native';
// Clipboard utility for one-tap copying of item ID or donor details
import * as Clipboard from 'expo-clipboard';
// Device GPS location module for real-time walking distance calculation
import * as Location from 'expo-location';
// Global authentication context (provides logged-in user details)
import { AuthContext } from '../context/AuthContext';
// Service for fetching single item details and deleting items
import { itemService } from '../services/itemService';
// Service for submitting claim requests and querying active exchanges
import { requestService } from '../services/requestService';
// Service for favoriting/bookmarking items
import { favoriteService } from '../services/favoriteService';
// Service for reporting fraudulent or prohibited items
import { reportService } from '../services/reportService';
// Color palette constants
import { COLORS } from '../utils/constants';
// Dynamic backend upload URL resolver
import { getImageBaseUrl, resolveImageUri } from '../services/apiConfig';
// Verified student badge UI component
import VerifiedBadge from '../components/VerifiedBadge';

// Screen dimensions for responsive carousel layout
const { width } = Dimensions.get('window');
const IMAGE_BASE_URL = getImageBaseUrl();

// Categorized report reasons for item violations
const ITEM_REPORT_REASONS = [
  'Spam',
  'Inappropriate Content',
  'Misleading Information',
  'Duplicate Listing',
  'Prohibited Item',
  'Scam / Suspicious',
  'Other',
];

// Categorized report reasons for user profile misconduct
const USER_REPORT_REASONS = [
  'Spam',
  'Harassment',
  'Fake Profile',
  'Scam / Fraud',
  'Inappropriate Behavior',
  'Other',
];

// =============================================================================
// MUTUAL LOCATION RADAR HELPERS (DISTANCE & WALKING TIME ESTIMATION)
// =============================================================================

// Extracts [longitude, latitude] GeoJSON array from a person or item object
const coordinatesOf = (person) => {
  const coords = person?.location?.coordinates;
  if (!Array.isArray(coords) || coords.length !== 2) return null;
  const [lng, lat] = coords;
  if (typeof lng !== 'number' || typeof lat !== 'number') return null;
  return [lng, lat];
};

// Computes distance in meters between two coordinates using Haversine formula
const metersBetween = (personA, personB) => {
  const a = coordinatesOf(personA);
  const b = coordinatesOf(personB);
  if (!a || !b) return null;
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
};

// Formats meters into user-friendly campus walking label
const distanceLabel = (meters) => {
  if (meters === null || meters === undefined) return '';
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)}m away on campus`;
  return `${(meters / 1000).toFixed(1)} km away on campus`;
};

// =============================================================================
// MAIN COMPONENT: ItemDetailsScreen
// =============================================================================
const ItemDetailsScreen = ({ route, navigation }) => {
  // Read passed item object or item ID from React Navigation route params
  const paramItem = route.params?.item;
  const itemId = route.params?.itemId || paramItem?._id;

  // Retrieve authenticated user from AuthContext
  const { user } = useContext(AuthContext);

  // Local state for item data
  const [item, setItem] = useState(paramItem || null);

  // Active slide index for multi-image carousel
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  // Loading state (true if fetching item by ID)
  const [loading, setLoading] = useState(!paramItem);

  // Favorite / bookmark state
  const [isFavorited, setIsFavorited] = useState(false);
  const [togglingFav, setTogglingFav] = useState(false);

  // Current user GPS position for distance calculations
  const [userLocation, setUserLocation] = useState(null);

  // Active exchange request with this item (unlocks donor contact info)
  const [activeRequest, setActiveRequest] = useState(null);

  // Identify listing types: paid student marketplace or free borrow
  const isPaidItem = item?.listingType === 'sell' && Number(item?.price) > 0;
  const isBorrowItem = item?.listingType === 'borrow';

  // Request location permission on mount to compute live walking distance
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (loc && loc.coords) {
            setUserLocation(loc.coords);
          }
        }
      } catch (e) {}
    })();
  }, []);

  // Claim Request Modal state
  const [requestModalVisible, setRequestModalVisible] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [hasRequested, setHasRequested] = useState(false);

  // Report & Moderation Modal state
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportType, setReportType] = useState('item'); // 'item' or 'user'
  const [selectedReason, setSelectedReason] = useState(ITEM_REPORT_REASONS[0]);
  const [reportDescription, setReportDescription] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);

  // In-app ephemeral toast notification state
  const [toastMessage, setToastMessage] = useState('');
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Fetch full item details from backend by ID
  const fetchItemDetails = useCallback(async () => {
    if (!itemId) return;
    try {
      const res = await itemService.getItemById(itemId);
      if (res && res.success && res.item) {
        setItem(res.item);
      }
    } catch (err) {
      if (!paramItem) {
        Alert.alert('Notice', err.message || 'Could not load item details.');
      }
    } finally {
      setLoading(false);
    }
  }, [itemId, paramItem]);

  // Check if item is already bookmarked in user's favorites
  const checkInitialFavorite = useCallback(async () => {
    if (!itemId || itemId.startsWith('sample-') || itemId.startsWith('stitch-')) return;
    try {
      const res = await favoriteService.checkFavorite(itemId);
      if (res && res.success) {
        setIsFavorited(res.isFavorite);
      }
    } catch (e) {
      // Background check error ignored
    }
  }, [itemId]);

  // Privacy guard: direct contact details (phone, WhatsApp) are unlocked ONLY
  // if an active exchange request exists for this listing between the two students
  const fetchActiveRequest = useCallback(async () => {
    if (!itemId) return;
    try {
      const res = await requestService.getOutgoingRequests('all');
      const list = res?.requests || [];
      const match = list.find(
        (r) =>
          String(r.item?._id || r.item) === String(itemId) &&
          ['pending', 'accepted', 'completed'].includes(r.status)
      );
      setActiveRequest(match || null);
    } catch (e) {
      setActiveRequest(null);
    }
  }, [itemId]);

  // Load item details, favorite status, and active request on mount
  useEffect(() => {
    fetchItemDetails();
    checkInitialFavorite();
    fetchActiveRequest();
  }, [fetchItemDetails, checkInitialFavorite, fetchActiveRequest]);

  // Toggle item in user favorites with optimistic UI updates
  const handleToggleFavorite = async () => {
    if (togglingFav) return;
    const nextState = !isFavorited;
    setIsFavorited(nextState);
    showToast(nextState ? '❤️ Item saved to favorites' : '🤍 Item removed from favorites');

    if (item?._id && !item._id.startsWith('sample-') && !item._id.startsWith('stitch-')) {
      setTogglingFav(true);
      try {
        if (nextState) {
          await favoriteService.addFavorite(item._id);
        } else {
          await favoriteService.removeFavorite(item._id);
        }
      } catch (err) {
        console.log('[Favorite Toggle Error]', err.message);
        setIsFavorited(!nextState); // Rollback optimistic update on error
        showToast('Could not update favorite');
      } finally {
        setTogglingFav(false);
      }
    }
  };

  // Submit item claim request with student pickup note
  const handleRequestSubmit = async () => {
    if (!item) return;
    // Enforce student phone number requirement for secure coordination
    if (!user?.phone) {
      Alert.alert(
        'Mobile Number Required',
        'Please add your mobile number in your Profile before requesting an item. It is needed to coordinate safe campus handovers.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Update Profile', onPress: () => navigation.navigate('EditProfile') },
        ]
      );
      return;
    }
    setSubmittingRequest(true);
    try {
      const res = await requestService.createRequest(item._id, requestMessage.trim());
      if (res && res.success) {
        setHasRequested(true);
        setRequestModalVisible(false);
        Alert.alert('🎉 Request Submitted!', 'The item owner has been notified and will coordinate pickup with you.');
      }
    } catch (err) {
      Alert.alert('Request Failed', err.message || 'Could not submit item request.');
    } finally {
      setSubmittingRequest(false);
    }
  };

  // Open anti-fraud report modal for item or user profile
  const openReportModal = (type = 'item') => {
    setReportType(type);
    setSelectedReason(type === 'item' ? ITEM_REPORT_REASONS[0] : USER_REPORT_REASONS[0]);
    setReportDescription('');
    setReportModalVisible(true);
  };

  // Submit report to campus moderation team
  const handleSubmitReport = async () => {
    if (!selectedReason) {
      Alert.alert('Validation Error', 'Please select a reason for the report.');
      return;
    }

    setSubmittingReport(true);
    try {
      if (reportType === 'item') {
        const res = await reportService.reportItem(item._id, selectedReason, reportDescription);
        if (res && res.success) {
          setReportModalVisible(false);
          Alert.alert('Report Received', res.message || 'Thank you for helping keep our campus circular community safe.');
        }
      } else {
        const targetUserId = item.donor?._id || item.donor;
        const res = await reportService.reportUser(targetUserId, selectedReason, reportDescription);
        if (res && res.success) {
          setReportModalVisible(false);
          Alert.alert('Report Received', res.message || 'Thank you for reporting. Our moderation team is reviewing this.');
        }
      }
    } catch (err) {
      Alert.alert('Report Notice', err.message || 'Unable to submit report. Please try again.');
    } finally {
      setSubmittingReport(false);
    }
  };

  // Copy unique item ID to clipboard for viva demonstration or manual reference
  const handleCopyItemId = async () => {
    if (!item?._id) return;
    try {
      await Clipboard.setStringAsync(String(item._id));
      showToast('📋 Item ID copied to clipboard');
    } catch (e) {
      Alert.alert('Copy Failed', 'Could not copy the item ID on this device.');
    }
  };

  // Native share sheet (WhatsApp, Telegram, SMS, Email) with deep link
  const handleShare = async () => {
    if (!item) return;
    const priceLine = isPaidItem
      ? `for ₹${Number(item.price).toLocaleString('en-IN')}`
      : isBorrowItem
      ? 'available to borrow'
      : 'available as a free giveaway';
    const deepLink = item._id ? `reuseradar://item/${item._id}` : null;

    try {
      await Share.share({
        message:
          `♻️ ReUse Radar: "${item.title}" is ${priceLine} on campus.` +
          (item.addressText ? `\n📍 ${item.addressText}` : '') +
          (deepLink ? `\n${deepLink}` : ''),
        title: item.title,
        ...(deepLink && Platform.OS === 'ios' ? { url: deepLink } : {}),
      });
    } catch (e) {
      console.log('Share error:', e);
    }
  };

  // Delete listing permanently (Only permitted for listing owner)
  const handleDeleteItem = () => {
    Alert.alert(
      'Delete Listing',
      `Are you sure you want to permanently delete "${item?.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await itemService.deleteItem(item._id);
              Alert.alert('Deleted', 'Item listing deleted successfully.', [
                { text: 'OK', onPress: () => navigation.goBack() },
              ]);
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to delete item.');
            }
          },
        },
      ]
    );
  };

  // Open direct real-time in-app chat with the donor
  const openChat = () => {
    if (!item) return;
    const donorId = item.donor?._id || item.donor;
    if (!donorId) {
      Alert.alert('Chat Unavailable', 'This listing has no donor contact details yet.');
      return;
    }

    navigation.navigate('Chat', {
      itemId: item._id,
      recipientId: donorId,
      recipientName: item.donor?.name || 'Item Donor',
      recipientVerified: Boolean(item.donor?.isVerified),
      itemTitle: item.title,
      itemImage: item.images?.[0],
    });
  };

  // Open the public student trust & anti-fraud profile of the donor
  const openDonorProfile = () => {
    const donorId = item?.donor?._id || item?.donor;
    if (!donorId) return;
    navigation.navigate('UserProfile', {
      userId: donorId,
      userName: item?.donor?.name || 'Campus Student',
    });
  };

  // Resolve every listing photo into an absolute URI for the carousel
  const FALLBACK_IMAGE =
    'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&w=800&q=80';
  const imageUris = (Array.isArray(item?.images) ? item.images : [])
    .filter((path) => typeof path === 'string' && path.trim())
    .slice(0, 5)
    .map((path) => resolveImageUri(path))
    .filter(Boolean);
  if (imageUris.length === 0) imageUris.push(FALLBACK_IMAGE);
  const carouselWidth = width - 32;

  const isOwner = user && item?.donor && (user._id === item.donor._id || user._id === item.donor);

  // ── Direct Connect (Buyer ⇄ Seller) ──
  const contactPerson = activeRequest ? (activeRequest.receiver || item?.donor || null) : null;
  const rawContactPhone = String(contactPerson?.phone || '').trim();
  const contactDigits = rawContactPhone.replace(/[^\d]/g, '');
  const contactPhonePretty = contactDigits
    ? `+91 ${contactDigits.slice(-10, -5)} ${contactDigits.slice(-5)}`
    : '';
  const mutualDistance = distanceLabel(metersBetween(activeRequest?.sender, contactPerson));

  const handleCallContact = async () => {
    if (!contactDigits) {
      Alert.alert('No Number', 'This student has not added a contact number yet.');
      return;
    }
    const tel = contactDigits.length === 10 ? `+91${contactDigits}` : `+${contactDigits}`;
    try {
      await Linking.openURL(`tel:${tel}`);
    } catch {
      Alert.alert('Call Failed', 'Your device could not place this call.');
    }
  };

  const handleWhatsAppContact = async () => {
    if (!contactDigits) {
      Alert.alert('No Number', 'This student has not added a contact number yet.');
      return;
    }
    const wa = contactDigits.length === 10 ? `91${contactDigits}` : contactDigits;
    try {
      await Linking.openURL(`whatsapp://send?phone=${wa}`);
    } catch {
      Linking.openURL(`https://wa.me/${wa}`).catch(() =>
        Alert.alert('WhatsApp Unavailable', 'WhatsApp could not be opened on this device.')
      );
    }
  };

  const handleDirections = () => {
    const coords = Array.isArray(item?.location?.coordinates) ? item.location.coordinates : null;
    if (!coords || coords.length !== 2) {
      Alert.alert('Directions Unavailable', 'Pickup coordinates are not available for this listing.');
      return;
    }
    const [lng, lat] = coords;
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`).catch(() =>
      Alert.alert('Maps Unavailable', 'Could not open Google Maps on this device.')
    );
  };

  // Real Distance & Walk Estimate calculation from device GPS
  let distanceDisplay = item?.addressText ? item.addressText.split(',')[0].trim() : 'Pickup Location';
  let walkEstimate = '';
  if (userLocation && item?.location?.coordinates && Array.isArray(item.location.coordinates)) {
    const lat1 = userLocation.latitude;
    const lon1 = userLocation.longitude;
    const lon2 = item.location.coordinates[0];
    const lat2 = item.location.coordinates[1];
    if (!isNaN(lat1) && !isNaN(lon1) && !isNaN(lat2) && !isNaN(lon2)) {
      const R = 6371;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      distanceDisplay = `${dist < 1 ? Math.round(dist * 1000) + 'm' : dist.toFixed(1) + ' km'} from you`;
      const walkMin = Math.round(dist * 12);
      walkEstimate = dist < 5 ? `~${walkMin} min walk` : `~${Math.round(dist * 2.5)} min drive`;
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F0FDF4" />

      {/* ── 1. Top Bar ── */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>

        <View style={styles.topBarTitleRow}>
          <View style={styles.miniLogoBox}>
            <Text style={styles.miniLogoLetter}>R</Text>
          </View>
          <Text style={styles.topBarTitle}>Item Details</Text>
        </View>

        <View style={styles.topBarActions}>
          <TouchableOpacity style={styles.iconActionBtn} onPress={handleShare}>
            <Text style={styles.iconActionText}>↗</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconActionBtn, isFavorited && styles.iconActionBtnFav]}
            onPress={handleToggleFavorite}
          >
            <Text style={styles.iconActionText}>{isFavorited ? '❤️' : '🤍'}</Text>
          </TouchableOpacity>
          {isOwner ? (
            <TouchableOpacity
              style={styles.iconActionBtn}
              onPress={() => navigation.navigate('AddItem', { itemToEdit: item })}
            >
              <Text style={styles.iconActionText}>✏️</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.iconActionBtn}
              onPress={() => openReportModal('item')}
            >
              <Text style={styles.iconActionText}>🚩</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Toast Feedback */}
      {toastMessage ? (
        <View style={styles.toastBox}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      ) : null}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* ── 2. Swipeable Photo Carousel (up to 5 photos) ── */}
        <View style={styles.heroImageContainer}>
          <FlatList
            data={imageUris}
            keyExtractor={(uri, index) => `${uri}-${index}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) => {
              const offset = event.nativeEvent.contentOffset.x;
              const nextIndex = Math.round(offset / carouselWidth);
              setActiveImageIndex(
                Math.min(Math.max(nextIndex, 0), imageUris.length - 1)
              );
            }}
            renderItem={({ item: uri }) => (
              <Image
                source={{ uri }}
                style={[styles.heroImage, { width: carouselWidth }]}
                resizeMode="cover"
              />
            )}
          />

          {/* Floating Available Now Badge */}
          <View style={styles.availableBadge}>
            <View style={styles.greenPulseDot} />
            <Text style={styles.availableBadgeText}>AVAILABLE NOW</Text>
          </View>

          {/* Image counter */}
          {imageUris.length > 1 ? (
            <View style={styles.imageCounterBadge}>
              <Text style={styles.imageCounterText}>
                {activeImageIndex + 1} / {imageUris.length}
              </Text>
            </View>
          ) : null}

          {/* Pagination dots */}
          {imageUris.length > 1 ? (
            <View style={styles.dotsRow}>
              {imageUris.map((uri, index) => (
                <View
                  key={`dot-${index}`}
                  style={[styles.dot, index === activeImageIndex && styles.dotActive]}
                />
              ))}
            </View>
          ) : null}
        </View>

        {/* ── 3. Category & Condition Badges Row ── */}
        <View style={styles.badgesRow}>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryBadgeText}>
              {item?.category || 'Furniture & Living'}
            </Text>
          </View>
          <View style={styles.conditionBadge}>
            <Text style={styles.conditionBadgeText}>
              ✓ {item?.condition || 'Like New'}
            </Text>
          </View>
          {isPaidItem ? (
            <View style={styles.priceTag}>
              <Text style={styles.priceTagText}>
                ₹{Number(item.price).toLocaleString('en-IN')}
              </Text>
            </View>
          ) : null}
          <View style={styles.freeReuseBadge}>
            <Text style={styles.freeReuseBadgeText}>
              {isPaidItem ? '🛍️ For Sale' : isBorrowItem ? '🔄 To Borrow' : '🛡️ Free Reuse'}
            </Text>
          </View>
        </View>

        {/* ── 4. Item Title & Listing Meta ── */}
        <Text style={styles.itemTitle}>
          {item?.title || 'Solid Teak Wooden Study Table'}
        </Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaTimeId}>
            🕒 Listed 42 minutes ago • ID #RAD-{item?._id?.slice(-4) || '8821'}
          </Text>
          {item?._id ? (
            <TouchableOpacity
              style={styles.copyIdBtn}
              onPress={handleCopyItemId}
              activeOpacity={0.8}
            >
              <Text style={styles.copyIdText}>📋 Copy ID</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* ── 5. Location Card with Mini Map Preview ── */}
        <View style={styles.locationCard}>
          <View style={styles.locationHeaderRow}>
            <View style={styles.locationPinIconBox}>
              <Text style={styles.locationPinEmoji}>🧭</Text>
            </View>
            <View style={styles.locationTexts}>
              <Text style={styles.locationDistanceTitle}>{distanceDisplay}</Text>
              <Text style={styles.locationSubText}>
                {item?.addressText || 'Campus Area'}
              </Text>
            </View>
            {walkEstimate ? (
              <View style={styles.walkTimeBadge}>
                <Text style={styles.walkTimeText}>{walkEstimate}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.miniMapGraphic}>
            <View style={styles.miniMapRing} />
            <Text style={styles.miniMapCenterPin}>📍</Text>
            <View style={styles.exactPickupPill}>
              <Text style={styles.exactPickupText}>📍 Exact pickup shared upon request</Text>
            </View>
          </View>
        </View>

        {/* ── 6. Giver Profile Card with Report User Option ── */}
        <View style={styles.giverCard}>
          <View style={styles.giverMainRow}>
            <TouchableOpacity
              style={styles.giverAvatarContainer}
              onPress={openDonorProfile}
              activeOpacity={0.8}
            >
              <View style={styles.giverAvatarCircle}>
                <Text style={styles.giverAvatarInitial}>
                  {(item?.donor?.name || 'P').charAt(0).toUpperCase()}
                </Text>
              </View>
              {item?.donor?.isVerified ? (
                <View style={styles.verifiedCheckBadge}>
                  <Text style={styles.verifiedCheckText}>✓</Text>
                </View>
              ) : null}
            </TouchableOpacity>

            <View style={styles.giverInfoColumn}>
              <View style={styles.giverNameRow}>
                <TouchableOpacity onPress={openDonorProfile} activeOpacity={0.7}>
                  <Text style={styles.giverName} numberOfLines={1}>
                    {item?.donor?.name || 'Priya Patel'}
                  </Text>
                </TouchableOpacity>
                <VerifiedBadge
                  verified={Boolean(item?.donor?.isVerified)}
                  size={14}
                  showLabel
                />
              </View>
              <Text style={styles.giverRole}>Community Hero • Level 4 Giver</Text>
              <Text style={styles.giverMemberSince}>Member since Mar 2023</Text>
            </View>

            <View style={styles.giverRatingBox}>
              <Text style={styles.giverRatingStar}>⭐ 4.9</Text>
              <Text style={styles.giverReusesCount}>34 items gifted</Text>
            </View>
          </View>

          {/* Verification Badges & Report User Link */}
          <View style={styles.verificationRow}>
            {item?.donor?.isVerified ? (
              <View style={styles.verifBadge}>
                <Text style={styles.verifBadgeText}>🛡️ ID Verified</Text>
              </View>
            ) : null}
            <View style={styles.verifBadge}>
              <Text style={styles.verifBadgeText}>📱 Phone</Text>
            </View>
            <View style={styles.verifBadge}>
              <Text style={styles.verifBadgeText}>⚡ Fast Reply</Text>
            </View>

            {!isOwner && (
              <TouchableOpacity
                style={styles.reportUserLinkBtn}
                onPress={() => openReportModal('user')}
              >
                <Text style={styles.reportUserLinkText}>🚩 Report</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── 6b. Direct Connect — phone + mutual location radar (request gated) ── */}
        {!isOwner && activeRequest ? (
          <View style={styles.connectCard}>
            <View style={styles.connectHeaderRow}>
              <Text style={styles.connectTitle}>🤝 Direct Connect</Text>
              {mutualDistance ? (
                <View style={styles.connectDistPill}>
                  <Text style={styles.connectDistText}>📍 {mutualDistance}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.connectNameRow}>
              <Text style={styles.connectName} numberOfLines={1}>
                {contactPerson?.name || item?.donor?.name || 'Campus Member'}
              </Text>
              <VerifiedBadge verified={Boolean(contactPerson?.isVerified)} size={13} />
            </View>

            <Text style={styles.connectMeta}>
              🎓 {contactPerson?.department || 'Student'}
              {' • '}
              🏫 {contactPerson?.addressName || item?.addressText || 'Campus Community'}
            </Text>

            {contactPhonePretty ? (
              <Text style={styles.connectPhone}>📱 {contactPhonePretty}</Text>
            ) : (
              <Text style={styles.connectPhoneMuted}>📱 Contact number not shared yet</Text>
            )}

            <View style={styles.connectActionsRow}>
              <TouchableOpacity
                style={[styles.connectCallBtn, !contactPhonePretty && styles.connectBtnDisabled]}
                onPress={handleCallContact}
                disabled={!contactPhonePretty}
                activeOpacity={0.85}
              >
                <Text style={styles.connectCallText}>📞 Call</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.connectWaBtn, !contactPhonePretty && styles.connectBtnDisabled]}
                onPress={handleWhatsAppContact}
                disabled={!contactPhonePretty}
                activeOpacity={0.85}
              >
                <Text style={styles.connectWaText}>💬 WhatsApp</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.connectDirBtn}
                onPress={handleDirections}
                activeOpacity={0.85}
              >
                <Text style={styles.connectDirText}>🗺️ Directions</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : !isOwner ? (
          <View style={styles.connectLockedCard}>
            <Text style={styles.connectLockedText}>
              🔒 Contact number and exact pickup location unlock as soon as you have an active
              request on this item.
            </Text>
          </View>
        ) : null}

        {/* ── 7. Item Story & Note ── */}
        <View style={styles.storySection}>
          <Text style={styles.sectionHeaderTitle}>Item Story & Note</Text>
          <View style={styles.storyQuoteBox}>
            <Text style={styles.storyQuoteText}>
              "{item?.story ||
                item?.description ||
                'Moving out for master studies abroad. This study table was my companion for 3 years, perfectly sturdy with 2 smooth drawers. Free to anyone who will take good care of it!'}"
            </Text>
          </View>
        </View>

        {/* ── 8. Details & Specs 2x2 Grid ── */}
        <View style={styles.specsSection}>
          <Text style={styles.sectionHeaderTitle}>Details & Specs</Text>
          <View style={styles.specsGrid}>
            <View style={styles.specBox}>
              <Text style={styles.specLabel}>Dimensions</Text>
              <Text style={styles.specValue}>
                {item?.specs?.dimensions || '120 x 60 x 75 cm'}
              </Text>
            </View>
            <View style={styles.specBox}>
              <Text style={styles.specLabel}>Material</Text>
              <Text style={styles.specValue}>
                {item?.specs?.material || 'Reclaimed Teak'}
              </Text>
            </View>
            <View style={styles.specBox}>
              <Text style={styles.specLabel}>Weight Approx</Text>
              <Text style={styles.specValue}>
                {item?.specs?.weight || '~18 kg (Sturdy)'}
              </Text>
            </View>
            <View style={styles.specBox}>
              <Text style={styles.specLabel}>Pickup Deadline</Text>
              <Text style={[styles.specValue, { color: '#DC2626' }]}>
                Before Sunday 8 PM
              </Text>
            </View>
          </View>
        </View>

        {/* ── 9. Pickup Preference Box ── */}
        <View style={styles.preferenceCard}>
          <Text style={styles.preferenceIcon}>🚚</Text>
          <View style={styles.preferenceTextContainer}>
            <Text style={styles.preferenceTitle}>Pickup Preference</Text>
            <Text style={styles.preferenceDesc}>
              Self-pickup required. 2nd floor with wide service elevator available. Can easily fit in an auto-rickshaw or small hatchback with folded seats.
            </Text>
          </View>
        </View>

        {/* ── 10. ReUse Radar Safety Promise Box ── */}
        <View style={styles.safetyCard}>
          <Text style={styles.safetyIcon}>🛡️</Text>
          <View style={styles.safetyTextContainer}>
            <Text style={styles.safetyTitle}>ReUse Radar Safety Promise</Text>
            <Text style={styles.safetyDesc}>
              Items here are completely zero-cost. Never send advance deposits for transport. Chat exclusively inside the app for pickup coordinates.
            </Text>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── 11. Fixed Bottom Action Bar ── */}
      <View style={styles.fixedBottomBar}>
        {isOwner ? (
          <View style={styles.ownerBottomBar}>
            <TouchableOpacity
              style={styles.ownerEditBtn}
              onPress={() => navigation.navigate('AddItem', { itemToEdit: item })}
              activeOpacity={0.85}
            >
              <Text style={styles.ownerEditBtnText}>✏️ Edit Listing</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.ownerDeleteBtn}
              onPress={handleDeleteItem}
              activeOpacity={0.85}
            >
              <Text style={styles.ownerDeleteBtnText}>🗑️ Delete</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TouchableOpacity
              style={styles.messageDonorBtn}
              onPress={openChat}
              activeOpacity={0.85}
            >
              <Text style={styles.messageDonorBtnText}>💬 Message Donor</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.requestBtn,
                hasRequested && styles.requestBtnDisabled,
              ]}
              onPress={() => {
                if (!hasRequested) {
                  setRequestModalVisible(true);
                }
              }}
              disabled={hasRequested}
              activeOpacity={0.85}
            >
              <Text style={styles.requestBtnText}>
                {hasRequested
                  ? '✓ Requested'
                  : isPaidItem
                  ? 'Request to Buy 💰'
                  : isBorrowItem
                  ? 'Request to Borrow 🔄'
                  : 'Claim Free Item 🎁'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ── Request Modal ── */}
      <Modal visible={requestModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Request This Item</Text>
            <Text style={styles.modalSub}>
              Write a short polite note to the owner explaining when you can pick up the item.
            </Text>

            <TextInput
              style={styles.modalTextInput}
              placeholder="e.g. Hi! I am a student living nearby and can pick this up tomorrow evening."
              placeholderTextColor="#94A3B8"
              multiline
              numberOfLines={4}
              value={requestMessage}
              onChangeText={setRequestMessage}
            />

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setRequestModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={handleRequestSubmit}
                disabled={submittingRequest}
              >
                {submittingRequest ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>Submit Request</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Report Modal (Feature 22) ── */}
      <Modal visible={reportModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.reportModalHeader}>
              <Text style={styles.reportModalBadge}>
                {reportType === 'item' ? '🚩 REPORT LISTING' : '👤 REPORT USER'}
              </Text>
              <TouchableOpacity onPress={() => setReportModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalTitle}>
              {reportType === 'item' ? 'Report Inappropriate Listing' : 'Report User Account'}
            </Text>
            <Text style={styles.modalSub}>
              Select the reason that best describes the issue. Reports are reviewed by our campus safety team.
            </Text>

            {/* Reason Selection Chips */}
            <Text style={styles.inputGroupLabel}>REASON *</Text>
            <View style={styles.reasonChipsWrap}>
              {(reportType === 'item' ? ITEM_REPORT_REASONS : USER_REPORT_REASONS).map((reason) => (
                <TouchableOpacity
                  key={reason}
                  style={[
                    styles.reasonChip,
                    selectedReason === reason && styles.reasonChipSelected,
                  ]}
                  onPress={() => setSelectedReason(reason)}
                >
                  <Text
                    style={[
                      styles.reasonChipText,
                      selectedReason === reason && styles.reasonChipTextSelected,
                    ]}
                  >
                    {reason}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Optional Description */}
            <Text style={styles.inputGroupLabel}>ADDITIONAL DETAILS (OPTIONAL)</Text>
            <TextInput
              style={styles.reportTextInput}
              placeholder="Explain any suspicious behavior, broken rules, or safety concerns..."
              placeholderTextColor="#94A3B8"
              multiline
              numberOfLines={3}
              value={reportDescription}
              onChangeText={setReportDescription}
            />

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setReportModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.reportSubmitBtn}
                onPress={handleSubmitReport}
                disabled={submittingReport}
              >
                {submittingReport ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.reportSubmitText}>Submit Report</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0FDF4',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    backgroundColor: '#F0FDF4',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  backBtnText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#064E3B',
  },
  topBarTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniLogoBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniLogoLetter: {
    color: '#BEF264',
    fontSize: 13,
    fontWeight: '900',
  },
  topBarTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#064E3B',
  },
  topBarActions: {
    flexDirection: 'row',
    gap: 6,
  },
  iconActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  iconActionBtnFav: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
  },
  iconActionText: {
    fontSize: 15,
    color: '#064E3B',
  },
  toastBox: {
    position: 'absolute',
    top: 96,
    alignSelf: 'center',
    backgroundColor: '#064E3B',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 99,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  heroImageContainer: {
    width: '100%',
    height: 250,
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#E2E8F0',
    marginBottom: 16,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  availableBadge: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  greenPulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#059669',
  },
  availableBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#064E3B',
    letterSpacing: 0.5,
  },
  imageCounterBadge: {
    position: 'absolute',
    right: 12,
    bottom: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  imageCounterText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  dotsRow: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  dotActive: {
    width: 20,
    backgroundColor: '#059669',
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  categoryBadge: {
    backgroundColor: '#E6F4EA',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#064E3B',
  },
  conditionBadge: {
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  conditionBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F766E',
  },
  freeReuseBadge: {
    backgroundColor: '#BEF264',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  freeReuseBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#14532D',
  },
  priceTag: {
    backgroundColor: '#047857',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  priceTagText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  itemTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 30,
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 16,
  },
  metaTimeId: {
    flex: 1,
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  copyIdBtn: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  copyIdText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#065F46',
  },
  locationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    marginBottom: 16,
  },
  locationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  locationPinIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  locationPinEmoji: {
    fontSize: 18,
  },
  locationTexts: {
    flex: 1,
  },
  locationDistanceTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  locationSubText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  walkTimeBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  walkTimeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#166534',
  },
  miniMapGraphic: {
    height: 90,
    backgroundColor: '#D1FAE5',
    borderRadius: 12,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  miniMapRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1,
    borderColor: 'rgba(5,150,105,0.2)',
    position: 'absolute',
  },
  miniMapCenterPin: {
    fontSize: 22,
    marginBottom: 4,
  },
  exactPickupPill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  exactPickupText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#064E3B',
  },
  giverCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    marginBottom: 16,
  },
  giverMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  giverAvatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  giverAvatarCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#059669',
  },
  giverAvatarInitial: {
    fontSize: 22,
    fontWeight: '800',
    color: '#064E3B',
  },
  verifiedCheckBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  verifiedCheckText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '900',
  },
  giverInfoColumn: {
    flex: 1,
  },
  giverNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  giverName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  giverRole: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '700',
    marginTop: 2,
  },
  giverMemberSince: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 1,
  },
  giverRatingBox: {
    alignItems: 'flex-end',
  },
  giverRatingStar: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  giverReusesCount: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  verificationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  verifBadge: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  verifBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#064E3B',
  },
  reportUserLinkBtn: {
    marginLeft: 'auto',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
  },
  reportUserLinkText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#DC2626',
  },
  storySection: {
    marginBottom: 16,
  },
  sectionHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  storyQuoteBox: {
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#059669',
  },
  storyQuoteText: {
    fontSize: 13,
    color: '#064E3B',
    lineHeight: 20,
    fontStyle: 'italic',
  },
  specsSection: {
    marginBottom: 16,
  },
  specsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  specBox: {
    width: (width - 40) / 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  specLabel: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  specValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 4,
  },
  preferenceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  preferenceIcon: {
    fontSize: 22,
  },
  preferenceTextContainer: {
    flex: 1,
  },
  preferenceTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  preferenceDesc: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 16,
    marginTop: 2,
  },
  safetyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  safetyIcon: {
    fontSize: 22,
  },
  safetyTextContainer: {
    flex: 1,
  },
  safetyTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  safetyDesc: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 16,
    marginTop: 2,
  },
  fixedBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    flexDirection: 'row',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 8,
  },
  ownerBottomBar: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  ownerEditBtn: {
    flex: 2,
    height: 50,
    borderRadius: 16,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerEditBtnText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#BEF264',
  },
  ownerDeleteBtn: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerDeleteBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#DC2626',
  },
  messageDonorBtn: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#059669',
  },
  messageDonorBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#064E3B',
  },
  requestBtn: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  requestBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  requestBtnOwner: {
    backgroundColor: '#64748B',
  },
  requestBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 4,
  },
  modalSub: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 14,
    lineHeight: 16,
  },
  modalTextInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    padding: 12,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    textAlignVertical: 'top',
    height: 100,
    marginBottom: 16,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  modalCancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  modalSubmitBtn: {
    flex: 2,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubmitText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Report Modal specific
  reportModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reportModalBadge: {
    fontSize: 10,
    fontWeight: '900',
    color: '#DC2626',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    letterSpacing: 0.5,
  },
  modalCloseText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#64748B',
    padding: 4,
  },
  inputGroupLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  reasonChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  reasonChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  reasonChipSelected: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  reasonChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  reasonChipTextSelected: {
    color: '#FFFFFF',
  },
  reportTextInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    padding: 10,
    fontSize: 12,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    textAlignVertical: 'top',
    height: 70,
    marginBottom: 10,
  },
  reportSubmitBtn: {
    flex: 2,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportSubmitText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Chat Modal
  chatModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  chatModalContent: {
    height: '75%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  chatHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  chatCloseIcon: {
    fontSize: 18,
    fontWeight: '800',
    color: '#64748B',
    padding: 4,
  },
  chatScrollView: {
    flex: 1,
    marginVertical: 10,
  },
  chatContentScroll: {
    paddingVertical: 10,
  },
  noMessagesText: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 20,
  },
  chatBubble: {
    maxWidth: '80%',
    padding: 10,
    borderRadius: 14,
    marginBottom: 8,
  },
  chatBubbleMe: {
    alignSelf: 'flex-end',
    backgroundColor: '#064E3B',
  },
  chatBubbleOther: {
    alignSelf: 'flex-start',
    backgroundColor: '#F1F5F9',
  },
  chatBubbleText: {
    fontSize: 13,
    color: '#0F172A',
  },
  chatInputRow: {
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 10,
  },
  chatInput: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 16,
    fontSize: 13,
    color: '#0F172A',
  },
  chatSendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatSendBtnText: {
    color: '#BEF264',
    fontSize: 16,
    fontWeight: '900',
  },

  // ── Direct Connect card ──
  connectCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  connectHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  connectTitle: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#064E3B',
    letterSpacing: 0.4,
  },
  connectDistPill: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  connectDistText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#166534',
  },
  connectNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  connectName: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    flexShrink: 1,
  },
  connectMeta: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
    marginTop: 4,
    lineHeight: 16,
  },
  connectPhone: {
    fontSize: 13,
    fontWeight: '800',
    color: '#075985',
    marginTop: 6,
    letterSpacing: 0.3,
  },
  connectPhoneMuted: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 6,
  },
  connectActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  connectBtnDisabled: {
    opacity: 0.5,
  },
  connectCallBtn: {
    flex: 1,
    backgroundColor: '#064E3B',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  connectCallText: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#BEF264',
  },
  connectWaBtn: {
    flex: 1,
    backgroundColor: '#25D366',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  connectWaText: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  connectDirBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#7DD3FC',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  connectDirText: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#075985',
  },
  connectLockedCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  connectLockedText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    lineHeight: 15,
  },
});

export default ItemDetailsScreen;
