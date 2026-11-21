// =============================================================================
// REUSE RADAR - AUTHENTICATION & GLOBAL STATE CONTEXT (AuthContext.jsx)
// Purpose: Provides application-wide authentication state (user profile, JWT token,
// unread badges) and session management across the entire React Native component tree.
// Key Mechanisms:
//   1. Persistent session storage via AsyncStorage (@reuseradar_token, @reuseradar_user)
//   2. Automatic session restoration on app boot
//   3. Seamless navigation switching between AuthNavigator and MainNavigator
//   4. Push notification token synchronization with backend
// =============================================================================

import React, { createContext, useState, useEffect, useCallback } from 'react';
import { storage } from '../utils/storage';                  // Helper for persistent device storage (AsyncStorage)
import { authService } from '../services/authService';      // HTTP API calls for login, register, me, updateProfile
import { notificationService } from '../services/notificationService'; // Push notification and unread count service
import { authEvents } from '../services/apiConfig';          // Event bus for 401 unauthorized session expiry

// 1. Create React Context for Auth
export const AuthContext = createContext();

// 2. AuthProvider Component wraps the root of the app
export const AuthProvider = ({ children }) => {
  // Global Authentication State:
  const [user, setUser] = useState(null);                       // Current authenticated user object
  const [token, setToken] = useState(null);                     // JWT access token
  const [isLoading, setIsLoading] = useState(true);             // App-boot splash loading flag
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);  // Unread badge counter for bell icon
  const [sessionMessage, setSessionMessage] = useState('');     // Flash alert when session expires

  // Mechanism A: Push Token Synchronization
  // Registers device with Expo Push server and saves FCM/APNs token in MongoDB User document
  const syncPushToken = async () => {
    try {
      const pushToken = await notificationService.registerForPushNotificationsAsync();
      if (pushToken) {
        await authService.updatePushToken(pushToken);
      }
    } catch (e) {
      console.log('[AuthContext] Push token sync skipped:', e.message);
    }
  };

  // Mechanism B: Token Expiry Listener (HTTP 401 Handler)
  // When an API call returns 401 Unauthorized, automatically clear token and redirect to Login
  useEffect(() => {
    const unsubscribe = authEvents.subscribe(({ message } = {}) => {
      setToken(null);
      setUser(null);
      setUnreadNotifCount(0);
      setSessionMessage(message || 'Your session expired. Please sign in again.');
    });
    return unsubscribe;
  }, []);

  // Mechanism C: Unread Notifications Polling
  // Fetches latest unread notification count for tab bar badge
  const refreshUnreadCount = useCallback(async () => {
    try {
      const res = await notificationService.getUnreadCount();
      if (res && res.success) {
        setUnreadNotifCount(res.unreadCount);
      }
    } catch (e) {
      // Gracefully ignore background error
    }
  }, []);

  // Mechanism D: Live Profile Refresh
  // Re-fetches latest user karma points and stats from backend
  const refreshUser = useCallback(async () => {
    if (!token) return;
    try {
      const res = await authService.getMe();
      if (res && res.success && res.user) {
        setUser(res.user);
        await storage.setUser(res.user);
      }
    } catch (e) {
      console.log('[AuthContext] Error refreshing user profile:', e.message);
    }
  }, [token]);

  // Mechanism E: App Launch Session Restore (Persistent Login)
  // On app cold start, checks AsyncStorage for existing JWT and auto-authenticates user
  useEffect(() => {
    const loadSession = async () => {
      try {
        const storedToken = await storage.getToken();
        const storedUser = await storage.getUser();

        if (storedToken) {
          setToken(storedToken);
          if (storedUser) {
            setUser(storedUser);
          }
          // Fetch fresh user profile and karma stats from server
          try {
            const res = await authService.getMe();
            if (res && res.success && res.user) {
              setUser(res.user);
              await storage.setUser(res.user);
            }
          } catch (e) {
            console.log('[AuthContext] Background refresh skipped');
          }
          // Sync device push token and notifications badge
          syncPushToken();
          refreshUnreadCount();
        }
      } catch (e) {
        console.error('[AuthContext] Session restore error:', e);
      } finally {
        setIsLoading(false); // Dismisses Splash screen and renders App
      }
    };

    loadSession();
  }, [refreshUnreadCount]);

  // Mechanism F: Login Handler
  // Authenticates with backend, persists JWT in AsyncStorage, and updates state
  const login = async (email, password) => {
    const res = await authService.login(email, password);
    if (res && res.success) {
      setToken(res.token);
      setUser(res.user);
      await storage.setToken(res.token);
      await storage.setUser(res.user);

      syncPushToken();
      refreshUnreadCount();
      return res;
    }
    throw new Error(res?.message || 'Login failed');
  };

  // Mechanism G: Registration Handler
  // Creates new campus student account with validation
  const register = async (userData) => {
    const res = await authService.register(userData);
    if (res && res.success) {
      setToken(res.token);
      setUser(res.user);
      await storage.setToken(res.token);
      await storage.setUser(res.user);

      syncPushToken();
      refreshUnreadCount();
      return res;
    }
    throw new Error(res?.message || 'Registration failed');
  };

  const clearSessionMessage = useCallback(() => setSessionMessage(''), []);

  // Mechanism H: Profile Update Handler
  // Updates user name, department, phone, avatar
  const updateProfile = async (profileData) => {
    const res = await authService.updateProfile(profileData);
    if (res && res.success && res.user) {
      setUser(res.user);
      await storage.setUser(res.user);
      return res;
    }
    throw new Error(res?.message || 'Profile update failed');
  };

  // Logout handler
  const logout = async () => {
    try {
      setToken(null);
      setUser(null);
      setUnreadNotifCount(0);
      await storage.clearSession();
    } catch (e) {
      console.error('[AuthContext] Logout error:', e);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!token,
        unreadNotifCount,
        login,
        register,
        logout,
        updateProfile,
        refreshUser,
        refreshUnreadCount,
        sessionMessage,
        clearSessionMessage,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
