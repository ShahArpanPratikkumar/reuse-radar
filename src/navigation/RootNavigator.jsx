// =============================================================================
// REUSE RADAR - ROOT NAVIGATOR (RootNavigator.jsx)
// Purpose: Top-level navigation controller. Decides which navigator to show
//          based on authentication state and handles the offline network banner.
// Architecture (context-driven routing):
//   isLoading=true      → SplashScreen (animated logo while session is restored)
//   isAuthenticated=true → MainNavigator (5-tab app with all feature screens)
//   else                → AuthNavigator (Welcome, Login, Register)
// Features:
//   1. Auth-state-driven routing: no manual navigate() calls needed
//   2. Offline alert banner: persistent red banner when backend is unreachable
//   3. Retry button in banner to manually trigger a reconnection check
//   4. Expo SplashScreen: hides the native splash once the component mounts
//   5. NetworkStatus polling: 25s online / exponential-backoff offline
// =============================================================================

// React core and hooks
import React, { useContext, useEffect } from 'react';

// React Native UI components
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';

// NavigationContainer is the root wrapper for ALL React Navigation navigators
// It provides the navigation context to all child navigators and screens
import { NavigationContainer } from '@react-navigation/native';

// expo-splash-screen: controls when the native OS loading screen is hidden
import * as SplashScreen from 'expo-splash-screen';

// Custom hook that monitors backend reachability with health pings
import { useNetworkStatus } from '../hooks/useNetworkStatus';

// AuthContext provides isLoading and isAuthenticated state
import { AuthContext } from '../context/AuthContext';

// The animated splash screen (shown while session is being restored from AsyncStorage)
import SplashScreenComponent from '../screens/SplashScreen';

// Navigator for unauthenticated users (Welcome → Login / Register)
import AuthNavigator from './AuthNavigator';

// Navigator for authenticated users (5-tab bottom nav + detail screens)
import MainNavigator from './MainNavigator';

// =============================================================================
// RootNavigator Component
// =============================================================================

const RootNavigator = () => {
  // isLoading: true while checking AsyncStorage for saved JWT token on app boot
  // isAuthenticated: true when a valid JWT + user data is found in AsyncStorage
  const { isLoading, isAuthenticated } = useContext(AuthContext);

  // useNetworkStatus runs a health ping every 25s (online) or with exponential backoff (offline)
  // isConnected: false when the backend is unreachable
  // isReconnecting: true while a retry ping is in progress
  // offlineMessage: human-readable status text for the banner
  // checkConnection: manual trigger to immediately retry the health check
  const { isConnected, isReconnecting, offlineMessage, checkConnection } = useNetworkStatus();

  // Hide the native OS splash screen as soon as this component mounts
  // The OS splash screen is shown while JS bundle loads; we replace it with our
  // custom animated SplashScreenComponent once the app is ready
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {}); // .catch() prevents errors if already hidden
  }, []);

  // If still loading session from storage, display the animated branded splash screen directly
  if (isLoading) {
    return <SplashScreenComponent />;
  }

  return (
    <View style={styles.container}>
      {/* ── Offline Alert Banner ─────────────────────────────────────────────
          Shown as a persistent red bar at the top when the backend is unreachable.
          The user can tap "Retry" to manually trigger a health check.
      */}
      {!isConnected ? (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            ⚠️ {offlineMessage || 'No internet connection. Some features may be unavailable.'}
          </Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={checkConnection}        // Triggers immediate health ping
            disabled={isReconnecting}        // Prevent multiple simultaneous pings
          >
            {isReconnecting ? (
              // Show loading spinner while retry is in progress
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.retryText}>Retry</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      {/* NavigationContainer is the REQUIRED wrapper for all React Navigation navigators.
          It manages the navigation state and deep linking.
          Only valid Navigators (MainNavigator or AuthNavigator) are rendered inside. */}
      <NavigationContainer>
        {isAuthenticated ? <MainNavigator /> : <AuthNavigator />}
      </NavigationContainer>
    </View>
  );
};

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,                    // Takes up the full screen
    backgroundColor: '#F9FAFB', // Light gray fallback background
  },
  offlineBanner: {
    backgroundColor: '#DC2626', // Red-600 — warning color for offline state
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',       // Banner text on left, Retry button on right
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 999,                // Ensure banner appears above all other UI
  },
  offlineText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,         // Takes remaining space (pushes retry button to the right)
    marginRight: 8,
  },
  retryBtn: {
    backgroundColor: 'rgba(255,255,255,0.25)', // Semi-transparent white button
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});

// RootNavigator is the top-level component rendered by App.js
export default RootNavigator;
