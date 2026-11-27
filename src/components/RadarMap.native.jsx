// =============================================================================
// REUSE RADAR - NATIVE INTERACTIVE RADAR MAP COMPONENT (RadarMap.native.jsx)
// Purpose: Renders an interactive OpenStreetMap + Leaflet campus radar map inside
//          react-native-webview so it works on all Android/iOS devices without
//          requiring any paid Google Maps API key.
// Features:
//   1. Live student GPS dot with animated pulsing halo
//   2. Discovery radius circle overlay (500m, 1km, 5km, 10km, 25km)
//   3. Category emoji map pins with FREE / price tags
//   4. Smooth camera flyTo on radius change, marker tap, or recenter
//   5. Two-way bridge: tapping a map pin notifies ExploreScreen via onSelectItem
// =============================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';

// Default fallback coordinates (Ahmedabad Campus) if GPS is unavailable
const DEFAULT_CENTER = { latitude: 23.0225, longitude: 72.5714 };

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

const hasValidCoords = (item) =>
  Array.isArray(item?.location?.coordinates) &&
  item.location.coordinates.length === 2 &&
  !Number.isNaN(Number(item.location.coordinates[0])) &&
  !Number.isNaN(Number(item.location.coordinates[1]));

const radiusToZoom = (radiusKm) => {
  const km = Number(radiusKm) || 5;
  if (km <= 1) return 15;
  if (km <= 3) return 14;
  if (km <= 5) return 13;
  if (km <= 10) return 12;
  return 11;
};

const MAP_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: #EAF7EF;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .leaflet-tile-pane {
      filter: hue-rotate(8deg) saturate(0.95) brightness(1.02);
    }
    .user-dot-wrap {
      position: relative;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .user-halo {
      position: absolute;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: rgba(5, 150, 105, 0.35);
      animation: pulse 1.8s ease-out infinite;
    }
    .user-core {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #059669;
      border: 2.5px solid #FFFFFF;
      box-shadow: 0 0 6px rgba(5, 150, 105, 0.8);
      z-index: 2;
    }
    @keyframes pulse {
      0% { transform: scale(0.7); opacity: 0.7; }
      100% { transform: scale(2.2); opacity: 0; }
    }
    .item-pin {
      display: flex;
      flex-direction: column;
      align-items: center;
      background: #FFFFFF;
      border: 2px solid #064E3B;
      border-radius: 12px;
      padding: 3px 6px;
      box-shadow: 0 3px 8px rgba(0,0,0,0.22);
      transform: translate(-50%, -85%);
      transition: transform 0.15s ease;
    }
    .item-pin.selected {
      background: #064E3B;
      border: 2.5px solid #BEF264;
      transform: translate(-50%, -92%) scale(1.16);
    }
    .item-emoji {
      font-size: 16px;
      line-height: 18px;
    }
    .item-badge {
      margin-top: 1px;
      background: #BEF264;
      color: #14532D;
      font-size: 8px;
      font-weight: 900;
      padding: 1px 4px;
      border-radius: 5px;
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([23.0225, 72.5714], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    var radiusCircle = null;
    var userMarker = null;
    var itemMarkers = [];

    window.updateRadar = function(payload) {
      if (!payload) return;
      var center = payload.center || { latitude: 23.0225, longitude: 72.5714 };
      var radiusKm = payload.radiusKm || 5;
      var zoom = payload.zoom || 13;
      var selectedId = payload.selectedId || null;
      var hasUser = !!payload.hasUserCoords;
      var items = Array.isArray(payload.items) ? payload.items : [];

      if (payload.recenter || !window.__initialized) {
        map.setView([center.latitude, center.longitude], zoom, { animate: true });
        window.__initialized = true;
      }

      if (radiusCircle) map.removeLayer(radiusCircle);
      radiusCircle = L.circle([center.latitude, center.longitude], {
        radius: radiusKm * 1000,
        color: '#059669',
        weight: 2,
        fillColor: '#059669',
        fillOpacity: 0.12
      }).addTo(map);

      if (userMarker) {
        map.removeLayer(userMarker);
        userMarker = null;
      }
      if (hasUser) {
        var userIcon = L.divIcon({
          className: '',
          html: '<div class="user-dot-wrap"><div class="user-halo"></div><div class="user-core"></div></div>',
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });
        userMarker = L.marker([center.latitude, center.longitude], { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
      }

      itemMarkers.forEach(function(m) { map.removeLayer(m); });
      itemMarkers = [];

      items.forEach(function(it) {
        var isSel = selectedId && String(selectedId) === String(it.id);
        var pinHtml = '<div class="item-pin' + (isSel ? ' selected' : '') + '">'
          + '<span class="item-emoji">' + it.emoji + '</span>'
          + '<span class="item-badge">' + it.badge + '</span>'
          + '</div>';
        var icon = L.divIcon({
          className: '',
          html: pinHtml,
          iconSize: [44, 42],
          iconAnchor: [22, 36]
        });
        var marker = L.marker([it.lat, it.lng], { icon: icon }).addTo(map);
        marker.on('click', function() {
          map.panTo([it.lat, it.lng], { animate: true });
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'selectItem', id: it.id }));
          }
        });
        itemMarkers.push(marker);
      });
    };

    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'mapReady' }));
    }
  </script>
</body>
</html>`;

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
  const webViewRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  const hasUserCoords =
    userLocation &&
    !Number.isNaN(Number(userLocation.latitude)) &&
    !Number.isNaN(Number(userLocation.longitude));

  const center = useMemo(
    () =>
      hasUserCoords
        ? { latitude: Number(userLocation.latitude), longitude: Number(userLocation.longitude) }
        : fallbackCenter,
    [hasUserCoords, userLocation?.latitude, userLocation?.longitude, fallbackCenter]
  );

  const mappableItems = useMemo(() => items.filter(hasValidCoords), [items]);

  const serializedItems = useMemo(
    () =>
      mappableItems.map((it) => ({
        id: it._id,
        lat: Number(it.location.coordinates[1]),
        lng: Number(it.location.coordinates[0]),
        emoji: getCategoryEmoji(it.category),
        badge: it.listingType === 'sell' && it.price > 0 ? `₹${it.price}` : 'FREE',
      })),
    [mappableItems]
  );

  const pushStateToMap = (recenter = false) => {
    if (!webViewRef.current || !mapReady) return;
    const payload = {
      center,
      hasUserCoords: Boolean(hasUserCoords),
      radiusKm: Number(selectedRadius) || 5,
      zoom: radiusToZoom(selectedRadius),
      selectedId: selectedItem?._id || null,
      items: serializedItems,
      recenter,
    };
    const js = `window.updateRadar && window.updateRadar(${JSON.stringify(payload)}); true;`;
    webViewRef.current.injectJavaScript(js);
  };

  useEffect(() => {
    pushStateToMap(true);
  }, [mapReady, center.latitude, center.longitude, selectedRadius, recenterSignal]);

  useEffect(() => {
    pushStateToMap(false);
  }, [serializedItems, selectedItem?._id]);

  const handleMessage = (event) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'mapReady') {
        setMapReady(true);
      } else if (msg.type === 'selectItem' && msg.id) {
        const match = mappableItems.find((it) => String(it._id) === String(msg.id));
        if (match) onSelectItem?.(match);
      }
    } catch (e) {
      // Ignore malformed bridge messages
    }
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: MAP_HTML }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        onMessage={handleMessage}
        onLoadEnd={() => setMapReady(true)}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      />

      {loading || !mapReady ? (
        <View style={styles.loadingPill}>
          <ActivityIndicator size="small" color="#059669" />
          <Text style={styles.loadingPillText}>
            {loading ? 'Scanning radar...' : 'Loading campus map...'}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    minHeight: 240,
    backgroundColor: '#EAF7EF',
  },
  webview: {
    flex: 1,
    backgroundColor: '#EAF7EF',
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
