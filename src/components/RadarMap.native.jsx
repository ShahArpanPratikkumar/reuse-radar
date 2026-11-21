// =============================================================================
// REUSE RADAR - NATIVE INTERACTIVE RADAR MAP COMPONENT (RadarMap.native.jsx)
// Purpose: Renders the campus geospatial map using react-native-maps.
// Features:
//   1. Live student GPS blue dot with animated pulsing halo
//   2. Discovery radius circle overlay (e.g. 500m, 1km, 5km)
//   3. Category emoji map pins for nearby reusable items
//   4. Eco-friendly custom Google Maps styling palette
//   5. Camera animation on radius change, marker tap, or recenter
// =============================================================================

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  ActivityIndicator,
} from 'react-native';
// MapView, Marker, and Circle components from react-native-maps bridge to native Apple/Google Maps
import MapView, { Marker, Circle } from 'react-native-maps';

// Default fallback coordinates (Ahmedabad Campus) if student's device GPS is disabled or unavailable
const DEFAULT_CENTER = { latitude: 23.0225, longitude: 72.5714 };

// Clean eco-green Google Maps JSON styling array (mint green land, soft roads, forest green accents)
const ECO_MAP_STYLE = [
  // Base map geometry styled with soft mint pastel green
  { elementType: 'geometry', stylers: [{ color: '#EAF7EF' }] },
  // Map text labels filled with dark forest green
  { elementType: 'labels.text.fill', stylers: [{ color: '#1F4D3A' }] },
  // White outline stroke around labels for high contrast
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  // Administrative boundaries
  {
    featureType: 'administrative',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#B7E4C7' }],
  },
  // Land parcel borders
  {
    featureType: 'administrative.land_parcel',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#CDEBD8' }],
  },
  // Natural landscape features
  {
    featureType: 'landscape.natural',
    elementType: 'geometry',
    stylers: [{ color: '#DDF3E4' }],
  },
  // Points of interest geometry
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#CBEBD6' }] },
  // Parks and green recreation areas
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#B7E4C7' }],
  },
  // Point of interest label texts
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#166534' }],
  },
  // Road surface geometry
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  // Road border strokes
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#CDEBD8' }],
  },
  // Road name text labels
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#3F6212' }],
  },
  // Highway geometry
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#F0FDF4' }],
  },
  // Public transit routes
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#D1FAE5' }],
  },
  // Water bodies (rivers, lakes) styled in soft sky blue
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#BFDBFE' }] },
  // Water body text labels
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#1D4ED8' }],
  },
];

/**
 * Maps each item category name to its corresponding emoji icon for the map marker
 * @param {string} category - Category string (e.g. 'Books', 'Electronics')
 * @returns {string} Emoji character
 */
const getCategoryEmoji = (category) => {
  switch (category) {
    case 'Books':
    case 'Study Material':
      return '📚';
    case 'Electronics':
      return '💻';
    case 'Furniture':
      return '🪑';
    case 'Clothes':
      return '👕';
    case 'Cycles':
      return '🚲';
    case 'Bags':
      return '🎒';
    case 'Toys':
      return '🧸';
    case 'Household':
      return '🪴';
    default:
      return '📦';
  }
};

/**
 * Validates if an item has a valid [lng, lat] GeoJSON coordinates array
 * @param {Object} item - Item object
 * @returns {boolean} True if coordinates exist and are valid numbers
 */
const hasValidCoords = (item) =>
  Array.isArray(item?.location?.coordinates) &&
  item.location.coordinates.length === 2 &&
  !Number.isNaN(Number(item.location.coordinates[0])) &&
  !Number.isNaN(Number(item.location.coordinates[1]));

/**
 * Extracts React Native Maps coordinate object {latitude, longitude} from MongoDB GeoJSON [lng, lat]
 * Notice: MongoDB stores coordinates as [longitude, latitude], while maps require {latitude, longitude}
 * @param {Object} item - Item object
 * @returns {Object} Coordinate object with latitude and longitude
 */
const itemCoordinate = (item) => ({
  latitude: Number(item.location.coordinates[1]),
  longitude: Number(item.location.coordinates[0]),
});

/**
 * Converts a radius in kilometers into an appropriate latitude/longitude delta for MapView zoom
 * Formula: 1 degree of latitude is approximately 111 kilometers.
 * @param {number} radiusKm - Radius in kilometers
 * @returns {number} Map delta value
 */
const radiusToDelta = (radiusKm) => Math.max((Number(radiusKm) * 2.2) / 111, 0.005);

/**
 * Animated Map Pin Component for an item on the radar map
 * Bounces/scales up smoothly when selected by the student
 */
const ItemPin = ({ emoji, isSelected }) => {
  // Animated value tracking the scale of the marker pin
  const scale = useRef(new Animated.Value(1)).current;

  // Trigger spring animation whenever isSelected state toggles
  useEffect(() => {
    Animated.spring(scale, {
      toValue: isSelected ? 1.25 : 1, // 25% larger when selected
      friction: 5,                   // Spring bounciness
      tension: 140,                  // Spring speed
      useNativeDriver: true,         // Hardware acceleration on GPU
    }).start();
  }, [isSelected, scale]);

  return (
    <Animated.View
      style={[styles.pin, isSelected && styles.pinSelected, { transform: [{ scale }] }]}
    >
      {/* Category Emoji Icon */}
      <Text style={styles.pinEmoji}>{emoji}</Text>

      {/* Mini "FREE" badge tag */}
      <View style={styles.pinFreeTag}>
        <Text style={styles.pinFreeText}>FREE</Text>
      </View>

      {/* Triangular downward pointer tail for pin */}
      <View style={styles.pinTail} />
    </Animated.View>
  );
};

/**
 * User Location Dot Component
 * Displays a pulsating teal/green halo around the user's current GPS position
 */
const UserDot = () => {
  // Animated value for pulsing wave cycle
  const pulse = useRef(new Animated.Value(0)).current;

  // Infinite looping pulse animation
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1600, // 1.6 second expansion cycle
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 0, // Reset to zero immediately
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop(); // Clean up animation on unmount
  }, [pulse]);

  // Interpolate pulse value to expand scale and fade opacity
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 2.1] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <View style={styles.userDotWrapper}>
      {/* Pulsing circular halo */}
      <Animated.View style={[styles.userHalo, { transform: [{ scale }], opacity }]} />
      {/* Solid inner blue/teal dot */}
      <View style={styles.userDot} />
    </View>
  );
};

/**
 * Ripple Ring Component
 * Displays scanning sonar rings when no items are currently found in radius
 */
const RippleRing = ({ delay }) => {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay), // Staggered start delay for each wave ring
        Animated.timing(progress, {
          toValue: 1,
          duration: 2600,
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [delay, progress]);

  // Expand ripple ring from small to large
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1.8] });
  // Fade opacity out as ring expands
  const opacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.rippleRing, { transform: [{ scale }], opacity }]}
    />
  );
};

/**
 * RadarMap Main Component
 * Renders the full interactive MapView with markers, GPS dot, and discovery circle
 */
const RadarMap = ({
  items = [],
  userLocation = null,
  selectedRadius = 5,
  selectedItem = null,
  onSelectItem,
  recenterSignal = 0,
  fallbackCenter = DEFAULT_CENTER,
  loading = false,
}) => {
  // Reference to MapView instance for programmatic camera panning
  const mapRef = useRef(null);

  // State tracking whether native map has finished loading
  const [mapReady, setMapReady] = useState(false);

  // Validate user GPS coordinates
  const hasUserCoords =
    userLocation &&
    !Number.isNaN(Number(userLocation.latitude)) &&
    !Number.isNaN(Number(userLocation.longitude));

  // Center on user GPS if available, else campus fallback
  const center = hasUserCoords
    ? { latitude: Number(userLocation.latitude), longitude: Number(userLocation.longitude) }
    : fallbackCenter;

  // Filter items to only those with valid geo coordinates
  const mappableItems = items.filter(hasValidCoords);
  const centerLat = center.latitude;
  const centerLng = center.longitude;

  /**
   * Smoothly animates the map camera to a specific coordinate and zoom level
   * @param {Object} coords - Target {latitude, longitude}
   * @param {number} radiusKm - Zoom radius in km
   * @param {number} duration - Animation duration in ms
   */
  const animateTo = (coords, radiusKm, duration = 650) => {
    if (!mapRef.current) return;
    const delta = radiusToDelta(radiusKm);
    mapRef.current.animateToRegion(
      {
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: delta,
        longitudeDelta: delta,
      },
      duration
    );
  };

  // Re-animate map view whenever radius slider or center location changes
  useEffect(() => {
    if (!mapReady) return;
    animateTo({ latitude: centerLat, longitude: centerLng }, selectedRadius);
  }, [mapReady, selectedRadius, centerLat, centerLng]);

  // Re-center map when user taps "My Location" GPS button
  useEffect(() => {
    if (!mapReady || recenterSignal <= 0) return;
    animateTo({ latitude: centerLat, longitude: centerLng }, selectedRadius, 750);
  }, [recenterSignal]);

  // Focus map camera on an item pin when user taps its preview card
  useEffect(() => {
    if (!mapReady || !selectedItem || !hasValidCoords(selectedItem)) return;
    const delta = Math.min(radiusToDelta(selectedRadius), 0.03);
    const coords = itemCoordinate(selectedItem);
    mapRef.current?.animateToRegion(
      {
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: delta,
        longitudeDelta: delta,
      },
      520
    );
  }, [mapReady, selectedItem && selectedItem._id]);

  // Initial delta zoom calculation
  const initialDelta = radiusToDelta(selectedRadius);

  // Determine if empty radar ripple animation should show
  const showEmptyRipple = !loading && mappableItems.length === 0;

  return (
    <View style={styles.container}>
      {/* Native MapView container */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: centerLat,
          longitude: centerLng,
          latitudeDelta: initialDelta,
          longitudeDelta: initialDelta,
        }}
        customMapStyle={ECO_MAP_STYLE} // Eco green map theme
        showsUserLocation={false}      // Managed manually via UserDot for custom halo
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        loadingEnabled
        loadingBackgroundColor="#F0FDF4"
        loadingIndicatorColor="#059669"
        onMapReady={() => setMapReady(true)}
      >
        {/* Discovery radius circle overlay */}
        <Circle
          center={{ latitude: centerLat, longitude: centerLng }}
          radius={Number(selectedRadius) * 1000} // Radius converted to meters
          strokeColor="#059669"                  // Dark green outline
          strokeWidth={2}
          fillColor="rgba(5, 150, 105, 0.15)"    // Translucent green tint
        />

        {/* Live student GPS position marker */}
        {hasUserCoords ? (
          <Marker
            coordinate={{ latitude: centerLat, longitude: centerLng }}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={999}
          >
            <UserDot />
          </Marker>
        ) : null}

        {/* Nearby item markers with category emoji icons */}
        {mappableItems.map((item) => {
          const isSelected = selectedItem?._id === item._id;
          return (
            <Marker
              key={item._id}
              coordinate={itemCoordinate(item)}
              anchor={{ x: 0.5, y: 0.9 }}
              onPress={() => onSelectItem?.(item)}
            >
              <ItemPin emoji={getCategoryEmoji(item.category)} isSelected={isSelected} />
            </Marker>
          );
        })}
      </MapView>

      {/* Animated radar sonar ripples when zero items found in area */}
      {showEmptyRipple ? (
        <View pointerEvents="none" style={styles.rippleOverlay}>
          <RippleRing delay={0} />
          <RippleRing delay={900} />
          <RippleRing delay={1800} />
        </View>
      ) : null}

      {/* Floating scanning pill indicator while querying backend */}
      {loading ? (
        <View style={styles.loadingPill}>
          <ActivityIndicator size="small" color="#059669" />
          <Text style={styles.loadingPillText}>Scanning radar...</Text>
        </View>
      ) : null}
    </View>
  );
};

// =============================================================================
// COMPONENT STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    minHeight: 240,
    backgroundColor: '#DCFCE7',
  },
  pin: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 46,
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#064E3B',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  pinSelected: {
    borderColor: '#BEF264',
    borderWidth: 3,
    backgroundColor: '#064E3B',
  },
  pinEmoji: {
    fontSize: 18,
  },
  pinFreeTag: {
    marginTop: 1,
    backgroundColor: '#BEF264',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  pinFreeText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#14532D',
    letterSpacing: 0.3,
  },
  pinTail: {
    position: 'absolute',
    bottom: -6,
    width: 8,
    height: 8,
    borderRadius: 1,
    backgroundColor: '#064E3B',
    transform: [{ rotate: '45deg' }],
  },
  userDotWrapper: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userHalo: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#059669',
  },
  userDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#059669',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 5,
    elevation: 5,
  },
  rippleOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rippleRing: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 2,
    borderColor: '#059669',
    backgroundColor: 'rgba(5, 150, 105, 0.06)',
  },
  loadingPill: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  loadingPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#064E3B',
  },
});

export default RadarMap;
