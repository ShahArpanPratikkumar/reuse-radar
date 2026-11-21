// =============================================================================
// REUSE RADAR - API INSTANCE (api.js)
// Purpose: Central Axios instance used by ALL service files to make HTTP requests.
//          Automatically attaches JWT tokens to every request.
//          Automatically retries failed requests with exponential backoff.
//          Handles 401 session expiry by clearing local storage and signaling logout.
// Features:
//   1. Auto-resolves backend URL before every request (no hardcoded IPs)
//   2. Attaches JWT Bearer token from AsyncStorage to all requests
//   3. Retries failed requests up to 3 times with exponential backoff + jitter
//   4. Handles 401 Unauthorized by firing authEvents (triggers app logout)
//   5. Uniform error format: every rejection has .message, .status, .isNetworkError
// =============================================================================

// 'axios' is the HTTP client library for making API requests
import axios from 'axios';

// 'storage' provides read/write access to AsyncStorage (JWT token, user data)
import { storage } from '../utils/storage';

// API config helpers for URL resolution and event buses
import {
  resolveApiBaseUrl,      // Async: finds and caches the working backend URL
  getApiBaseUrlSync,      // Sync: returns cached URL or first candidate
  invalidateApiBaseUrl,   // Clears cached URL (triggered when network drops)
  authEvents,             // Event bus: fires when JWT is invalid/expired → triggers logout
  connectivityEvents,     // Event bus: fires when network request fails → updates banner
} from './apiConfig';

// =============================================================================
// Retry Configuration
// Transient failures (Wi-Fi blip, server restart, app backgrounded) are retried
// automatically instead of showing an error to the user.
// =============================================================================

const MAX_RETRIES = 3;        // Maximum number of retry attempts per request
const BASE_DELAY_MS = 350;    // Starting delay for exponential backoff (350ms, 700ms, 1400ms)

// HTTP status codes that are worth retrying (server-side errors + timeouts)
// 408=Request Timeout, 425=Too Early, 429=Rate Limited, 500=Server Error,
// 502=Bad Gateway, 503=Service Unavailable, 504=Gateway Timeout
const RETRYABLE_STATUSES = [408, 425, 429, 500, 502, 503, 504];

// =============================================================================
// Create Axios Instance
// All API calls go through this single instance, ensuring consistent configuration.
// =============================================================================

const api = axios.create({
  timeout: 20000, // 20 second timeout — enough for slow connections + image uploads
  headers: {
    'Content-Type': 'application/json', // Default content type (overridden for FormData)
    Accept: 'application/json',         // We always expect JSON responses from the backend
  },
});

// Utility: promise-based sleep function (waits for 'ms' milliseconds)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Check if request body is a FormData object (multipart file upload)
// FormData uploads cannot be retried because the stream may already be consumed
const isFormDataPayload = (data) =>
  typeof FormData !== 'undefined' && data instanceof FormData;

// =============================================================================
// Request Interceptor
// Runs BEFORE every HTTP request is sent.
// Two jobs: (1) set the backend URL, (2) attach JWT token
// =============================================================================

api.interceptors.request.use(
  async (config) => {
    // Job 1: Resolve the live backend URL
    // This pings candidates and returns the working URL (cached after first ping)
    try {
      config.baseURL = await resolveApiBaseUrl();
      // Example: config.baseURL = "http://192.168.1.185:5000/api"
    } catch (e) {
      // If resolution fails, use the sync fallback (best guess without ping)
      config.baseURL = getApiBaseUrlSync();
    }

    // Job 2: Attach JWT Bearer token to Authorization header
    try {
      const token = await storage.getToken(); // Read from AsyncStorage
      if (token) {
        // The backend's protect() middleware reads this header to verify identity
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (e) {
      console.error('[API Interceptor] Token attach failed', e);
    }

    return config; // Return the modified config — Axios uses it to send the request
  },
  (error) => Promise.reject(error) // If interceptor itself errors, propagate it
);

// =============================================================================
// shouldRetry() — Decides if a failed request is worth retrying
// Rules:
//   - FormData (file upload) requests: never retry (stream consumed)
//   - Network errors (no response): always retry (transient connection issue)
//   - POST/PATCH with server errors: only retry on 503/504 (idempotency concern)
//   - GET/DELETE: retry on any RETRYABLE_STATUS
// =============================================================================

const shouldRetry = (error) => {
  const config = error?.config;
  if (!config) return false; // No config — can't retry

  // Stop retrying after MAX_RETRIES attempts
  if ((config.__retryCount || 0) >= MAX_RETRIES) return false;

  // Don't retry multipart uploads — the body stream may be consumed
  if (isFormDataPayload(config.data)) return false;

  const status = error?.response?.status;
  const method = String(config.method || 'get').toLowerCase();

  // Network error / timeout: no response received — always retry (connection was dropped)
  if (!status) return true;

  // POST/PATCH requests: only retry on specific server unavailability codes
  // (don't re-POST if the server DID receive the request and returned 500)
  if (['post', 'patch'].includes(method)) return status === 503 || status === 504;

  // GET/DELETE: retry on any retryable status code
  return RETRYABLE_STATUSES.includes(status);
};

// =============================================================================
// Response Interceptor
// Runs AFTER every HTTP response arrives (or when request fails).
// Success path: unwraps response.data (so callers get data directly, not {data: ...})
// Error path: handles retries, 401 session expiry, and uniform error formatting
// =============================================================================

api.interceptors.response.use(
  // SUCCESS: return response.data directly (removes the axios wrapper layer)
  // So callers get: { success: true, items: [...] } instead of { data: { success: true, ... } }
  (response) => response.data,

  // ERROR: handle retries, session expiry, and error normalization
  async (error) => {
    // ── Retry Logic ─────────────────────────────────────────────────────────
    if (shouldRetry(error)) {
      const config = error.config;

      // Track how many times we've retried this specific request
      const attempt = (config.__retryCount || 0) + 1;
      config.__retryCount = attempt;

      // If the backend sent no response, its IP may have changed (new WiFi)
      // Invalidate the cached URL so the next attempt re-discovers the backend
      if (!error.response) {
        invalidateApiBaseUrl(); // Forces re-ping on next resolveApiBaseUrl()
        connectivityEvents.emit({ reason: 'request-failed' }); // Update offline banner
      }

      // Exponential backoff with jitter:
      // Attempt 1: 350 * 2^0 + random(120) ≈ 350-470ms
      // Attempt 2: 350 * 2^1 + random(120) ≈ 700-820ms
      // Attempt 3: 350 * 2^2 + random(120) ≈ 1400-1520ms
      const backoff = BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * 120;
      await delay(backoff); // Wait before retrying

      try {
        return await api(config); // Retry the same request with the same config
      } catch (retryError) {
        return Promise.reject(retryError); // If retry also fails, propagate the error
      }
    }

    // ── Error Normalization ──────────────────────────────────────────────────
    // Create a uniform error object with consistent properties for all callers
    let errorMessage = 'Network error. Please check your connection.';
    const friendly = new Error(errorMessage); // Create a new Error object

    if (error.response) {
      // Server responded with an error status (4xx or 5xx)
      errorMessage =
        error.response.data?.message || `Request failed (${error.response.status})`;
      friendly.message = errorMessage;
      friendly.status = error.response.status; // HTTP status code (401, 403, 404, 500...)
      friendly.data = error.response.data;     // Full response body for debugging

      // ── 401 Unauthorized: Session Expired ───────────────────────────────────
      // The JWT token is missing, invalid, or expired.
      // Action: Clear saved token + user data, signal AuthContext to show login screen.
      if (error.response.status === 401) {
        // Remove stored credentials from AsyncStorage
        await storage.clearSession();

        // Fire the authEvents bus — AuthContext subscribes to this and sets isAuthenticated=false
        // This triggers React Navigation to automatically show AuthNavigator (login screen)
        authEvents.emit({
          reason: 'unauthorized',
          message: 'Your session expired. Please sign in again.',
        });
        friendly.message =
          error.response.data?.message || 'Your session expired. Please sign in again.';
      }
    } else if (error.code === 'ECONNABORTED') {
      // Request timed out (exceeded the 20 second limit set in axios.create)
      errorMessage = 'Request timed out. Please try again.';
      friendly.message = errorMessage;
      connectivityEvents.emit({ reason: 'timeout' }); // Notify offline banner
    } else if (error.message) {
      // Generic error (network unreachable, DNS failure, etc.)
      errorMessage = error.message;
      friendly.message = errorMessage;
      if (error.message === 'Network Error') {
        // Axios throws 'Network Error' string when there's no internet connection
        connectivityEvents.emit({ reason: 'network-error' });
      }
    }

    // isNetworkError=true means the server never responded (useful for UI decisions)
    friendly.isNetworkError = !error.response;

    return Promise.reject(friendly); // All errors become uniform Error objects
  }
);

// Export the configured Axios instance — all service files import this
export default api;
