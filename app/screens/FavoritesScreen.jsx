// =============================================================================
// REUSE RADAR - FAVORITES SCREEN (FavoritesScreen.jsx)
// Purpose: Displays the user's bookmarked and watched items.
// Features:
// 1. Fetches user's saved items via favoriteService from MongoDB.
// 2. 2-column responsive grid layout with ItemCard components.
// 3. Optimistic UI update when an item is removed from favorites.
// 4. Pull-to-refresh control for real-time list synchronization.
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Image,
  StatusBar,
  Dimensions,
  ActivityIndicator,
} from 'react-native';

// Import favorite service to fetch user's saved wishlist items from backend
import { favoriteService } from '../services/favoriteService';
// Import reusable components
import ItemCard from '../components/ItemCard';
import EmptyState from '../components/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner';
import { COLORS } from '../utils/constants';

// Retrieve window dimensions for responsive UI calculations
const { width } = Dimensions.get('window');

const FavoritesScreen = ({ navigation }) => {
  // State for storing the list of favorite items
  const [favorites, setFavorites] = useState([]);
  // Loading state during initial data fetch
  const [loading, setLoading] = useState(true);
  // Pull-to-refresh indicator state
  const [refreshing, setRefreshing] = useState(false);

  // Mechanism 1: Fetch Saved Favorites from Backend
  // Wrapped in useCallback to prevent unnecessary re-creation of function
  const fetchFavorites = useCallback(async () => {
    try {
      const res = await favoriteService.getFavorites();
      if (res && res.success) {
        // Store populated items array from backend response
        setFavorites(res.items || []);
      }
    } catch (err) {
      console.log('[FavoritesScreen] Fetch error:', err.message);
    } finally {
      // Clear spinners once network request completes
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Fetch favorites on initial screen mount
  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  // Mechanism 2: Pull-to-refresh handler
  const onRefresh = () => {
    setRefreshing(true);
    fetchFavorites();
  };

  // Mechanism 3: Optimistic Favorite Toggle Handler
  // If the user un-hearts an item, remove it instantly from the local list
  // without needing a full round-trip page refresh
  const handleFavoriteToggle = (item, isFav) => {
    if (!isFav) {
      // Filter out un-favorited item from state
      setFavorites((prev) => prev.filter((i) => i._id !== item._id));
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F0FDF4" />

      {/* Top Header Bar with Back Button and Brand Title */}
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
          <Text style={styles.topBarTitle}>Saved Items & Watchlist</Text>
        </View>

        {/* Balance layout spacing */}
        <View style={{ width: 36 }} />
      </View>

      {/* Summary Count Header Bar showing total saved items */}
      <View style={styles.countBar}>
        <Text style={styles.countText}>
          💚 {favorites.length} {favorites.length === 1 ? 'ITEM SAVED' : 'ITEMS SAVED'}
        </Text>
        <Text style={styles.activeWatchlistText}>Tracking in 5 km radius</Text>
      </View>

      {/* Conditional Rendering: Loading Spinner vs Empty State vs Items Grid */}
      {loading ? (
        <LoadingSpinner message="Loading saved items..." />
      ) : favorites.length === 0 ? (
        <View style={styles.emptyContainer}>
          <EmptyState
            icon="💚"
            title="No Saved Items Yet"
            message="Save items you like while browsing and track their availability here."
            actionTitle="Explore Items"
            onAction={() => navigation.navigate('Explore')}
          />
        </View>
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(item) => item._id}
          numColumns={2} // 2-column grid layout
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#064E3B']} />
          }
          renderItem={({ item }) => (
            <ItemCard
              item={item}
              isGrid={true}
              isFavoriteInitial={true}
              onFavoriteToggle={handleFavoriteToggle}
              onPress={() => navigation.navigate('ItemDetails', { item, itemId: item._id })}
            />
          )}
        />
      )}
    </View>
  );
};

// Component Stylesheet
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
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniLogoLetter: {
    color: '#BEF264',
    fontSize: 14,
    fontWeight: '900',
  },
  topBarTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#064E3B',
  },
  countBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#ECFDF5',
    marginHorizontal: 16,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  countText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#064E3B',
    letterSpacing: 0.5,
  },
  activeWatchlistText: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 11,
    paddingBottom: 40,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
});

export default FavoritesScreen;
