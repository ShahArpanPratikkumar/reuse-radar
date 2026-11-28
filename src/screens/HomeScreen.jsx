// =============================================================================
// REUSE RADAR - HOME SCREEN (HomeScreen.jsx)
// Purpose: Primary landing page and circular campus marketplace discovery hub.
// Features:
// 1. Live GPS location lookup + reverse geocoding via expo-location.
// 2. Paginated infinite scroll feed of free campus items with pull-to-refresh.
// 3. 'Hot Discoveries' horizontal rail highlighting nearest listings (< 5 km Haversine).
// 4. Multi-category filtering and debounced keyword search (350ms delay).
// 5. Unread notification and direct chat badges dynamically synced on focus.
// =============================================================================

import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  TextInput,
  StatusBar,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

// Global context providing logged-in user profile and unread notification counts
import { AuthContext } from '../context/AuthContext';
// Service communicating with backend items and messaging APIs
import { itemService } from '../services/itemService';
import { messageService } from '../services/messageService';
import { wishlistService } from '../services/wishlistService';
import ItemCard from '../components/ItemCard';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { DEFAULT_COORDINATES } from '../utils/constants';

const NEARBY_FILTER = 'Nearby (< 5 km)';
const PAGE_SIZE = 10;

// Filter chips for quick item sorting
const QUICK_FILTERS = ['All', NEARBY_FILTER, 'Just Added', 'Like New'];

// Category shortcuts with themed emojis
const CATEGORY_CHIPS = [
  { name: 'Books', label: 'Books & Notes', emoji: '📚' },
  { name: 'Electronics', label: 'Electronics & Laptops', emoji: '💻' },
  { name: 'Furniture', label: 'Furniture & Study Tables', emoji: '🪑' },
  { name: 'Cycles', label: 'Cycles & Commute', emoji: '🚲' },
  { name: 'Clothes', label: 'Clothes & Essentials', emoji: '👕' },
  { name: 'Bags', label: 'Bags & Kits', emoji: '🎒' },
  { name: 'Household', label: 'Household & Plants', emoji: '🏠' },
];

// Helper: Split a flat list into pairs of two for a balanced two-column grid layout
const chunkPairs = (list = []) => {
  const rows = [];
  for (let i = 0; i < list.length; i += 2) {
    rows.push(list.slice(i, i + 2));
  }
  return rows;
};

// Helper: Haversine formula calculating distance between two GPS coordinates in kilometers
const haversineKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's mean radius in kilometers
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

const HomeScreen = ({ navigation }) => {
  const { user, unreadNotifCount } = useContext(AuthContext);

  // Listing data states
  const [items, setItems] = useState([]);
  const [hotItems, setHotItems] = useState([]);
  const [urgentRequests, setUrgentRequests] = useState([]);
  const [categoryCounts, setCategoryCounts] = useState({});
  const [totalListings, setTotalListings] = useState(0);

  // Pagination & Loading States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [quickFilter, setQuickFilter] = useState('All');

  // GPS Location & Unread Chat Counters
  const [userLocation, setUserLocation] = useState(null);
  const [locationName, setLocationName] = useState('');
  const [unreadMessages, setUnreadMessages] = useState(0);

  // Determine distance calculation origin: current device GPS or fallback campus coordinates
  const distanceOrigin = userLocation || DEFAULT_COORDINATES;

  // Mechanism 1: Request GPS Permissions and Perform Reverse Geocoding
  const fetchLocation = useCallback(async () => {
    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setUserLocation(null);
        setLocationName('');
        return;
      }

      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        const req = await Location.requestForegroundPermissionsAsync();
        status = req.status;
      }

      if (status !== 'granted') {
        setUserLocation(null);
        setLocationName('');
        return;
      }

      // Fetch current coordinates with balanced battery-friendly accuracy
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (current && current.coords) {
        const coords = {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
        };
        setUserLocation(coords);

        // Reverse geocode latitude/longitude to neighborhood or city name
        try {
          const geocode = await Location.reverseGeocodeAsync(coords);
          if (geocode && geocode.length > 0) {
            const place = geocode[0];
            const city = place.city || place.subregion || place.district;
            if (city) setLocationName(city);
          }
        } catch (e) {
          // Keep generic campus label if reverse geocoding is unavailable
        }
      }
    } catch (err) {
      console.log('[HomeScreen Location] error:', err.message);
      setUserLocation(null);
      setLocationName('');
    }
  }, []);

  // Mechanism 2: Query Parameter Builder for Item Fetching
  const buildQuery = useCallback(
    (targetPage) => {
      const params = { page: targetPage, limit: PAGE_SIZE, status: 'available' };
      if (selectedCategory !== 'All') params.category = selectedCategory;
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (quickFilter === 'Like New') params.condition = 'Like New';
      if (quickFilter === 'Just Added') params.sort = 'Newest';
      return params;
    },
    [selectedCategory, debouncedSearch, quickFilter]
  );

  // Mechanism 3: Request Page Data from Backend API
  const requestPage = useCallback(
    async (targetPage) => {
      // Special Geospatial Query for 'Nearby (< 5 km)' filter
      if (quickFilter === NEARBY_FILTER) {
        if (userLocation) {
          const res = await itemService.getNearbyItems(
            userLocation.latitude,
            userLocation.longitude,
            5,
            selectedCategory,
            debouncedSearch
          );
          if (!res || !res.success) return { items: [], pages: 1 };
          const list = (res.items || [])
            .filter((it) => it.distanceKm === undefined || Number(it.distanceKm) <= 5)
            .sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));
          return { items: list, pages: 1 };
        }

        // Web or Emulator without GPS: compute relative to campus center
        const res = await itemService.getItems({ ...buildQuery(1), limit: 50 });
        if (!res || !res.success) return { items: [], pages: 1 };
        const withinRadius = (res.items || [])
          .map((it) => {
            if (it.distanceKm !== undefined && it.distanceKm !== null) return it;
            if (
              distanceOrigin &&
              Array.isArray(it.location?.coordinates) &&
              it.location.coordinates.length === 2
            ) {
              return {
                ...it,
                distanceKm: haversineKm(
                  distanceOrigin.latitude,
                  distanceOrigin.longitude,
                  it.location.coordinates[1],
                  it.location.coordinates[0]
                ),
              };
            }
            return it;
          })
          .filter((it) => it.distanceKm === undefined || Number(it.distanceKm) <= 5)
          .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
        return { items: withinRadius, pages: 1 };
      }

      // Standard paginated fetch
      const res = await itemService.getItems(buildQuery(targetPage));
      if (!res || !res.success) return { items: [], pages: 1 };
      return { items: res.items || [], pages: res.pages || 1 };
    },
    [
      quickFilter,
      userLocation,
      selectedCategory,
      debouncedSearch,
      buildQuery,
      distanceOrigin,
    ]
  );

  // Mechanism 4: Reset Feed on Filter / Search Change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const result = await requestPage(1);
        if (cancelled) return;
        setItems(result.items);
        setPage(1);
        setPages(result.pages);
      } catch (err) {
        if (cancelled) return;
        console.log('[HomeScreen] feed error:', err.message);
        setItems([]);
        setPages(1);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [requestPage]);

  // Mechanism 5: Fetch Hot Discoveries (< 25km radius sorted by closest)
  const fetchHot = useCallback(async () => {
    try {
      const category = selectedCategory === 'All' ? undefined : selectedCategory;
      let list = [];

      if (distanceOrigin) {
        const res = await itemService.getNearbyItems(
          distanceOrigin.latitude,
          distanceOrigin.longitude,
          quickFilter === NEARBY_FILTER ? 5 : 25,
          category,
          debouncedSearch
        );
        if (res && res.success) {
          list = res.items || [];
        }
      }

      if (list.length === 0) {
        const res = await itemService.getItems({
          category,
          search: debouncedSearch.trim() || undefined,
          limit: 20,
          status: 'available',
        });
        if (res && res.success) list = res.items || [];
      }

      const withDistance = list.map((it) => {
        if (it.distanceKm !== undefined && it.distanceKm !== null) return it;
        if (
          distanceOrigin &&
          Array.isArray(it.location?.coordinates) &&
          it.location.coordinates.length === 2
        ) {
          return {
            ...it,
            distanceKm: haversineKm(
              distanceOrigin.latitude,
              distanceOrigin.longitude,
              it.location.coordinates[1],
              it.location.coordinates[0]
            ),
          };
        }
        return it;
      });

      setHotItems(
        withDistance
          .filter(
            (it) =>
              quickFilter !== NEARBY_FILTER ||
              it.distanceKm === undefined ||
              Number(it.distanceKm) <= 5
          )
          .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999))
          .slice(0, 4)
      );
    } catch (err) {
      console.log('[HomeScreen] hot discoveries error:', err.message);
      setHotItems([]);
    }
  }, [selectedCategory, debouncedSearch, distanceOrigin, quickFilter]);

  // Load category distribution counters
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await itemService.getItems({ limit: 50, status: 'available' });
        if (cancelled || !res || !res.success) return;
        const counts = {};
        (res.items || []).forEach((it) => {
          if (!it.category) return;
          counts[it.category] = (counts[it.category] || 0) + 1;
        });
        setCategoryCounts(counts);
        setTotalListings(res.total || (res.items || []).length);
      } catch (err) {
        if (!cancelled) console.log('[HomeScreen] stats error:', err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchUrgentRequests = useCallback(async () => {
    try {
      const res = await wishlistService.getWishlistFeed({ status: 'active', limit: 6 });
      if (res && res.success) {
        setUrgentRequests(res.wishlists || []);
      }
    } catch (e) {
      // Silent background error
    }
  }, []);

  useEffect(() => {
    fetchHot();
    fetchUrgentRequests();
  }, [fetchHot, fetchUrgentRequests]);

  // Mechanism 6: Debounced Search Input Handling
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Refresh feed and unread message indicators whenever screen regains focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', async () => {
      fetchHot();
      fetchUrgentRequests();
      try {
        const res = await messageService.getConversations();
        if (res && res.success) {
          setUnreadMessages(
            (res.conversations || []).reduce(
              (sum, conversation) => sum + (conversation.unreadCount || 0),
              0
            )
          );
        }
      } catch (e) {
        // Silent background sync
      }
    });
    return unsubscribe;
  }, [navigation, fetchHot]);

  // Mechanism 7: Pull-to-refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchLocation();
    try {
      const result = await requestPage(1);
      setItems(result.items);
      setPage(1);
      setPages(result.pages);
    } catch (err) {
      console.log('[HomeScreen] refresh error:', err.message);
    }
    await fetchHot();
    setRefreshing(false);
  }, [fetchLocation, requestPage, fetchHot]);

  // Mechanism 8: Infinite Scroll Load More
  const loadMore = useCallback(async () => {
    if (loadingMore || loading || page >= pages) return;
    if (quickFilter === NEARBY_FILTER) return; // Geospatial endpoint returns full radius in 1 page
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const result = await requestPage(nextPage);
      setItems((prev) => {
        const seen = new Set(prev.map((it) => it._id));
        const appended = result.items.filter((it) => !seen.has(it._id));
        return [...prev, ...appended];
      });
      setPage(nextPage);
      setPages(result.pages);
    } catch (err) {
      console.log('[HomeScreen] load more error:', err.message);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, loading, page, pages, quickFilter, requestPage]);

  useEffect(() => {
    fetchLocation();
  }, [fetchLocation]);

  const campusLabel = useMemo(() => {
    if (locationName && locationName.trim()) return `${locationName.split(',')[0].trim()} Campus`;
    return 'Ahmedabad Campus';
  }, [locationName]);

  const rows = useMemo(() => chunkPairs(items), [items]);
  const hotRows = useMemo(() => chunkPairs(hotItems), [hotItems]);

  const renderCard = (item) => (
    <ItemCard
      key={item._id}
      item={item}
      userLocation={distanceOrigin}
      isGrid={true}
      onPress={() =>
        navigation.navigate('ItemDetails', { item, itemId: item._id })
      }
    />
  );

  const renderRow = (row, index) => (
    <View style={styles.gridRow} key={`grid-row-${index}-${row[0]?._id || 'empty'}`}>
      {row.map(renderCard)}
      {row.length === 1 ? <View style={styles.gridSpacer} /> : null}
    </View>
  );

  // FlatList Complex Header Component
  const header = (
    <View>
      {/* Search Input Box with clear button */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Text style={styles.searchLens}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search laptops, textbooks, cycles, dorm chairs..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              style={styles.clearBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Clear search"
            >
              <Text style={styles.clearIcon}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Horizontal Quick Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.quickRow}
      >
        {QUICK_FILTERS.map((filter) => {
          const active = quickFilter === filter;
          return (
            <TouchableOpacity
              key={filter}
              style={[styles.quickPill, active && styles.quickPillActive]}
              onPress={() => setQuickFilter(filter)}
              activeOpacity={0.8}
            >
              <Text style={[styles.quickText, active && styles.quickTextActive]}>
                {filter}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Horizontal Category Circular Icon Slider */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryRow}
      >
        {CATEGORY_CHIPS.map((cat) => {
          const active = selectedCategory === cat.name;
          return (
            <TouchableOpacity
              key={cat.name}
              style={styles.categoryItem}
              onPress={() => setSelectedCategory(active ? 'All' : cat.name)}
              activeOpacity={0.8}
            >
              <View style={[styles.categoryCircle, active && styles.categoryCircleActive]}>
                <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
              </View>
              <Text
                style={[styles.categoryLabel, active && styles.categoryLabelActive]}
                numberOfLines={2}
              >
                {cat.label}
              </Text>
              <Text style={[styles.categoryCount, active && styles.categoryCountActive]}>
                {categoryCounts[cat.name] || 0}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Sustainability Circular Economy Hero Card */}
      <View style={styles.heroStrip}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroKicker}>CIRCULAR CAMPUS MARKET</Text>
          <Text style={styles.heroTitle}>Give More. Waste Less.</Text>
          <Text style={styles.heroSub} numberOfLines={2}>
            {totalListings > 0
              ? `${totalListings} free listing${totalListings === 1 ? '' : 's'} live near ${campusLabel}`
              : `Be the first to share something around ${campusLabel}`}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.heroMapBtn}
          onPress={() => navigation.navigate('Explore')}
          activeOpacity={0.85}
        >
          <Text style={styles.heroMapText}>Map 🗺️</Text>
        </TouchableOpacity>
      </View>

      {/* Campus Urgent Request Banner Call-to-Action */}
      <TouchableOpacity
        style={styles.requestCta}
        onPress={() => navigation.navigate('RequestItem')}
        activeOpacity={0.88}
      >
        <View style={styles.requestCtaIconBox}>
          <Text style={styles.requestCtaIcon}>📣</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.requestCtaTitle}>Need something urgently?</Text>
          <Text style={styles.requestCtaSub} numberOfLines={1}>
            Post a campus request — givers get notified
          </Text>
        </View>
        <View style={styles.requestCtaPlusBox}>
          <Text style={styles.requestCtaPlus}>＋</Text>
        </View>
      </TouchableOpacity>

      {/* Live Campus Urgent Requests Rail */}
      {urgentRequests.length > 0 ? (
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>📣 Urgent Campus Requests</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Explore', { openRequestsFeed: true, refreshAt: Date.now() })}
            >
              <Text style={styles.sectionLink}>See all →</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingRight: 8 }}
          >
            {urgentRequests.map((reqItem) => (
              <TouchableOpacity
                key={reqItem._id}
                style={styles.urgentReqCard}
                onPress={() => navigation.navigate('Explore', { openRequestsFeed: true, refreshAt: Date.now() })}
                activeOpacity={0.85}
              >
                <View style={styles.urgentReqTop}>
                  <View
                    style={[
                      styles.urgentBadge,
                      reqItem.urgency === 'High' ? styles.urgentBadgeHigh : styles.urgentBadgeMed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.urgentBadgeText,
                        reqItem.urgency === 'High' ? styles.urgentTextHigh : styles.urgentTextMed,
                      ]}
                    >
                      {reqItem.urgency === 'High' ? '🔥 URGENT' : '🕒 NEEDED'}
                    </Text>
                  </View>
                  <Text style={styles.urgentCategory}>{reqItem.category}</Text>
                </View>
                <Text style={styles.urgentTitle} numberOfLines={1}>
                  {reqItem.title}
                </Text>
                <Text style={styles.urgentDesc} numberOfLines={2}>
                  {reqItem.description}
                </Text>
                <Text style={styles.urgentMeta} numberOfLines={1}>
                  By {reqItem.requester?.name || 'Campus Student'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Hot Discoveries Nearby Rail */}
      {hotItems.length > 0 ? (
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>🔥 Hot Discoveries Near You</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Explore')}>
              <Text style={styles.sectionLink}>See all →</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.sectionHint}>Closest free items to your spot</Text>
          <View style={styles.hotGrid}>{hotRows.map(renderRow)}</View>
        </View>
      ) : null}

      {/* Feed Header */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>✨ Freshly Added Today</Text>
        <Text style={styles.sectionCount}>{items.length}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F0FDF4" />

      {/* Brand Top Bar with App Logo, Campus Location Pill, Chat and Notification Icons */}
      <View style={styles.topBar}>
        <View style={styles.logoRow}>
          <View style={styles.logoBox}>
            <Text style={styles.logoLetter}>R</Text>
          </View>
          <View>
            <Text style={styles.logoText}>ReUse</Text>
            <Text style={styles.logoSub}>RADAR</Text>
          </View>
        </View>

        {/* GPS Location Pill */}
        <TouchableOpacity
          style={styles.locationPill}
          onPress={fetchLocation}
          activeOpacity={0.8}
        >
          <Text style={styles.locationText} numberOfLines={1}>
            📍 {campusLabel} ⌄
          </Text>
        </TouchableOpacity>

        {/* Messages Shortcut Button */}
        <TouchableOpacity
          style={styles.bellBtn}
          onPress={() => navigation.navigate('Messages')}
          activeOpacity={0.8}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={22} color="#064E3B" />
          {unreadMessages > 0 ? (
            <View style={[styles.bellBadge, styles.chatBadgeBg]}>
              <Text style={styles.bellBadgeText}>
                {unreadMessages > 99 ? '99+' : unreadMessages}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>

        {/* Notifications Shortcut Button */}
        <TouchableOpacity
          style={styles.bellBtn}
          onPress={() => navigation.navigate('Notifications')}
          activeOpacity={0.8}
        >
          <Ionicons name="notifications-outline" size={22} color="#064E3B" />
          {unreadNotifCount > 0 ? (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>
                {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      {/* Main FlatList Feed */}
      <FlatList
        data={rows}
        keyExtractor={(row, index) =>
          `${row[0]?._id || 'row'}-${index}`
        }
        renderItem={({ item: row, index }) => renderRow(row, index)}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? (
            <LoadingSpinner message="Finding free items around you..." />
          ) : (
            <EmptyState
              icon="🌱"
              title="No listings found"
              description="No listings found in this category. Be the first to share something with your campus!"
              actionText="+ List Free Item"
              onAction={() => navigation.navigate('AddItem')}
            />
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footerLoader}>
              <LoadingSpinner message="Loading more discoveries..." size="small" />
            </View>
          ) : items.length > 0 && page < pages ? (
            <TouchableOpacity style={styles.loadMoreBtn} onPress={loadMore}>
              <Text style={styles.loadMoreText}>Load more listings</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ height: 96 }} />
          )
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#059669']}
            tintColor="#059669"
          />
        }
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
};

// UI Stylesheet definitions
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0FDF4',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 10,
    backgroundColor: '#F0FDF4',
    gap: 8,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  logoBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-6deg' }],
  },
  logoLetter: {
    color: '#BEF264',
    fontSize: 18,
    fontWeight: '900',
    transform: [{ rotate: '6deg' }],
  },
  logoText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#064E3B',
    letterSpacing: -0.4,
    lineHeight: 19,
  },
  logoSub: {
    fontSize: 8,
    fontWeight: '900',
    color: '#059669',
    letterSpacing: 2,
    lineHeight: 10,
  },
  locationPill: {
    flex: 1,
    flexShrink: 1,
    maxWidth: 170,
    backgroundColor: '#E6F4EA',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 18,
  },
  locationText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#064E3B',
    textAlign: 'center',
  },
  bellBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    position: 'relative',
  },
  bellIcon: {
    fontSize: 17,
  },
  bellBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  chatBadgeBg: {
    backgroundColor: '#059669',
  },
  searchRow: {
    marginTop: 6,
    marginBottom: 12,
  },
  searchBox: {
    height: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  searchLens: {
    fontSize: 15,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    paddingVertical: 0,
  },
  clearBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  clearIcon: {
    fontSize: 11,
    fontWeight: '900',
    color: '#64748B',
  },
  quickRow: {
    gap: 8,
    paddingRight: 8,
    paddingBottom: 14,
  },
  quickPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickPillActive: {
    backgroundColor: '#064E3B',
    borderColor: '#064E3B',
  },
  quickText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  quickTextActive: {
    color: '#BEF264',
  },
  categoryRow: {
    gap: 14,
    paddingRight: 8,
    paddingBottom: 16,
  },
  categoryItem: {
    width: 84,
    alignItems: 'center',
  },
  categoryCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  categoryCircleActive: {
    backgroundColor: '#064E3B',
    borderColor: '#064E3B',
  },
  categoryEmoji: {
    fontSize: 26,
  },
  categoryLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'center',
    lineHeight: 13,
    minHeight: 26,
  },
  categoryLabelActive: {
    color: '#064E3B',
  },
  categoryCount: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#94A3B8',
    marginTop: 2,
  },
  categoryCountActive: {
    color: '#059669',
  },
  heroStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#064E3B',
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    gap: 12,
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  heroKicker: {
    fontSize: 9,
    fontWeight: '900',
    color: '#BEF264',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  heroSub: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#D1FAE5',
    lineHeight: 15,
  },
  heroMapBtn: {
    backgroundColor: '#BEF264',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  heroMapText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#14532D',
  },
  requestCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 18,
  },
  requestCtaIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestCtaIcon: {
    fontSize: 17,
  },
  requestCtaTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  requestCtaSub: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  requestCtaPlusBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestCtaPlus: {
    fontSize: 14,
    fontWeight: '900',
    color: '#BEF264',
  },
  sectionBlock: {
    marginBottom: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  sectionLink: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#059669',
  },
  sectionHint: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 10,
  },
  sectionCount: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
  },
  hotGrid: {
    marginHorizontal: -5,
  },
  gridRow: {
    flexDirection: 'row',
    marginHorizontal: -5,
  },
  gridSpacer: {
    flex: 1,
    marginHorizontal: 5,
  },
  footerLoader: {
    paddingVertical: 16,
  },
  loadMoreBtn: {
    alignSelf: 'center',
    marginTop: 4,
    marginBottom: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  loadMoreText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#064E3B',
  },
  giveFab: {
    position: 'absolute',
    right: 18,
    bottom: 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#064E3B',
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 26,
    borderWidth: 3,
    borderColor: '#F0FDF4',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  giveFabPlus: {
    fontSize: 16,
    fontWeight: '900',
    color: '#BEF264',
    marginTop: -2,
  },
  giveFabText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#BEF264',
    letterSpacing: 0.6,
  },
  urgentReqCard: {
    width: 220,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  urgentReqTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  urgentBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  urgentBadgeHigh: {
    backgroundColor: '#FEE2E2',
  },
  urgentBadgeMed: {
    backgroundColor: '#FEF3C7',
  },
  urgentBadgeText: {
    fontSize: 9,
    fontWeight: '900',
  },
  urgentTextHigh: {
    color: '#B91C1C',
  },
  urgentTextMed: {
    color: '#92400E',
  },
  urgentCategory: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  urgentTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#064E3B',
    marginBottom: 3,
  },
  urgentDesc: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 15,
    marginBottom: 6,
  },
  urgentMeta: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
});

export default HomeScreen;
