import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Real interactive map for the web build (Leaflet + OpenStreetMap tiles).
// Mirrors the native RadarMap contract: item pins, GPS dot and radius circle.

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

const itemCoordinate = (item) => [
  Number(item.location.coordinates[1]),
  Number(item.location.coordinates[0]),
];

// Zoom level that frames the discovery radius inside the map viewport.
const radiusToZoom = (radiusKm, size, latitude) => {
  const minDimension = Math.min(size.x || 0, size.y || 0) || 640;
  const metersPerPixel = (Number(radiusKm) * 2000 * 1.15) / minDimension;
  const zoom = Math.log2(
    (156543.03392 * Math.cos((Number(latitude) * Math.PI) / 180)) / metersPerPixel
  );
  return Math.max(2, Math.min(17, zoom));
};

const MAP_CSS = `
.rr-marker { background: transparent; border: 0; }
.rr-pin {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 46px;
  padding: 5px 7px 4px;
  background: #FFFFFF;
  border: 2px solid #064E3B;
  border-radius: 14px;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.22);
  transition: transform 0.18s ease, background 0.18s ease, border-color 0.18s ease;
}
.rr-pin--selected {
  background: #064E3B;
  border-color: #BEF264;
  border-width: 3px;
  transform: scale(1.18);
  z-index: 5;
}
.rr-pin__emoji { font-size: 18px; line-height: 1; }
.rr-pin__free {
  margin-top: 1px;
  padding: 1px 5px;
  border-radius: 6px;
  background: #BEF264;
  color: #14532D;
  font: 900 7px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  letter-spacing: 0.3px;
}
.rr-pin__tail {
  position: absolute;
  bottom: -6px;
  left: 50%;
  width: 8px;
  height: 8px;
  margin-left: -4px;
  border-radius: 1px;
  background: #064E3B;
  transform: rotate(45deg);
}
.rr-user-marker { background: transparent; border: 0; }
.rr-user { position: relative; display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; }
.rr-user__halo {
  position: absolute;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: #059669;
  animation: rr-user-pulse 2s ease-out infinite;
}
.rr-user__dot {
  position: relative;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #059669;
  border: 3px solid #FFFFFF;
  box-shadow: 0 0 6px rgba(5, 150, 105, 0.9);
}
@keyframes rr-user-pulse {
  0% { transform: scale(0.6); opacity: 0.55; }
  100% { transform: scale(2.1); opacity: 0; }
}
.leaflet-container {
  background: #E8F3EC;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.leaflet-tile-pane { filter: saturate(0.9) hue-rotate(16deg) brightness(1.04); }
.leaflet-control-attribution { font-size: 9px; background: rgba(255, 255, 255, 0.82); }
.leaflet-control-zoom a { color: #064E3B; }
`;

let stylesInjected = false;
const injectMapStyles = () => {
  if (stylesInjected || typeof document === 'undefined') return;
  const tag = document.createElement('style');
  tag.id = 'rr-radar-map-styles';
  tag.appendChild(document.createTextNode(MAP_CSS));
  document.head.appendChild(tag);
  stylesInjected = true;
};

const buildPinIcon = (emoji, isSelected) =>
  L.divIcon({
    className: 'rr-marker',
    html: `<div class="rr-pin${isSelected ? ' rr-pin--selected' : ''}">
      <span class="rr-pin__emoji">${emoji}</span>
      <span class="rr-pin__free">FREE</span>
      <span class="rr-pin__tail"></span>
    </div>`,
    iconSize: [46, 56],
    iconAnchor: [23, 56],
  });

const USER_ICON = L.divIcon({
  className: 'rr-user-marker',
  html: '<div class="rr-user"><span class="rr-user__halo"></span><span class="rr-user__dot"></span></div>',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

const RadarMap = ({
  items = [],
  userLocation = null,
  selectedRadius = 5,
  selectedItem = null,
  onSelectItem,
  recenterSignal = 0,
  locationName = 'your area',
  fallbackCenter = DEFAULT_CENTER,
  loading = false,
}) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const circleRef = useRef(null);
  const userMarkerRef = useRef(null);
  const itemLayerRef = useRef(null);
  const frameTimerRef = useRef(null);
  const onSelectRef = useRef(onSelectItem);

  onSelectRef.current = onSelectItem;

  const hasUserCoords =
    !!userLocation &&
    !Number.isNaN(Number(userLocation.latitude)) &&
    !Number.isNaN(Number(userLocation.longitude));

  const centerLat = hasUserCoords ? Number(userLocation.latitude) : fallbackCenter.latitude;
  const centerLng = hasUserCoords ? Number(userLocation.longitude) : fallbackCenter.longitude;
  const selectedId = selectedItem?._id || null;

  /**
   * Animate the camera to frame the discovery radius. Browsers throttle
   * requestAnimationFrame in background tabs, which can leave Leaflet's fly
   * animation unfinished, so the target frame is forced if it never lands.
   */
  const frameRadius = (map, lat, lng, radiusKm, duration) => {
    const target = L.latLng(lat, lng);
    const zoom = radiusToZoom(radiusKm, map.getSize(), lat);

    if (frameTimerRef.current) clearTimeout(frameTimerRef.current);
    map.stop();
    map.flyTo(target, zoom, { duration, easeLinearity: 0.25 });

    frameTimerRef.current = setTimeout(() => {
      const activeMap = mapRef.current;
      if (!activeMap) return;
      const currentCenter = activeMap.getCenter();
      const offCenter =
        Math.abs(currentCenter.lat - lat) > 0.0001 ||
        Math.abs(currentCenter.lng - lng) > 0.0001;
      if (Math.abs(activeMap.getZoom() - zoom) > 0.05 || offCenter) {
        activeMap.setView(target, zoom, { animate: false });
      }
    }, duration * 1000 + 700);
  };

  // Create the map once the container element exists.
  useEffect(() => {
    const node = containerRef.current;
    if (!node || mapRef.current) return undefined;

    injectMapStyles();

    const map = L.map(node, {
      zoomControl: true,
      attributionControl: true,
      minZoom: 2,
      maxZoom: 19,
      worldCopyJump: true,
    }).setView([centerLat, centerLng], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    circleRef.current = L.circle([centerLat, centerLng], {
      radius: Number(selectedRadius) * 1000,
      color: '#059669',
      weight: 2,
      fillColor: 'rgba(5, 150, 105, 0.15)',
      fillOpacity: 1,
      interactive: false,
    }).addTo(map);

    itemLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // Leaflet needs a nudge when the flex container settles or is resized.
    const raf = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(() => map.invalidateSize())
      : null;
    const settleTimer = setTimeout(() => map.invalidateSize(), 300);

    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => map.invalidateSize());
      observer.observe(node);
    }

    return () => {
      clearTimeout(settleTimer);
      if (frameTimerRef.current) clearTimeout(frameTimerRef.current);
      if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
      if (observer) observer.disconnect();
      map.remove();
      mapRef.current = null;
      circleRef.current = null;
      userMarkerRef.current = null;
      itemLayerRef.current = null;
    };
    // Map is created once; subsequent prop changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Radius circle + GPS dot + animated camera framing for the active radius.
  useEffect(() => {
    const map = mapRef.current;
    const circle = circleRef.current;
    if (!map || !circle) return;

    circle.setLatLng([centerLat, centerLng]);
    circle.setRadius(Number(selectedRadius) * 1000);

    if (hasUserCoords) {
      if (!userMarkerRef.current) {
        userMarkerRef.current = L.marker([centerLat, centerLng], {
          icon: USER_ICON,
          zIndexOffset: 2000,
          interactive: false,
          keyboard: false,
        }).addTo(map);
      } else {
        userMarkerRef.current.setLatLng([centerLat, centerLng]);
      }
    } else if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }

    map.invalidateSize();
    frameRadius(map, centerLat, centerLng, selectedRadius, 0.8);
    // frameRadius is recreated per render but only reads refs and props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerLat, centerLng, selectedRadius, hasUserCoords]);

  // "Locate Me" control.
  useEffect(() => {
    if (recenterSignal <= 0) return;
    const map = mapRef.current;
    const circle = circleRef.current;
    if (!map || !circle) return;
    map.invalidateSize();
    frameRadius(map, centerLat, centerLng, selectedRadius, 0.9);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterSignal]);

  // Live item pins, rebuilt whenever the item list or selection changes.
  useEffect(() => {
    const layer = itemLayerRef.current;
    if (!layer) return;

    layer.clearLayers();
    items.filter(hasValidCoords).forEach((item) => {
      const coordinate = itemCoordinate(item);
      const isSelected = selectedId && selectedId === item._id;
      const marker = L.marker(coordinate, {
        icon: buildPinIcon(getCategoryEmoji(item.category), isSelected),
        zIndexOffset: isSelected ? 1000 : 0,
        title: item.title || 'Free item',
      });
      marker.on('click', () => onSelectRef.current?.(item));
      marker.addTo(layer);
    });
  }, [items, selectedId]);

  return (
    <View style={styles.container}>
      <View ref={containerRef} style={styles.mapNode} />

      {loading ? (
        <View style={styles.loadingPill} pointerEvents="none">
          <ActivityIndicator size="small" color="#059669" />
          <Text style={styles.loadingPillText}>Scanning {locationName}...</Text>
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
    position: 'relative',
    backgroundColor: '#E8F3EC',
  },
  mapNode: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  loadingPill: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
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
