// =============================================================================
// REUSE RADAR - NOTIFICATIONS SCREEN (NotificationsScreen.jsx)
// Purpose: Displays in-app user notifications for item requests, acceptances, and messages.
// Features:
// 1. Fetches real-time notification list via notificationService.
// 2. Mark single notification or all notifications as read.
// 3. Dynamic navigation: Tapping a notification navigates directly to the related Item or Request.
// 4. Device push notification permission banner with direct request action.
// =============================================================================

import React, { useState, useEffect, useContext, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';

// AuthContext provides current session token and global unread counter refresh method
import { AuthContext } from '../context/AuthContext';
// Notification service to interact with backend notification API endpoints
import { notificationService } from '../services/notificationService';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { COLORS } from '../utils/constants';

const NotificationsScreen = ({ navigation }) => {
  // Mechanism 1: AuthContext token and unread badge refresh function
  const { refreshUnreadCount, token } = useContext(AuthContext);

  // Screen states
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState('undetermined');
  const [requestingPermission, setRequestingPermission] = useState(false);

  // Mechanism 2: Fetch user notifications from backend
  const fetchNotifications = useCallback(async () => {
    // Avoid API requests if user session token is absent
    if (!token) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const res = await notificationService.getNotifications();
      if (res && res.success) {
        setNotifications(res.notifications || []);
        // Synchronize tab bar unread counter badge
        refreshUnreadCount();
      }
    } catch (err) {
      console.log('[Notifications] Error fetching:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshUnreadCount, token]);

  // Initial load and permission check on mount
  useEffect(() => {
    fetchNotifications();
    notificationService.getPermissionStatus().then(setPermissionStatus).catch(() => {});
  }, [fetchNotifications]);

  // Mechanism 3: Request Push Notification Permissions
  const handleEnableNotifications = async () => {
    setRequestingPermission(true);
    try {
      const status = await notificationService.requestPermission();
      setPermissionStatus(status);
      if (status === 'granted') {
        Alert.alert('Notifications Enabled 🔔', 'You will now receive pickup, request and message alerts.');
      } else if (status === 'denied') {
        Alert.alert(
          'Notifications Blocked',
          'Enable notifications for ReUse Radar in your device settings to receive pickup alerts.'
        );
      } else {
        Alert.alert(
          'Push Needs a Dev Build',
          'Remote notifications are unavailable in Expo Go. Use a development build on a physical device to enable push alerts.'
        );
      }
    } finally {
      setRequestingPermission(false);
    }
  };

  // Mechanism 4: Pull-to-refresh handler
  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  // Mechanism 5: Mark all notifications as read
  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllAsRead();
      // Optimistically update all state items to isRead: true
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      refreshUnreadCount();
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  };

  // Mechanism 6: Tap on notification item
  // Marks clicked notification as read and navigates to the associated screen
  const handleNotificationPress = async (notif) => {
    if (!notif.isRead) {
      try {
        await notificationService.markAsRead(notif._id);
        // Mark as read in local state
        setNotifications((prev) =>
          prev.map((n) => (n._id === notif._id ? { ...n, isRead: true } : n))
        );
        refreshUnreadCount();
      } catch (e) {
        // Silently continue navigation even if markAsRead fails
      }
    }

    // Contextual deep-linking based on notification payload
    if (notif.relatedItem) {
      navigation.navigate('ItemDetails', {
        itemId: notif.relatedItem._id || notif.relatedItem,
      });
    } else if (notif.relatedRequest) {
      navigation.navigate('MyItems', { initialTab: 'received' });
    }
  };

  // Helper function returning visual emoji icon based on notification type
  const getNotificationIcon = (type) => {
    switch (type) {
      case 'new_request':
        return '🎁';
      case 'request_accepted':
        return '🎉';
      case 'request_rejected':
        return '⚠️';
      case 'request_completed':
        return '⭐';
      case 'new_message':
        return '💬';
      default:
        return '🔔';
    }
  };

  // Render individual notification card in FlatList
  const renderNotificationCard = ({ item }) => {
    return (
      <TouchableOpacity
        style={[styles.card, !item.isRead && styles.unreadCard]}
        onPress={() => handleNotificationPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.iconCircle}>
          <Text style={styles.iconText}>{getNotificationIcon(item.type)}</Text>
        </View>

        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, !item.isRead && styles.unreadTitle]}>{item.title}</Text>
            {!item.isRead ? <View style={styles.unreadDot} /> : null}
          </View>
          <Text style={styles.messageText}>{item.message}</Text>
          <Text style={styles.timeText}>
            {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'Just now'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Top Header Bar */}
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>Notifications</Text>
        {notifications.some((n) => !n.isRead) ? (
          <TouchableOpacity onPress={handleMarkAllRead} style={styles.markAllBtn}>
            <Text style={styles.markAllText}>Mark all as read</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Push Notification Permission Warning Banner */}
      {permissionStatus !== 'granted' ? (
        <View style={styles.permissionBanner}>
          <Text style={styles.permissionText}>
            {permissionStatus === 'unavailable'
              ? '🔕 Push alerts need a development build on a physical device.'
              : '🔔 Enable notifications to get pickup and request alerts.'}
          </Text>
          {permissionStatus !== 'unavailable' ? (
            <TouchableOpacity
              style={styles.permissionBtn}
              onPress={handleEnableNotifications}
              disabled={requestingPermission}
              activeOpacity={0.85}
            >
              {requestingPermission ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.permissionBtnText}>Enable</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {/* Conditional rendering for Loading / Empty / List state */}
      {loading && !refreshing ? (
        <LoadingSpinner message="Checking notifications..." />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item._id}
          renderItem={renderNotificationCard}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <EmptyState
              icon="🔔"
              title="No notifications yet"
              description="You will be notified here whenever someone requests or updates an exchange!"
            />
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[COLORS.primary]}
              tintColor={COLORS.primary}
            />
          }
        />
      )}
    </View>
  );
};

// UI Stylesheet definitions
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  markAllBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  markAllText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  permissionText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
    lineHeight: 15,
  },
  permissionBtn: {
    backgroundColor: '#D97706',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
    minWidth: 62,
    alignItems: 'center',
  },
  permissionBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 8,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'flex-start',
  },
  unreadCard: {
    backgroundColor: '#F0FDF4', // Light mint green indicating unread
    borderColor: COLORS.primary,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconText: {
    fontSize: 20,
  },
  content: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    flex: 1,
  },
  unreadTitle: {
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginLeft: 6,
  },
  messageText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: 6,
  },
  timeText: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
});

export default NotificationsScreen;
