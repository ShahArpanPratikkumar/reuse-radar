// =============================================================================
// REUSE RADAR - API CONFIG (apiConfig.js)
// Purpose: Single source of truth for "where is the backend server?".
//          Automatically discovers the backend IP from the Expo dev server manifest.
//          No hardcoded laptop IP addresses needed — works on any network/WiFi.
// Resolution order (best guess to fallback):
//   1. Platform web             → http://localhost:5000/api
//   2. EXPO_PUBLIC_API_URL env  → Whatever developer set in .env file
//   3. Expo dev-server host     → http://<dev-machine-LAN-IP>:5000/api (auto-detected)
//   4. Android emulator bridge  → http://10.0.2.2:5000/api
// Features:
//   1. Auto-discovery from Expo manifest (no hardcoded IPs)
//   2. Health ping verification before committing to a base URL
//   3. Cached resolved URL (no repeated pings on every API call)
//   4. invalidateApiBaseUrl() for reconnection after network changes
//   5. resolveImageUri() converts relative server paths to full image URLs
//   6. authEvents bus: notifies AuthContext when JWT expires
//   7. connectivityEvents bus: notifies banner when network goes offline
// =============================================================================

// 'Platform' tells us if we're running on iOS, Android, or web
import { Platform } from 'react-native';

// 'expo-constants' gives access to app config and the Expo dev server host info
import Constants from 'expo-constants';

// The backend Express server runs on port 5000
export const API_PORT = 5000;

// Maximum time to wait for a health ping before giving up on a candidate URL
const HEALTH_TIMEOUT_MS = 2500; // 2.5 seconds

// =============================================================================
// Helper: Normalize a raw URL string to a clean API base URL
// Handles: missing protocol, trailing slashes, missing /api suffix
// =============================================================================

const normalizeBaseUrl = (raw) => {
  if (!raw || typeof raw !== 'string') return null;

  let url = raw.trim();
  if (!url) return null;

  // Add http:// protocol if the URL doesn't have one (e.g., "192.168.1.185:5000")
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;

  // Remove trailing slashes (prevents double slashes in routes)
  url = url.replace(/\/+$/, '');

  // Add /api suffix if not already present
  if (!/\/api$/i.test(url)) url = `${url}/api`;

  return url; // Returns something like: "http://192.168.1.185:5000/api"
};

// =============================================================================
// Helper: Extract the developer's laptop IP from Expo's dev server manifest
// This is the KEY feature that makes "no hardcoded IP" work:
//   When you run `npx expo start`, Expo embeds the laptop's LAN IP in the
//   app's manifest. We read it here and derive the backend URL from it.
// =============================================================================

const getExpoDevHost = () => {
  // Try multiple properties from Constants — the right one depends on Expo SDK version
  const sources = [
    Constants?.expoConfig?.hostUri,                           // Expo SDK 48+
    Constants?.expoGoConfig?.debuggerHost,                    // Expo Go
    Constants?.manifest2?.extra?.expoGo?.debuggerHost,        // Expo SDK 46-47
    Constants?.manifest?.debuggerHost,                        // Older Expo SDK
    Constants?.linkingUri,                                    // Fallback
  ];

  for (const source of sources) {
    if (!source || typeof source !== 'string') continue;

    // Strip the scheme (e.g., "exp://") if present
    const withoutScheme = source.replace(/^[a-z]+:\/\//i, '');

    // Format may be "192.168.1.185:19000/--/..." — take the host:port part
    const hostPort = withoutScheme.split('/')[0];

    // Extract just the IP address (without the Expo port 19000)
    const host = hostPort.split(':')[0];

    if (!host) continue;

    // Skip localhost/127.0.0.1 — useless for a physical device
    if (host === 'localhost' || host === '127.0.0.1') continue;

    return host; // Returns "192.168.1.185" (or whatever the current LAN IP is)
  }
  return null; // No valid host found
};

// =============================================================================
// getApiBaseUrlCandidates()
// Returns an ordered list of API URLs to try, best guess first.
// The app pings each one and uses the first that responds.
// =============================================================================

export const getApiBaseUrlCandidates = () => {
  const candidates = [];

  // Helper to add a URL only if it's valid and not already in the list
  const add = (value) => {
    const normalized = normalizeBaseUrl(value);
    if (normalized && !candidates.includes(normalized)) candidates.push(normalized);
  };

  // Priority 1: Explicitly set environment variable (production Vercel, Render backend, or custom IP)
  add(process.env.EXPO_PUBLIC_API_URL);

  // Fallback to live production Render deployment for mobile standalone APK
  add('https://reuse-radar.onrender.com/api');

  // On web (local Expo web dev), fallback to localhost if env is not explicitly set
  if (Platform.OS === 'web') {
    add('http://localhost:5000');
    return candidates;
  }

  // Priority 2: Auto-discovered LAN IP from Expo dev server manifest
  const devHost = getExpoDevHost();
  if (devHost) add(`http://${devHost}:${API_PORT}`); // e.g., http://192.168.1.185:5000

  // Priority 3: Android emulator special IP (10.0.2.2 routes to host machine's localhost)
  add(`http://10.0.2.2:${API_PORT}`);

  // Last resort fallback if no candidates were added
  if (candidates.length === 0) candidates.push(`http://localhost:${API_PORT}/api`);

  return candidates;
};

// =============================================================================
// Resolved URL cache
// Once we find a working URL, we cache it so subsequent API calls don't need to ping again.
// =============================================================================

let resolvedBaseUrl = null; // null = not yet resolved; set after first successful ping

// Synchronous best guess — used for image URLs where we can't await
// Returns the cached URL if already resolved, or the first candidate as a guess
export const getApiBaseUrlSync = () =>
  resolvedBaseUrl || getApiBaseUrlCandidates()[0];

// Force the next request to re-discover the backend (called when network changes)
export const invalidateApiBaseUrl = () => {
  resolvedBaseUrl = null; // Clears the cache; next resolveApiBaseUrl() will re-ping
};

// =============================================================================
// pingOnce() — Tests if a URL responds to our /health endpoint
// Uses AbortController to enforce a timeout (doesn't hang forever)
// =============================================================================

const pingOnce = async (baseUrl, timeoutMs) => {
  const controller = new AbortController(); // AbortController lets us cancel fetch requests

  // Set a timer that cancels the fetch request if it takes too long
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Try to reach the /health endpoint of the candidate URL
    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal, // Abort signal from AbortController
    });
    return response.ok; // Returns true if HTTP status is 200-299
  } catch (error) {
    return false; // Network error or timeout — this URL is not reachable
  } finally {
    clearTimeout(timer); // Always clear the timer to prevent memory leaks
  }
};

// Public health check for useNetworkStatus hook
export const checkServerHealth = async (timeoutMs = 4000) => {
  const baseUrl = await resolveApiBaseUrl(); // Use the already-resolved URL
  return pingOnce(baseUrl, timeoutMs);
};

// =============================================================================
// resolveApiBaseUrl() — The main function: finds and caches the working backend URL
// Called by api.js's request interceptor before every API call.
// Never throws: if nothing answers, returns the first candidate so we get a real
// network error that the retry/backoff layer in api.js can handle.
// =============================================================================

export const resolveApiBaseUrl = async () => {
  // If we already resolved the URL, return it immediately (no ping needed)
  if (resolvedBaseUrl) return resolvedBaseUrl;

  const candidates = getApiBaseUrlCandidates();

  // On web, skip the ping — always use localhost
  if (Platform.OS === 'web') {
    resolvedBaseUrl = candidates[0];
    return resolvedBaseUrl;
  }

  // Try each candidate URL in order, ping each one to see if it responds
  for (const candidate of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const alive = await pingOnce(candidate, HEALTH_TIMEOUT_MS);
    if (alive) {
      resolvedBaseUrl = candidate; // Cache the first working URL
      return resolvedBaseUrl;
    }
  }

  // Nothing answered — return the first candidate as fallback
  // The API interceptor in api.js will handle the resulting network error
  return candidates[0];
};

// =============================================================================
// Image URL Resolution
// Server stores images as relative paths: "/uploads/item-123.jpg"
// These helpers convert them to full URLs for display in React Native <Image>
// =============================================================================

// Returns the server origin (without /api) for building image URLs
export const getImageBaseUrl = () => {
  // Check if developer set a specific image base URL in .env
  const envImageBase = process.env.EXPO_PUBLIC_IMAGE_BASE_URL;
  if (envImageBase && typeof envImageBase === 'string' && envImageBase.trim()) {
    return envImageBase.trim().replace(/\/+$/, ''); // Remove trailing slashes
  }
  // Strip /api from the API base URL to get the server origin
  return getApiBaseUrlSync().replace(/\/api$/i, '');
  // Example: "http://192.168.1.185:5000/api" → "http://192.168.1.185:5000"
};

// Converts a possibly-relative path to an absolute image URL
export const resolveImageUri = (path) => {
  if (!path || typeof path !== 'string') return null;

  // If already an absolute URL (http/https/data/blob), return as-is
  if (/^(https?:|data:|blob:)/i.test(path)) return path;

  const base = getImageBaseUrl();

  // Combine base + path, handling whether path starts with / or not
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  // Example: "http://192.168.1.185:5000" + "/uploads/item-123.jpg"
  //          → "http://192.168.1.185:5000/uploads/item-123.jpg"
};

// =============================================================================
// Lightweight Event Buses
// Dependency-free pub/sub pattern so services can notify React context (AuthContext,
// RootNavigator) without needing Redux, Zustand, or any state library.
// =============================================================================

const createEventBus = () => {
  const listeners = new Set(); // Set avoids duplicate listener registrations

  return {
    // Subscribe: register a callback function to be called when events fire
    // Returns an unsubscribe function (call it in useEffect cleanup)
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener); // Returns cleanup function
    },

    // Emit: notify all registered listeners with a payload object
    emit(payload) {
      listeners.forEach((listener) => {
        try {
          listener(payload);
        } catch (error) {
          // A listener crash must never break the API request pipeline
        }
      });
    },
  };
};

// authEvents.emit({ reason: 'unauthorized' }) → AuthContext listens → clears session → shows Login
export const authEvents = createEventBus();

// connectivityEvents.emit({ reason: 'request-failed' }) → useNetworkStatus → shows offline banner
export const connectivityEvents = createEventBus();
