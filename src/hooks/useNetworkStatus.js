// =============================================================================
// REUSE RADAR - NETWORK STATUS HOOK (useNetworkStatus.js)
// Purpose: Monitors backend reachability with health pings and exponential backoff.
//          Used by RootNavigator to show/hide the offline alert banner.
//          Used by all screens to conditionally skip API calls when offline.
// Architecture:
//   - Online mode:  Ping /api/health every 25 seconds (lightweight heartbeat)
//   - Offline mode: Retry with exponential backoff (3s → 6s → 12s → 24s → 30s max)
//   - Re-discovers: Clears cached backend URL when offline (recovers from IP changes)
//   - Event-driven: connectivityEvents bus triggers immediate re-check on API failure
//   - App lifecycle: Re-checks when app comes back to foreground (from background)
// Returns:
//   isConnected    — boolean: is the backend currently reachable?
//   isReconnecting — boolean: is a retry ping currently in flight?
//   offlineMessage — string: human-readable status message for the banner
//   failureCount   — number: how many consecutive failures (for progressive messages)
//   checkConnection — function: manually trigger an immediate health check
//   reportOffline   — function: external components can mark as offline
//   reportOnline    — function: external components can mark as online
// =============================================================================

// React hooks
import { useState, useEffect, useCallback, useRef } from 'react';

// AppState lets us know when the app goes to background or returns to foreground
import { AppState } from 'react-native';

// API config helpers for health checking and URL management
import {
  checkServerHealth,     // Pings /api/health on the backend
  invalidateApiBaseUrl,  // Clears cached URL so next check re-discovers the backend
  getApiBaseUrlSync,     // Gets current URL for displaying in offline message
  connectivityEvents,    // Event bus: api.js fires this when any request fails
} from '../services/apiConfig';

// =============================================================================
// Timing Constants
// =============================================================================

const ONLINE_POLL_MS = 25000;        // Poll every 25 seconds when connected
const OFFLINE_BASE_DELAY_MS = 3000;  // First retry after 3 seconds
const OFFLINE_MAX_DELAY_MS = 30000;  // Cap retry delay at 30 seconds (don't hammer server)

// =============================================================================
// useNetworkStatus Hook
// =============================================================================

export const useNetworkStatus = () => {
  // ── State ─────────────────────────────────────────────────────────────────

  const [isConnected, setIsConnected] = useState(true);        // Optimistic default: assume connected
  const [isReconnecting, setIsReconnecting] = useState(false); // True while ping is in-flight
  const [offlineMessage, setOfflineMessage] = useState('');    // Status text for the banner
  const [failureCount, setFailureCount] = useState(0);         // Consecutive ping failures

  // ── Refs (mutable values that don't trigger re-render) ───────────────────

  // timerRef: holds the setTimeout ID for the next scheduled ping
  // Using ref instead of state prevents the timer from triggering re-renders
  const timerRef = useRef(null);

  // failuresRef: mirrors failureCount state but accessible in async callbacks
  // State updates are async (batched), but ref updates are synchronous
  const failuresRef = useRef(0);

  // mountedRef: prevents setState calls after component unmounts (memory leak prevention)
  const mountedRef = useRef(true);

  // checkRef: holds the latest checkConnection function for access in closures
  // This solves the stale closure problem where event listeners capture an old function
  const checkRef = useRef(null);

  // ==========================================================================
  // schedule() — Schedules the next health ping based on current status
  // Online:  schedule after ONLINE_POLL_MS (25 seconds)
  // Offline: exponential backoff = OFFLINE_BASE_DELAY_MS * 2^(failures-1)
  //          3s → 6s → 12s → 24s → 30s (max)
  // ==========================================================================

  const schedule = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current); // Cancel any existing timer

    const failures = failuresRef.current; // Current consecutive failure count

    // Calculate the next ping delay based on failure count
    const nextDelay =
      failures === 0
        ? ONLINE_POLL_MS // Connected: poll every 25 seconds
        : Math.min(
            OFFLINE_BASE_DELAY_MS * 2 ** (failures - 1), // Exponential: 3s, 6s, 12s, 24s...
            OFFLINE_MAX_DELAY_MS                           // Cap at 30 seconds
          );

    // Schedule the next ping after the calculated delay
    timerRef.current = setTimeout(() => {
      checkRef.current?.(); // Call the latest checkConnection function via ref
    }, nextDelay);
  }, []); // No dependencies — schedule() never changes

  // ==========================================================================
  // checkConnection() — The main health check function
  // Pings /api/health, updates state, then schedules the next check.
  // Can be called manually (Retry button) or automatically (via schedule/events).
  // ==========================================================================

  const checkConnection = useCallback(async () => {
    // Clear any scheduled ping (we're checking right now)
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    setIsReconnecting(true); // Show spinner on Retry button

    let healthy = false;
    try {
      // checkServerHealth() pings GET /api/health with a 5-second timeout
      // Returns true if response is 200 OK, false otherwise
      healthy = await checkServerHealth(5000);
    } catch (e) {
      healthy = false; // Any exception = treat as unhealthy
    }

    // Don't update state if component unmounted while we were waiting
    if (!mountedRef.current) return;

    if (healthy) {
      // ── Backend is reachable ─────────────────────────────────────────────
      failuresRef.current = 0;    // Reset failure counter
      setFailureCount(0);
      setIsConnected(true);       // Hide the offline banner
      setOfflineMessage('');      // Clear the status message
    } else {
      // ── Backend is unreachable ───────────────────────────────────────────
      failuresRef.current += 1;   // Increment failure counter (drives backoff)
      setFailureCount(failuresRef.current);

      // Clear the cached backend URL — the IP may have changed (new WiFi network)
      // Next checkConnection will re-discover and test all candidates
      invalidateApiBaseUrl();

      setIsConnected(false); // Show the offline banner

      // Show a progressively more informative message
      setOfflineMessage(
        failuresRef.current <= 1
          ? 'Cannot reach the server. Retrying automatically…'
          : `Still offline — retrying automatically (${getApiBaseUrlSync()}).`
          // Shows the current candidate URL being tried (useful for debugging)
      );
    }

    setIsReconnecting(false); // Hide the spinner

    // Schedule the next automatic ping
    schedule();
  }, [schedule]);

  // Keep checkRef always pointing to the latest checkConnection function
  // This prevents stale closure issues in setTimeout and event listeners
  checkRef.current = checkConnection;

  // ==========================================================================
  // useEffect — Set up the heartbeat, event listeners, and app state monitoring
  // Runs once on mount, cleans up on unmount.
  // ==========================================================================

  useEffect(() => {
    mountedRef.current = true; // Mark component as mounted

    // Run an immediate check on mount (don't wait 25 seconds for first status)
    checkConnection();

    // Subscribe to the connectivityEvents bus
    // When any API request fails, api.js fires this event to trigger an immediate re-check
    // This means: if a user action fails, the offline banner appears almost instantly
    const unsubscribe = connectivityEvents.subscribe(() => {
      if (!mountedRef.current) return;
      checkRef.current?.(); // Trigger immediate health check
    });

    // AppState listener: re-check when user switches back to the app from background
    // 'active' state means app came from background/inactive → user is using it again
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkRef.current?.(); // Check health when app becomes active
    });

    // Cleanup function: runs when component unmounts (navigation away, etc.)
    return () => {
      mountedRef.current = false;                  // Prevent setState on unmounted component
      if (timerRef.current) clearTimeout(timerRef.current); // Cancel pending ping
      unsubscribe();                               // Remove connectivityEvents listener
      appStateSub?.remove?.();                     // Remove AppState listener
    };
  }, [checkConnection]); // checkConnection is stable (memoized with useCallback)

  // ==========================================================================
  // Helper methods for external components
  // ==========================================================================

  // reportOffline() — External component can manually flag as offline
  const reportOffline = useCallback((msg = 'No internet connection. Some features may be unavailable.') => {
    setIsConnected(false);
    setOfflineMessage(msg);
  }, []);

  // reportOnline() — External component can manually clear offline state
  const reportOnline = useCallback(() => {
    setIsConnected(true);
    setOfflineMessage('');
  }, []);

  // ── Return the hook's public API ─────────────────────────────────────────
  return {
    isConnected,      // boolean: false when backend unreachable (shows offline banner)
    isReconnecting,   // boolean: true during active ping (shows spinner on Retry button)
    offlineMessage,   // string: descriptive status message for the banner text
    failureCount,     // number: how many consecutive failures (progressive messaging)
    checkConnection,  // function: call to trigger an immediate manual health check
    reportOffline,    // function: external force-offline (rarely needed)
    reportOnline,     // function: external force-online (rarely needed)
  };
};
