// =============================================================================
// REUSE RADAR - EXPLORE / RADAR DISCOVERY SCREEN (ExploreScreen.jsx)
// Purpose: Interactive campus circular discovery screen.
// Features:
//   1. Live native GPS & Web Geolocation resolution
//   2. Dual view modes: Interactive Radar Map vs 2-Column Catalog Grid
//   3. Radius selector (1km, 5km, 10km, 25km) with dynamic MapView zoom
//   4. Campus Wishlist / Requests feed with urgency indicators and direct "Help Out"
//   5. Price filters for student paid marketplace (Free, Under ₹500, Books & Gadgets)
//   6. Verified student filter to restrict listings to authenticated student badges
//   7. Category & condition filter modal with real-time reactive refetching
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  StatusBar,
  Dimensions,
  Modal,
  Alert,
} from 'react-native';
import { AuthContext } from '../context/AuthContext';
// Expo Location module for device GPS coordinates and reverse geocoding
import * as Location from 'expo-location';
// Item service for fetching nearby items and paginated item listings
import { itemService } from '../services/itemService';
// Wishlist service for campus request feed
import { wishlistService } from '../services/wishlistService';
// Dynamic backend upload base URL resolver
import { getImageBaseUrl } from '../services/apiConfig';
// Verified badge component for student profile authenticity
import VerifiedBadge from '../components/VerifiedBadge';
// Reusable item card component for grid and list views
import ItemCard from '../components/ItemCard';
// Loading spinner component
import LoadingSpinner from '../components/LoadingSpinner';
// Empty state component when no items are in radar radius
import EmptyState from '../components/EmptyState';
// Native interactive radar map component
import RadarMap from '../components/RadarMap';
// Project design tokens and constants
import {
  COLORS,
  CATEGORIES,
  CONDITIONS,
  RADIUS_OPTIONS,
  DEFAULT_COORDINATES,
} from '../utils/constants';
// React Native platform detector (Android / iOS / Web)
import { Platform } from 'react-native';

// Resolve image base URL for local or production uploads
const IMAGE_BASE_URL = getImageBaseUrl();

// Quick price filters for the paid marketplace (client-side over fetched items)
const SALE_CATEGORIES = ['Books', 'Electronics', 'Study Material'];

// Helper to identify whether an item has a paid selling price
const isPaidListing = (item) =>
  item?.listingType === 'sell' && Number(item?.price) > 0;

// Filter definitions for marketplace pricing
const PRICE_FILTERS = [
  { key: 'all', label: 'All Items', match: () => true },
  { key: 'free', label: 'Free Items Only', match: (item) => !isPaidListing(item) },
  {
    key: 'under500',
    label: 'Under ₹500',
    match: (item) => isPaidListing(item) && Number(item.price) < 500,
  },
  {
    key: 'sale',
    label: 'Books & Gadgets for Sale',
    match: (item) => isPaidListing(item) && SALE_CATEGORIES.includes(item.category),
  },
];

// Browser geolocation helper for Web Expo preview fallback
const getWebPosition = () =>
  new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      (error) => reject(error),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 }
    );
  });

// Client-side Haversine mathematical distance formula (kilometers)
const calculateHaversineKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Returns backend-calculated distance or computes Haversine locally from student GPS
const getItemDistanceKm = (item, userLocation) => {
  if (item?.distanceKm !== undefined && item?.distanceKm !== null) {
    return Number(item.distanceKm);
  }
  if (!userLocation || !Array.isArray(item?.location?.coordinates)) return null;
  const [lng, lat] = item.location.coordinates;
  if (Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) return null;
  return calculateHaversineKm(userLocation.latitude, userLocation.longitude, Number(lat), Number(lng));
};

// =============================================================================
// MAIN COMPONENT: ExploreScreen
// =============================================================================
const ExploreScreen = ({ route, navigation }) => {
  const { user } = useContext(AuthContext);
  // Read initial search query if navigated from another screen (e.g. HomeScreen search)
  const initialSearch = route.params?.initialSearch || '';

  // Local state for live search input
  const [search, setSearch] = useState(initialSearch);

  // Active top-level tab: 'nearby' (radar items) or 'requests' (campus wishlist)
  const [feedTab, setFeedTab] = useState(
    route.params?.openRequestsFeed ? 'requests' : 'nearby'
  );

  // Presentation view mode: 'radar' (native map view) or 'list' (2-column card grid)
  const [viewMode, setViewMode] = useState('radar');

  // Filter toggle for only verified students with authentic campus badges
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  // Campus requests wishlist state
  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [dismissedRequestIds, setDismissedRequestIds] = useState([]);
  const [deletingRequestId, setDeletingRequestId] = useState(null);

  // Radar search radius in kilometers (1, 5, 10, or 25 km)
  const [selectedRadius, setSelectedRadius] = useState(5);

  // Selected category filter chip (All, Books, Electronics, etc.)
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Selected item condition filter (All, New, Like New, Good, Fair)
  const [selectedCondition, setSelectedCondition] = useState('All');

  // Item highlighted and focused on the radar map
  const [selectedItemForMap, setSelectedItemForMap] = useState(null);

  // Array of items discovered within radar radius
  const [items, setItems] = useState([]);

  // Data fetching loading indicator state
  const [loading, setLoading] = useState(true);

  // Visibility state for the filter modal bottom sheet
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  // User's current GPS location coordinates {latitude, longitude}
  const [userLocation, setUserLocation] = useState(null);

  // Human-readable reverse geocoded city/neighborhood name
  const [locationName, setLocationName] = useState('Detecting GPS...');

  // Signal increment to trigger recentering map camera to user GPS position
  const [recenterSignal, setRecenterSignal] = useState(0);

  // Price filter for student paid marketplace ('all', 'free', 'under500', 'sale')
  const [priceFilter, setPriceFilter] = useState('all');

  // Memoized client-side filtering over fetched items based on selected price chip
  const displayedItems = useMemo(() => {
    const filter = PRICE_FILTERS.find((f) => f.key === priceFilter) || PRICE_FILTERS[0];
    return items.filter(filter.match);
  }, [items, priceFilter]);

  // Request location permissions and query device GPS coordinates
  const fetchLocation = useCallback(async () => {
    // Web fallback using browser navigator.geolocation
    if (Platform.OS === 'web') {
      try {
        const coords = await getWebPosition();
        setUserLocation(coords);
        setLocationName(`${coords.latitude.toFixed(2)}, ${coords.longitude.toFixed(2)}`);
      } catch (err) {
        console.log('[ExploreScreen Web Location] error:', err?.message);
        setUserLocation(null);
        setLocationName('Location off (tap)');
      }
      return;
    }

    // Native mobile execution (iOS / Android)
    try {
      // Check if system location services (GPS toggle) are turned on
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setLocationName('GPS turned off');
        setUserLocation(null);
        return;
      }

      // Check existing foreground location permissions
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        // Prompt student to allow location access
        const req = await Location.requestForegroundPermissionsAsync();
        status = req.status;
      }

      // If student granted permission, query current balanced GPS fix
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (loc && loc.coords) {
          const coords = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };
          setUserLocation(coords);

          // Reverse geocode GPS coordinates to human-readable campus/city name
          try {
            const geocode = await Location.reverseGeocodeAsync(coords);
            if (geocode && geocode.length > 0) {
              const place = geocode[0];
              const city = place.city || place.subregion || place.district;
              const region = place.region || place.country;
              setLocationName(city ? `${city}${region ? `, ${region}` : ''}` : 'Local Area');
            }
          } catch (e) {
            setLocationName(`${coords.latitude.toFixed(2)}, ${coords.longitude.toFixed(2)}`);
          }
        }
      } else {
        setUserLocation(null);
        setLocationName('Location off (tap)');
      }
    } catch (err) {
      console.log('[ExploreScreen Location] error:', err.message);
      setUserLocation(null);
      setLocationName('Location unavailable');
    }
  }, []);

  // Fetch student location on initial mount
  useEffect(() => {
    fetchLocation();
  }, [fetchLocation]);

  // Deep link from the Request Item screen straight into the requests feed
  useEffect(() => {
    if (route.params?.openRequestsFeed) {
      setFeedTab('requests');
      fetchWishlistFeed();
    }
  }, [route.params?.openRequestsFeed, route.params?.refreshAt]);

  // ===========================================================================
  // DATA FETCHING: CAMPUS WISHLIST REQUESTS FEED
  // ===========================================================================
  const fetchWishlistFeed = useCallback(async () => {
    setRequestsLoading(true);
    try {
      // Query backend wishlist feed with optional category and search filters
      const res = await wishlistService.getWishlistFeed({
        status: 'active',
        category: selectedCategory === 'All' ? undefined : selectedCategory,
        search: search.trim() || undefined,
      });
      // Store wishlist items in local state
      setRequests(res && res.success ? res.wishlists || [] : []);
    } catch (e) {
      console.log('[ExploreScreen] wishlist feed error:', e.message);
      setRequests([]);
    } finally {
      setRequestsLoading(false);
    }
  }, [selectedCategory, search]);

  // Refetch wishlist feed whenever requests tab is selected
  useEffect(() => {
    if (feedTab === 'requests') fetchWishlistFeed();
  }, [feedTab, fetchWishlistFeed]);

  // ===========================================================================
  // DATA FETCHING: NEARBY RADAR ITEMS / CATALOG
  // ===========================================================================
  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      let res;
      // If student GPS coordinates are available, query geospatial radar API
      if (userLocation && userLocation.latitude && userLocation.longitude) {
        res = await itemService.getNearbyItems(
          userLocation.latitude,
          userLocation.longitude,
          selectedRadius,
          selectedCategory === 'All' ? undefined : selectedCategory,
          search.trim() || undefined,
          selectedCondition === 'All' ? undefined : selectedCondition,
          verifiedOnly
        );
      } else {
        // Fallback: standard items search without geospatial radius
        res = await itemService.getItems({
          search: search.trim() || undefined,
          category: selectedCategory === 'All' ? undefined : selectedCategory,
          condition: selectedCondition === 'All' ? undefined : selectedCondition,
          status: 'available',
          verifiedOnly: verifiedOnly ? 'true' : undefined,
        });
      }

      // If response is successful, update items array
      if (res && res.success && Array.isArray(res.items)) {
        setItems(res.items);
        // Highlight first item on the radar map by default
        if (res.items.length > 0) {
          setSelectedItemForMap(res.items[0]);
        } else {
          setSelectedItemForMap(null);
        }
      } else {
        setItems([]);
        setSelectedItemForMap(null);
      }
    } catch (e) {
      console.log('[ExploreScreen] error fetching items:', e.message);
      setItems([]);
      setSelectedItemForMap(null);
    } finally {
      setLoading(false);
    }
  }, [search, selectedCategory, selectedCondition, selectedRadius, userLocation, verifiedOnly]);

  // Refetch items when filters, search text, or GPS coordinates change
  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Re-run queries whenever screen regains navigation focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchItems();
      if (feedTab === 'requests') fetchWishlistFeed();
    });
    return unsubscribe;
  }, [navigation, fetchItems, fetchWishlistFeed, feedTab]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F0FDF4" />

      {/* ── 1. Top Bar ── */}
      <View style={styles.topBar}>
        <View style={styles.logoBadgeRow}>
          <View style={styles.miniLogoBox}>
            <Text style={styles.miniLogoLetter}>R</Text>
          </View>
          <Text style={styles.logoTitle}>ReUse</Text>
        </View>

        <TouchableOpacity
          style={styles.locationPill}
          onPress={fetchLocation}
          activeOpacity={0.8}
        >
          <View style={styles.locationDot} />
          <Text style={styles.locationText} numberOfLines={1}>{locationName}</Text>
          <Text style={styles.locationChevron}>⌄</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Profile')} activeOpacity={0.8}>
          <View style={styles.avatarWrapper}>
            <Text style={styles.avatarInitial}>A</Text>
            <View style={styles.avatarActiveDot} />
          </View>
        </TouchableOpacity>
      </View>

      {/* ── 2. Search Bar ── */}
      <View style={styles.searchRow}>
        <View style={styles.searchInputContainer}>
          <Text style={styles.searchLens}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder={
              viewMode === 'radar'
                ? 'Scan nearby items or categories...'
                : 'Search eco-finds, electronics, books...'
            }
            placeholderTextColor="#94A3B8"
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={fetchItems}
            returnKeyType="search"
          />
        </View>

        <TouchableOpacity
          style={styles.filterBtn}
          onPress={() => setFilterModalVisible(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.filterIcon}>🎛️</Text>
        </TouchableOpacity>
      </View>

      {/* ── Feed Tabs: Nearby Radar vs Campus Requests ── */}
      <View style={styles.feedTabRow}>
        <TouchableOpacity
          style={[styles.feedTab, feedTab === 'nearby' && styles.feedTabActive]}
          onPress={() => setFeedTab('nearby')}
          activeOpacity={0.85}
        >
          <Text style={[styles.feedTabText, feedTab === 'nearby' && styles.feedTabTextActive]}>
            🧭 Nearby
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.feedTab, feedTab === 'requests' && styles.feedTabActive]}
          onPress={() => setFeedTab('requests')}
          activeOpacity={0.85}
        >
          <Text style={[styles.feedTabText, feedTab === 'requests' && styles.feedTabTextActive]}>
            📣 Campus Requests
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.requestItemBtn}
          onPress={() => navigation.navigate('RequestItem')}
          activeOpacity={0.85}
        >
          <Text style={styles.requestItemBtnText}>＋ Request</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.verifiedFilterRow}>
        <TouchableOpacity
          style={[styles.verifiedChip, verifiedOnly && styles.verifiedChipActive]}
          onPress={() => setVerifiedOnly((prev) => !prev)}
          activeOpacity={0.85}
        >
          <Text
            style={[styles.verifiedChipText, verifiedOnly && styles.verifiedChipTextActive]}
          >
            {verifiedOnly ? '✓' : '○'} Verified Students Only
          </Text>
        </TouchableOpacity>
      </View>

      {feedTab === 'nearby' ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.priceFilterRow}
          contentContainerStyle={styles.priceFilterContent}
        >
          {PRICE_FILTERS.map((filter) => {
            const active = priceFilter === filter.key;
            return (
              <TouchableOpacity
                key={filter.key}
                style={[styles.priceChip, active && styles.priceChipActive]}
                onPress={() => setPriceFilter(filter.key)}
                activeOpacity={0.85}
              >
                <Text style={[styles.priceChipText, active && styles.priceChipTextActive]}>
                  {filter.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* ── CAMPUS REQUESTS FEED ────────────────────────────────────────────── */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {feedTab === 'requests' ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.requestsFeedContent}
        >
          <View style={styles.requestsHeaderCard}>
            <Text style={styles.requestsHeaderKicker}>CAMPUS REQUESTS FEED</Text>
            <Text style={styles.requestsHeaderTitle}>What your mates need</Text>
            <Text style={styles.requestsHeaderSub}>
              Help a college mate out — givers earn karma and keep items in use.
            </Text>
          </View>

          {requestsLoading ? (
            <LoadingSpinner message="Loading campus requests..." />
          ) : requests.length === 0 ? (
            <EmptyState
              icon="📣"
              title="No Campus Requests Yet"
              description="Nobody has posted a request in this category. Be the first to ask your campus for something you need."
              actionText="+ Request an Item"
              onAction={() => navigation.navigate('RequestItem')}
            />
          ) : (
            requests
              .filter((r) => !dismissedRequestIds.includes(r._id))
              .map((request) => {
                const urgencyHigh = request.urgency === 'High';
                const timeAgo = request.createdAt
                  ? new Date(request.createdAt).toLocaleDateString()
                  : 'Recently';
                const isOwner = Boolean(
                  user?._id &&
                    request.requester?._id &&
                    String(request.requester._id) === String(user._id)
                );

                const openRequesterChat = () => {
                  if (!request.requester?._id) {
                    Alert.alert('Chat Unavailable', 'Requester details are unavailable.');
                    return;
                  }
                  navigation.navigate('Chat', {
                    itemId: request._id,
                    recipientId: request.requester._id,
                    recipientName: request.requester.name || 'Campus Student',
                    recipientVerified: Boolean(request.requester.isVerified),
                    itemTitle: request.title || 'Campus Request',
                  });
                };

                const handleYes = () => {
                  Alert.alert(
                    '✅ Yes, I Have This!',
                    `Let ${request.requester?.name || 'your campus mate'} know you have "${request.title}".`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: '📦 List Item', onPress: () => navigation.navigate('AddItem') },
                      { text: '💬 Message Now', onPress: openRequesterChat },
                    ]
                  );
                };

                const handleDelete = () => {
                  Alert.alert(
                    'Delete Request?',
                    'Got this item or no longer need it? Remove your campus request.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Yes, Delete',
                        style: 'destructive',
                        onPress: async () => {
                          setDeletingRequestId(request._id);
                          try {
                            const res = await wishlistService.deleteWishlist(request._id);
                            if (res && res.success) {
                              setRequests((prev) => prev.filter((r) => r._id !== request._id));
                            }
                          } catch (err) {
                            Alert.alert('Error', err.message || 'Could not delete request.');
                          } finally {
                            setDeletingRequestId(null);
                          }
                        },
                      },
                    ]
                  );
                };

                return (
                  <View key={request._id} style={styles.requestCard}>
                    <View style={styles.requestCardTopRow}>
                      <View
                        style={[
                          styles.urgencyBadge,
                          urgencyHigh ? styles.urgencyBadgeHigh : styles.urgencyBadgeMedium,
                        ]}
                      >
                        <Text
                          style={[
                            styles.urgencyBadgeText,
                            urgencyHigh ? styles.urgencyTextHigh : styles.urgencyTextMedium,
                          ]}
                        >
                          {urgencyHigh ? '🔥 HIGH URGENCY' : '🕒 MEDIUM'}
                        </Text>
                      </View>
                      <Text style={styles.requestCardCategory}>{request.category}</Text>
                    </View>

                    <Text style={styles.requestCardTitle} numberOfLines={2}>
                      {request.title}
                    </Text>
                    <Text style={styles.requestCardDesc} numberOfLines={3}>
                      {request.description}
                    </Text>

                    <View style={styles.requestCardFooter}>
                      <View style={styles.requestRequesterRow}>
                        <View style={styles.requestRequesterAvatar}>
                          <Text style={styles.requestRequesterInitial}>
                            {(request.requester?.name || 'S').charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={styles.requestRequesterName} numberOfLines={1}>
                          {isOwner ? 'You' : request.requester?.name || 'Campus Student'}
                        </Text>
                        <VerifiedBadge verified={Boolean(request.requester?.isVerified)} size={12} />
                        <Text style={styles.requestTime}>• {timeAgo}</Text>
                      </View>
                    </View>

                    {isOwner ? (
                      <View style={styles.requestActionsRow}>
                        <TouchableOpacity
                          style={styles.deleteReqBtn}
                          onPress={handleDelete}
                          disabled={deletingRequestId === request._id}
                          activeOpacity={0.85}
                        >
                          <Text style={styles.deleteReqBtnText}>
                            {deletingRequestId === request._id ? 'Deleting...' : '🗑️ Delete My Request'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.requestActionsRow}>
                        <TouchableOpacity
                          style={styles.yesBtn}
                          onPress={handleYes}
                          activeOpacity={0.85}
                        >
                          <Text style={styles.yesBtnText}>✅ Yes</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.noBtn}
                          onPress={() => setDismissedRequestIds((prev) => [...prev, request._id])}
                          activeOpacity={0.85}
                        >
                          <Text style={styles.noBtnText}>❌ No</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.msgBtn}
                          onPress={openRequesterChat}
                          activeOpacity={0.85}
                        >
                          <Text style={styles.msgBtnText}>💬 Message</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })
          )}

          <View style={{ height: 90 }} />
        </ScrollView>
      ) : viewMode === 'radar' ? (
        <View style={styles.radarContainer}>
          {/* Radius Selector Pills */}
          <View style={styles.radiusPillsRow}>
            {RADIUS_OPTIONS.map((rad) => (
              <TouchableOpacity
                key={rad}
                style={[
                  styles.radiusPill,
                  selectedRadius === rad && styles.radiusPillActive,
                ]}
                onPress={() => setSelectedRadius(rad)}
                activeOpacity={0.8}
              >
                {selectedRadius === rad ? <Text style={styles.radiusActiveDot}>🟢 </Text> : null}
                <Text
                  style={[
                    styles.radiusPillText,
                    selectedRadius === rad && styles.radiusPillTextActive,
                  ]}
                >
                  {rad} km
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Live Interactive Map (native) / Animated Radar Canvas (web) */}
          <View style={styles.mapCanvas}>
            <RadarMap
              items={displayedItems}
              userLocation={userLocation}
              selectedRadius={selectedRadius}
              selectedItem={selectedItemForMap}
              onSelectItem={setSelectedItemForMap}
              recenterSignal={recenterSignal}
              locationName={locationName}
              fallbackCenter={{
                latitude: DEFAULT_COORDINATES.latitude,
                longitude: DEFAULT_COORDINATES.longitude,
              }}
              loading={loading}
            />

            {/* Empty radius overlay over map / radar canvas */}
            {!loading && displayedItems.length === 0 ? (
              <View style={styles.radarEmptyCenter} pointerEvents="none">
                <Text style={styles.radarEmptyCenterIcon}>🛰️</Text>
                <Text style={styles.radarEmptyCenterTitle}>
                  No items detected in {selectedRadius} km
                </Text>
                <Text style={styles.radarEmptyCenterSub}>
                  {selectedRadius >= 25
                    ? 'Be the first to list an item in your area!'
                    : `Try expanding radius to ${selectedRadius >= 10 ? '25 km' : '10 km or 25 km'}!`}
                </Text>
              </View>
            ) : null}

            {/* Floating Radar Controls */}
            <View style={styles.radarControls}>
              <TouchableOpacity
                style={styles.floatingCtrlBtn}
                activeOpacity={0.8}
                onPress={() => {
                  const nextRadius = selectedRadius === 1 ? 5 : selectedRadius === 5 ? 10 : selectedRadius === 10 ? 25 : 1;
                  setSelectedRadius(nextRadius);
                }}
              >
                <Text style={styles.floatingCtrlIcon}>((•))</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.floatingCtrlBtn}
                activeOpacity={0.8}
                accessibilityLabel="My Location"
                onPress={() => {
                  fetchLocation();
                  setRecenterSignal((n) => n + 1);
                }}
              >
                <Text style={styles.floatingCtrlIcon}>🎯</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.floatingCtrlBtn}
                activeOpacity={0.8}
                accessibilityLabel="Switch to Grid View"
                onPress={() => setViewMode('list')}
              >
                <Text style={styles.floatingCtrlIcon}>📋</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Bottom Sliding Panel: Nearby Discoveries */}
          <View style={styles.bottomSheetPanel}>
            <View style={styles.dragHandle} />

            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderLeft}>
                <Text style={styles.sheetHeaderDot}>🟢</Text>
                <Text style={styles.sheetHeaderTitle}>Nearby Discoveries</Text>
              </View>
              <View style={styles.sheetCountBadge}>
                <Text style={styles.sheetCountBadgeText}>
                  {displayedItems.length} items in {selectedRadius} km
                </Text>
              </View>
            </View>

            {/* Featured Item Card */}
            {selectedItemForMap ? (
              <View style={styles.featuredDiscoveryCard}>
                <View style={styles.featuredCardRow}>
                  <Image
                    source={{
                      uri: (() => {
                        const first = selectedItemForMap.images?.[0];
                        if (!first) return 'https://images.unsplash.com/photo-1532012164546-f432f2e3777a?auto=format&fit=crop&w=600&q=80';
                        if (first.startsWith('http')) return first;
                        return `${IMAGE_BASE_URL}${first.startsWith('/') ? '' : '/'}${first}`;
                      })(),
                    }}
                    style={styles.featuredImage}
                  />
                  <View style={styles.featuredDetails}>
                    <View style={styles.likeNewTag}>
                      <Text style={styles.likeNewTagText}>
                        {selectedItemForMap.condition?.toUpperCase() || 'GOOD'}
                      </Text>
                    </View>

                    <Text style={styles.featuredDistance}>
                      🧭{' '}
                      {(() => {
                        const distanceKm = getItemDistanceKm(selectedItemForMap, userLocation);
                        return distanceKm !== null ? `${distanceKm.toFixed(1)} km away • ` : '';
                      })()}
                      {selectedItemForMap.addressText
                        ? selectedItemForMap.addressText.split(',')[0].trim()
                        : 'Local Area'}
                    </Text>

                    <Text style={styles.featuredTitle} numberOfLines={1}>
                      {selectedItemForMap.title}
                    </Text>

                    <Text style={styles.featuredDonor}>
                      👤 {selectedItemForMap.donor?.name || 'Campus Giver'} • {selectedItemForMap.category}
                    </Text>

                    <View style={styles.metaBadgeRow}>
                      <Text style={styles.featuredTime}>
                        🕒 {new Date(selectedItemForMap.createdAt).toLocaleDateString()}
                      </Text>
                      <Text style={styles.featuredCo2}>
                        🌱 100% Free
                      </Text>
                    </View>
                  </View>
                </View>

                {/* 2 Buttons: View Details & Claim/Request */}
                <View style={styles.featuredActionsRow}>
                  <TouchableOpacity
                    style={styles.directionsBtn}
                    onPress={() => navigation.navigate('ItemDetails', { item: selectedItemForMap })}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.directionsBtnText}>👁️ View Details</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.claimBtn}
                    onPress={() => navigation.navigate('ItemDetails', { item: selectedItemForMap })}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.claimBtnText}>🏷️ Claim / Request</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.emptyDiscoveryBox}>
                <Text style={styles.emptyDiscoveryIcon}>📡</Text>
                <Text style={styles.emptyDiscoveryTitle}>
                  No Items Within {selectedRadius} km
                </Text>
                <Text style={styles.emptyDiscoveryDesc}>
                  {selectedCategory !== 'All' ? `No listings in "${selectedCategory}" within ` : 'No circular listings within '}
                  {selectedRadius} km of your location{search.trim() ? ` matching "${search.trim()}"` : ''}.
                </Text>

                <View style={styles.emptyDiscoveryBtnRow}>
                  {selectedRadius < 25 && (
                    <TouchableOpacity
                      style={styles.expandRadiusBtn}
                      onPress={() => {
                        const nextRadius = selectedRadius === 1 ? 5 : selectedRadius === 5 ? 10 : 25;
                        setSelectedRadius(nextRadius);
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.expandRadiusBtnText}>
                        Expand to {selectedRadius === 1 ? '5 km' : selectedRadius === 5 ? '10 km' : '25 km'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.postFirstBtn}
                    onPress={() => navigation.navigate('AddItem')}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.postFirstBtnText}>+ List Free Item</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      ) : (
        /* ────────────────────────────────────────────────────────────────── */
        /* ── MODE B: LIST / SPOTLIGHT VIEW (Screenshot 3) ─────────────────── */
        /* ────────────────────────────────────────────────────────────────── */
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listScroll}>
          {/* Filter Pills row */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterPillsRow}>
            <TouchableOpacity
              style={styles.activeFilterPill}
              onPress={() => {
                const next = selectedRadius === 1 ? 5 : selectedRadius === 5 ? 10 : selectedRadius === 10 ? 25 : 1;
                setSelectedRadius(next);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.activeFilterPillText}>🟢 &lt; {selectedRadius} km ↻</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.inactiveFilterPill}
              onPress={() => setFilterModalVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.inactiveFilterPillText}>Category: {selectedCategory} ⌄</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.inactiveFilterPill}
              onPress={() => setFilterModalVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.inactiveFilterPillText}>Condition: {selectedCondition} 🎛️</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Spotlight Hero Banner */}
          <View style={styles.spotlightBanner}>
            <View style={styles.spotlightHeader}>
              <Text style={styles.spotlightDot}>🟢</Text>
              <Text style={styles.spotlightLabel}>RADAR PULSE SPOTLIGHT</Text>
            </View>
            <Text style={styles.spotlightTitle}>Hidden Gems Near You</Text>
            <Text style={styles.spotlightDesc}>
              Curated zero-cost items uploaded in your campus block.
            </Text>
            <TouchableOpacity
              style={styles.spotlightMapBtn}
              onPress={() => setViewMode('radar')}
              activeOpacity={0.85}
            >
              <Text style={styles.spotlightMapBtnText}>View Map</Text>
            </TouchableOpacity>
          </View>

          {/* Category Chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catChipsScroll}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.catChip,
                  selectedCategory === cat && styles.catChipActive,
                ]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text
                  style={[
                    styles.catChipText,
                    selectedCategory === cat && styles.catChipTextActive,
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Discoveries Count */}
          <View style={styles.discoveriesCountRow}>
            <Text style={styles.discoveriesCountText}>
              🟢 {displayedItems.length} ITEMS DISCOVERED
            </Text>
            <Text style={styles.liveRadiusText}>Live radius: {selectedRadius}.0 km</Text>
          </View>

          {/* 2-Column Grid or Empty State */}
          {loading ? (
            <LoadingSpinner message="Scanning circular items nearby..." />
          ) : displayedItems.length === 0 ? (
            <EmptyState
              icon="🧭"
              title="No Nearby Items on Radar"
              description={`No reusable items found within ${selectedRadius} km${selectedCategory !== 'All' ? ` in category "${selectedCategory}"` : ''}${search.trim() ? ` matching "${search.trim()}"` : ''}. Expand your radar radius or share an item!`}
              actionText="+ List Free Item"
              onAction={() => navigation.navigate('AddItem')}
            />
          ) : (
            <View style={styles.gridContainer}>
              {displayedItems.map((item) => (
                <ItemCard
                  key={item._id}
                  item={item}
                  userLocation={userLocation}
                  isGrid={true}
                  onPress={() => navigation.navigate('ItemDetails', { item })}
                />
              ))}
            </View>
          )}

          <View style={{ height: 80 }} />
        </ScrollView>
      )}

      {/* ── Floating Switch View Pill (Stitch Screenshot 3) ── */}
      {feedTab === 'nearby' ? (
      <View style={styles.floatingToggleContainer}>
        <View style={styles.floatingTogglePill}>
          <TouchableOpacity
            style={styles.toggleSegment}
            onPress={() => setFilterModalVisible(true)}
          >
            <Text style={styles.toggleSegmentText}>🎛️ Filters (3)</Text>
          </TouchableOpacity>
          <View style={styles.toggleDivider} />
          <TouchableOpacity
            style={styles.toggleSegment}
            onPress={() => setViewMode(viewMode === 'radar' ? 'list' : 'radar')}
          >
            <Text style={styles.toggleSegmentText}>
              {viewMode === 'radar' ? '📋 List View' : '🗺️ Map View'}
            </Text>
          </TouchableOpacity>
          <View style={styles.toggleDivider} />
          <TouchableOpacity
            style={styles.toggleSegment}
            onPress={() => {}}
          >
            <Text style={styles.toggleSegmentText}>⬆️</Text>
          </TouchableOpacity>
        </View>
      </View>
      ) : null}

      {/* ── Filter Modal ── */}
      <Modal visible={filterModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter Radar</Text>
              <TouchableOpacity onPress={() => setFilterModalVisible(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.filterSectionTitle}>Discovery Radius</Text>
            <View style={styles.modalOptionsRow}>
              {RADIUS_OPTIONS.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.filterOptBtn, selectedRadius === r && styles.filterOptBtnActive]}
                  onPress={() => setSelectedRadius(r)}
                >
                  <Text style={[styles.filterOptText, selectedRadius === r && styles.filterOptTextActive]}>
                    {r} km
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.filterSectionTitle}>Condition</Text>
            <View style={styles.modalOptionsRow}>
              {CONDITIONS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.filterOptBtn, selectedCondition === c && styles.filterOptBtnActive]}
                  onPress={() => setSelectedCondition(c)}
                >
                  <Text style={[styles.filterOptText, selectedCondition === c && styles.filterOptTextActive]}>
                    {c}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.applyFilterBtn}
              onPress={() => setFilterModalVisible(false)}
            >
              <Text style={styles.applyFilterBtnText}>Apply Filters</Text>
            </TouchableOpacity>
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

  // 1. Top Bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 10,
  },
  logoBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniLogoBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniLogoLetter: {
    color: '#BEF264',
    fontSize: 16,
    fontWeight: '900',
  },
  logoTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#064E3B',
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F4EA',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 18,
    gap: 4,
  },
  locationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#059669',
  },
  locationText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#064E3B',
  },
  locationChevron: {
    fontSize: 11,
    fontWeight: '800',
    color: '#064E3B',
  },
  avatarWrapper: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#059669',
  },
  avatarInitial: {
    fontSize: 13,
    fontWeight: '800',
    color: '#064E3B',
  },
  avatarActiveDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },

  // 2. Search Bar
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 10,
  },
  searchInputContainer: {
    flex: 1,
    height: 44,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchLens: {
    fontSize: 14,
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
  },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterIcon: {
    fontSize: 16,
  },

  // ── Feed tabs & verified filter ────────────────────────────────────────────
  feedTabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  feedTab: {
    flex: 1,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedTabActive: {
    backgroundColor: '#064E3B',
    borderColor: '#064E3B',
  },
  feedTabText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
  },
  feedTabTextActive: {
    color: '#BEF264',
  },
  requestItemBtn: {
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#BEF264',
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestItemBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#14532D',
  },
  verifiedFilterRow: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  priceFilterRow: {
    maxHeight: 36,
    marginBottom: 8,
  },
  priceFilterContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  priceChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  priceChipActive: {
    backgroundColor: '#047857',
    borderColor: '#047857',
  },
  priceChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
  },
  priceChipTextActive: {
    color: '#FFFFFF',
  },
  verifiedChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  verifiedChipActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
  },
  verifiedChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
  },
  verifiedChipTextActive: {
    color: '#059669',
  },

  // ── Campus Requests Feed ───────────────────────────────────────────────────
  requestsFeedContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  requestsHeaderCard: {
    backgroundColor: '#064E3B',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  requestsHeaderKicker: {
    fontSize: 9,
    fontWeight: '900',
    color: '#BEF264',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  requestsHeaderTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  requestsHeaderSub: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#D1FAE5',
    lineHeight: 16,
  },
  requestCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 12,
  },
  requestCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  urgencyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  urgencyBadgeHigh: {
    backgroundColor: '#FEE2E2',
  },
  urgencyBadgeMedium: {
    backgroundColor: '#FEF3C7',
  },
  urgencyBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  urgencyTextHigh: {
    color: '#991B1B',
  },
  urgencyTextMedium: {
    color: '#92400E',
  },
  requestCardCategory: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  requestCardTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 19,
    marginBottom: 4,
  },
  requestCardDesc: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 17,
    marginBottom: 10,
  },
  requestCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  requestRequesterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  requestRequesterAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestRequesterInitial: {
    fontSize: 10,
    fontWeight: '900',
    color: '#059669',
  },
  requestRequesterName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
    maxWidth: 110,
  },
  requestTime: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
  },
  helpOutBtn: {
    backgroundColor: '#064E3B',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  helpOutBtnText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#BEF264',
  },
  requestActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  yesBtn: {
    flex: 1,
    backgroundColor: '#064E3B',
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
  },
  yesBtnText: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#BEF264',
  },
  noBtn: {
    flex: 1,
    backgroundColor: '#FEE2E2',
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
  },
  noBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#991B1B',
  },
  msgBtn: {
    flex: 1.2,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#86EFAC',
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
  },
  msgBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#064E3B',
  },
  deleteReqBtn: {
    flex: 1,
    backgroundColor: '#FEE2E2',
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
  },
  deleteReqBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#991B1B',
  },

  // ── RADAR MAP VIEW (Screenshot 1) ──────────────────────────────────────────
  radarContainer: {
    flex: 1,
  },
  radiusPillsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  radiusPill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  radiusPillActive: {
    backgroundColor: '#064E3B',
    borderColor: '#064E3B',
  },
  radiusActiveDot: {
    fontSize: 8,
  },
  radiusPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  radiusPillTextActive: {
    color: '#FFFFFF',
  },
  mapCanvas: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#E8F3EC',
    position: 'relative',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    overflow: 'hidden',
  },
  radarCircle: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(5, 150, 105, 0.35)',
  },
  cityLabelBox: {
    position: 'absolute',
    alignItems: 'center',
  },
  cityNameEn: {
    fontSize: 22,
    fontWeight: '900',
    color: '#064E3B',
    letterSpacing: -0.5,
  },
  cityNameGu: {
    fontSize: 16,
    fontWeight: '800',
    color: 'rgba(6, 78, 59, 0.5)',
  },

  // Map Markers
  mapMarker: {
    position: 'absolute',
    alignItems: 'center',
  },
  mapMarkerSelected: {
    zIndex: 10,
  },
  markerEmoji: {
    fontSize: 28,
  },
  markerBadgeCount: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#BEF264',
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerBadgeCountText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#064E3B',
  },
  markerLabelPill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 2,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  markerLabelText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0F172A',
  },
  markerLabelPillSelected: {
    backgroundColor: '#064E3B',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 2,
  },
  markerLabelTextSelected: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  userLocationMarker: {
    position: 'absolute',
    alignItems: 'center',
  },
  userLocationIcon: {
    fontSize: 22,
  },
  userLocationPill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 2,
  },
  userLocationText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#059669',
  },
  radarControls: {
    position: 'absolute',
    bottom: 20,
    right: 16,
    gap: 10,
  },
  floatingCtrlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  floatingCtrlIcon: {
    color: '#BEF264',
    fontSize: 18,
    fontWeight: '800',
  },

  // Bottom Sheet
  bottomSheetPanel: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 10,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sheetHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sheetHeaderDot: {
    fontSize: 10,
  },
  sheetHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  sheetCountBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  sheetCountBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#166534',
  },

  // Featured Card in Sheet
  featuredDiscoveryCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  featuredCardRow: {
    flexDirection: 'row',
    gap: 12,
  },
  featuredImage: {
    width: 90,
    height: 90,
    borderRadius: 12,
  },
  featuredDetails: {
    flex: 1,
  },
  likeNewTag: {
    backgroundColor: '#064E3B',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  likeNewTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#BEF264',
  },
  featuredDistance: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
    marginBottom: 2,
  },
  featuredTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  featuredDonor: {
    fontSize: 11,
    color: '#475569',
    marginBottom: 4,
  },
  metaBadgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  featuredTime: {
    fontSize: 10,
    color: '#94A3B8',
  },
  featuredCo2: {
    fontSize: 10,
    color: '#059669',
    fontWeight: '700',
  },
  featuredActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  directionsBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  directionsBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#064E3B',
  },
  claimBtn: {
    flex: 1.2,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ── LIST VIEW (Screenshot 3) ───────────────────────────────────────────────
  listScroll: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  filterPillsRow: {
    marginBottom: 12,
  },
  activeFilterPill: {
    backgroundColor: '#064E3B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
  },
  activeFilterPillText: {
    color: '#BEF264',
    fontSize: 11,
    fontWeight: '800',
  },
  inactiveFilterPill: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
  },
  inactiveFilterPillText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
  },
  spotlightBanner: {
    backgroundColor: '#064E3B',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  spotlightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  spotlightDot: {
    fontSize: 8,
  },
  spotlightLabel: {
    color: '#BEF264',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  spotlightTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  spotlightDesc: {
    fontSize: 12,
    color: '#D1FAE5',
    marginBottom: 12,
  },
  spotlightMapBtn: {
    backgroundColor: '#BEF264',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  spotlightMapBtnText: {
    color: '#14532D',
    fontSize: 12,
    fontWeight: '800',
  },
  catChipsScroll: {
    marginBottom: 14,
  },
  catChip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 8,
  },
  catChipActive: {
    backgroundColor: '#064E3B',
    borderColor: '#064E3B',
  },
  catChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  catChipTextActive: {
    color: '#FFFFFF',
  },
  discoveriesCountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  discoveriesCountText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#064E3B',
  },
  liveRadiusText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -5,
  },

  // Floating Toggle Pill (Screenshot 3)
  floatingToggleContainer: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  floatingTogglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#064E3B',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  toggleSegment: {
    paddingHorizontal: 8,
  },
  toggleSegmentText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  toggleDivider: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalClose: {
    fontSize: 18,
    fontWeight: '700',
    color: '#64748B',
  },
  filterSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 10,
    marginBottom: 8,
  },
  modalOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  filterOptBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  filterOptBtnActive: {
    backgroundColor: '#064E3B',
  },
  filterOptText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  filterOptTextActive: {
    color: '#FFFFFF',
  },
  applyFilterBtn: {
    backgroundColor: '#064E3B',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  applyFilterBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  // ── Radar Map Empty State (overlaid on canvas) ─────────────────────────────
  radarEmptyCenter: {
    position: 'absolute',
    alignItems: 'center',
    paddingHorizontal: 24,
    top: '30%',
    zIndex: 20,
  },
  radarEmptyCenterIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  radarEmptyCenterTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#064E3B',
    textAlign: 'center',
    marginBottom: 4,
  },
  radarEmptyCenterSub: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
    textAlign: 'center',
  },

  // ── Empty Discovery Bottom Sheet (no items) ────────────────────────────────
  emptyDiscoveryBox: {
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  emptyDiscoveryIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyDiscoveryTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
    textAlign: 'center',
  },
  emptyDiscoveryDesc: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 18,
  },
  emptyDiscoveryBtnRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  expandRadiusBtn: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#059669',
  },
  expandRadiusBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#065F46',
  },
  postFirstBtn: {
    backgroundColor: '#064E3B',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
  },
  postFirstBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#BEF264',
  },
});

export default ExploreScreen;
