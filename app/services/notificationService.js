// =============================================================================
// REUSE RADAR - NOTIFICATION SERVICE (notificationService.js)
// Purpose: Two responsibilities in one file:
//   1. In-App Notifications API — read/mark-read database notifications
//   2. Expo Push Notification Registration — request device permission and get token
// Features:
//   1. getNotifications() — fetch all notifications from MongoDB (displayed in screen)
//   2. markAsRead()/markAllAsRead() — mark notification(s) read (clears badge)
//   3. getUnreadCount() — drives the bell badge number in navigation
//   4. Push notification permission: handles Expo Go gracefully (no crash)
//   5. Android 8+ notification channel setup (required for Android notifications)
//   6. Expo push token registration for Feature 16 (real-time push notifications)
// =============================================================================

// 'api' is our configured Axios instance with JWT auth and retry logic
import api from './api';

// 'expo-constants' gives access to app config, Expo version info, project ID
import Constants from 'expo-constants';

// 'expo-device' tells us if we're on a real physical device (required for push tokens)
import * as Device from 'expo-device';

// 'expo-notifications' handles push notification permissions and token registration
import * as Notifications from 'expo-notifications';

// 'react-native' Platform tells us the OS (iOS vs Android)
import { Platform } from 'react-native';

// Android notification channel ID (required for Android 8+/API 26+)
const CHANNEL_ID = 'default';

// =============================================================================
// Guard: Expo Go Detection
// Expo Go (SDK 53+) ships a stub notification module. Calling the actual
// push-token APIs there can throw a native NullPointerException on Android.
// Every call below is guarded so failures degrade to "no push", never a crash.
// =============================================================================

const isExpoGo = () => {
  try {
    return (
      Constants?.executionEnvironment === 'storeClient' || // Running in Expo Go store client
      Constants?.appOwnership === 'expo'                   // Legacy Expo Go check
    );
  } catch (e) {
    return false; // If Constants is unavailable, assume not Expo Go
  }
};

// =============================================================================
// Helper: Get the EAS project ID for push token registration
// The EAS project ID links this app to its Expo push notification project.
// Required since Expo SDK 48 for getExpoPushTokenAsync().
// =============================================================================

const getProjectId = () => {
  try {
    return (
      Constants?.expoConfig?.extra?.eas?.projectId || // From app.config.js extra.eas.projectId
      Constants?.easConfig?.projectId ||               // From EAS Build config
      null
    );
  } catch (e) {
    return null; // No project ID configured — push tokens will work differently
  }
};

// =============================================================================
// Configure notification display behavior
// Runs once when the module loads.
// setNotificationHandler() tells Expo what to do when a notification arrives
// while the app is in the foreground.
// =============================================================================

try {
  if (typeof Notifications?.setNotificationHandler === 'function') {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,  // Show the notification as an alert banner
        shouldPlaySound: true,  // Play the notification sound
        shouldSetBadge: true,   // Update the app icon badge count
      }),
    });
  }
} catch (e) {
  // Expo Go or simulator may not support this — degrade silently
  console.log('[Push] Notification handler unavailable:', e?.message);
}

// =============================================================================
// Helper: Create Android Notification Channel
// Android 8.0+ (API 26+) REQUIRES a notification channel before displaying
// any notifications. Without this, notifications are silently dropped.
// Returns false if channel creation is not needed or fails.
// =============================================================================

const ensureAndroidChannel = async () => {
  if (Platform.OS !== 'android') return false; // iOS doesn't need channels

  try {
    // Check if the setNotificationChannelAsync function exists
    if (typeof Notifications?.setNotificationChannelAsync !== 'function') return false;

    // AndroidImportance controls notification priority and visibility
    const AndroidImportance = Notifications?.AndroidImportance;
    if (!AndroidImportance) return false;

    // Create the notification channel with our app's branding
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'ReUse Radar',                              // Channel name shown in Android Settings
      importance: AndroidImportance.DEFAULT ?? AndroidImportance.MAX, // Notification priority
      vibrationPattern: [0, 250, 250, 250],             // Vibration pattern in milliseconds
      lightColor: '#059669',                            // LED notification light color (green)
    });
    return true;
  } catch (e) {
    // Expo Go on SDK 53 can throw here — notifications simply stay disabled
    console.log('[Push] Notification channel setup skipped:', e?.message);
    return false;
  }
};

// =============================================================================
// Exported notification service object
// All notification-related operations go through these methods
// =============================================================================

export const notificationService = {
  // ── In-App Notifications API ──────────────────────────────────────────────
  // These call the backend MongoDB notification system (not Expo push)

  // Fetch all notifications for the current user (displayed in NotificationsScreen)
  // Returns: { success: true, notifications: [...] } sorted newest first
  async getNotifications() {
    return await api.get('/notifications');
  },

  // Mark a single notification as read (called when user taps a notification)
  async markAsRead(id) {
    return await api.put(`/notifications/${id}/read`);
  },

  // Mark ALL unread notifications as read (called by "Mark all read" button)
  async markAllAsRead() {
    return await api.put('/notifications/mark-all-read');
  },

  // Get count of unread notifications (drives the bell badge number in navigation)
  async getUnreadCount() {
    return await api.get('/notifications/unread-count');
  },

  // Delete a specific notification (swipe-to-delete in NotificationsScreen)
  async deleteNotification(id) {
    return await api.delete(`/notifications/${id}`);
  },

  // ── Permission Helpers ────────────────────────────────────────────────────
  // Used by ProfileScreen to show notification permission status

  // Returns: 'granted' | 'denied' | 'undetermined' | 'unavailable'
  // 'unavailable' = simulator or Expo Go where push isn't supported
  async getPermissionStatus() {
    try {
      if (!Device?.isDevice) return 'unavailable';        // Must be a real device
      if (typeof Notifications?.getPermissionsAsync !== 'function') return 'unavailable';
      const { status } = await Notifications.getPermissionsAsync();
      return status || 'undetermined';
    } catch (e) {
      return 'unavailable';
    }
  },

  // Explicitly request notification permission from the user
  // Shows the iOS/Android permission dialog
  // Returns: 'granted' | 'denied' | 'undetermined' | 'unavailable'
  async requestPermission() {
    try {
      await ensureAndroidChannel(); // Create Android channel before requesting permission
      if (!Device?.isDevice) return 'unavailable';        // Can't request on simulator
      if (isExpoGo()) return 'unavailable';               // Push not available in Expo Go
      if (typeof Notifications?.requestPermissionsAsync !== 'function') return 'unavailable';
      const { status } = await Notifications.requestPermissionsAsync();
      return status || 'undetermined';
    } catch (e) {
      console.log('[Push] Permission request skipped:', e?.message);
      return 'unavailable';
    }
  },

  // ── Expo Push Token Registration (Feature 16) ─────────────────────────────
  // Called by AuthContext after login to register this device for push notifications.
  // Returns the Expo push token string, or null if unavailable.
  // The token is then saved to the backend via PUT /api/auth/push-token

  async registerForPushNotificationsAsync() {
    let token = null;

    try {
      // Create Android notification channel first (required for Android 8+)
      await ensureAndroidChannel();

      // Push tokens only work on real physical devices
      if (!Device?.isDevice) {
        console.log('[Push] Must use physical device for Push Notifications');
        return null;
      }

      // Expo Go doesn't support remote push tokens (removed in SDK 50+)
      if (isExpoGo()) {
        console.log('[Push] Expo Go detected — push tokens need a development build');
        return null;
      }

      if (typeof Notifications?.getPermissionsAsync !== 'function') return null;

      // Check existing permission status
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      // If permission not yet granted, ask the user
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      // User denied — can't register for push
      if (finalStatus !== 'granted') {
        console.log('[Push] Permission denied');
        return null;
      }

      if (typeof Notifications?.getExpoPushTokenAsync !== 'function') return null;

      // Get the Expo push token (requires project ID from EAS config)
      const projectId = getProjectId();
      const pushTokenData = projectId
        ? await Notifications.getExpoPushTokenAsync({ projectId }) // With project ID (production)
        : await Notifications.getExpoPushTokenAsync();              // Without (development)

      // Extract the token string from the response object
      token = pushTokenData?.data || null;
      if (token) console.log('[Push] Token registered');
    } catch (e) {
      // This is expected in development with Expo Go — not an error
      console.log('[Push] Token fetch skipped (OK in dev):', e?.message);
    }

    return token; // Returns "ExponentPushToken[xxxxxx]" or null
  },
};

// Default export for modules that prefer: import notificationService from './notificationService'
export default notificationService;
