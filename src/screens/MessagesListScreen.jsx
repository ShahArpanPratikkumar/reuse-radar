// =============================================================================
// REUSE RADAR - MESSAGES LIST SCREEN (MessagesListScreen.jsx)
// Purpose: Displays all active 1-on-1 item chat conversations for the logged-in student.
// Features:
// 1. Fetches aggregated chat threads via messageService.getConversations().
// 2. Real-time search filter across peer names and item listing titles.
// 3. Displays unread message badges, relative timestamps, and item thumbnails.
// 4. Focus effect auto-refreshes the inbox when navigating back to the screen.
// =============================================================================

import React, { useState, useCallback, useContext } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  StatusBar,
  RefreshControl,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

// AuthContext provides user identity to distinguish sent vs received messages
import { AuthContext } from '../context/AuthContext';
// MessageService provides API communication with /api/messages
import { messageService } from '../services/messageService';
import EmptyState from '../components/EmptyState';
import { getImageBaseUrl } from '../services/apiConfig';

const IMAGE_BASE_URL = getImageBaseUrl();

// Helper 1: Resolves backend relative image paths to full HTTP URLs
const resolveImageUri = (raw) => {
  if (!raw || typeof raw !== 'string') return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return `${IMAGE_BASE_URL}${raw.startsWith('/') ? '' : '/'}${raw}`;
};

// Helper 2: Converts timestamps to human-readable relative time (e.g. "5m ago", "2h ago")
const relativeTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
};

const MessagesListScreen = ({ navigation }) => {
  const { user, token } = useContext(AuthContext);

  // Component state definitions
  const [conversations, setConversations] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Mechanism 1: Fetch list of active conversations
  const fetchConversations = useCallback(async ({ silent = false } = {}) => {
    if (!token) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const res = await messageService.getConversations();
      if (res && res.success) {
        setConversations(res.conversations || []);
      } else {
        setConversations([]);
      }
    } catch (err) {
      console.log('[MessagesList] fetch error:', err.message);
      setConversations([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  // Mechanism 2: useFocusEffect refreshes inbox silently whenever user navigates back to this tab
  useFocusEffect(
    useCallback(() => {
      fetchConversations({ silent: true });
    }, [fetchConversations])
  );

  // Mechanism 3: Pull to refresh
  const onRefresh = () => {
    setRefreshing(true);
    fetchConversations({ silent: true });
  };

  // Mechanism 4: Real-time client-side search query filtering
  const filteredConversations = conversations.filter((conversation) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    const name = (conversation.otherUser?.name || '').toLowerCase();
    const title = (conversation.item?.title || '').toLowerCase();
    return name.includes(query) || title.includes(query);
  });

  // Mechanism 5: Open 1-on-1 Chat screen with conversation parameters
  const openChat = (conversation) => {
    navigation.navigate('Chat', {
      itemId: conversation.itemId,
      recipientId: conversation.otherUserId,
      recipientName: conversation.otherUser?.name || 'ReUse Radar Member',
      recipientVerified: Boolean(conversation.otherUser?.isVerified),
      itemTitle: conversation.item?.title || '',
      itemImage: conversation.item?.images?.[0],
    });
  };

  // Mechanism 6: Render single conversation item row
  const renderConversation = ({ item: conversation }) => {
    const otherUser = conversation.otherUser || {};
    const item = conversation.item || {};
    const lastMessage = conversation.lastMessage || {};
    const initial = (otherUser.name || 'R').charAt(0).toUpperCase();

    // Determine if the last message was sent by current user
    const senderId = lastMessage.sender?._id || lastMessage.sender;
    const isMine = String(senderId) === String(user?._id);
    const preview = lastMessage.text
      ? `${isMine ? 'You: ' : ''}${lastMessage.text}`
      : 'Tap to continue the conversation';

    const avatarUri = resolveImageUri(otherUser.avatar);
    const itemImageUri = resolveImageUri(item.images?.[0]);
    const unread = conversation.unreadCount || 0;

    return (
      <TouchableOpacity
        style={[styles.row, unread > 0 && styles.rowUnread]}
        onPress={() => openChat(conversation)}
        activeOpacity={0.8}
      >
        {/* User avatar image or initial circle fallback */}
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatarImage} resizeMode="cover" />
        ) : (
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
        )}

        {/* Conversation details body */}
        <View style={styles.rowBody}>
          <View style={styles.rowTopLine}>
            <Text style={styles.name} numberOfLines={1}>
              {otherUser.name || 'ReUse Radar Member'}
            </Text>
            <Text style={styles.time}>{relativeTime(conversation.lastMessageAt)}</Text>
          </View>

          {/* Associated item title */}
          <Text style={styles.itemTitle} numberOfLines={1}>
            📦 {item.title || 'Item unavailable'}
          </Text>

          {/* Last message preview and unread count badge */}
          <View style={styles.rowBottomLine}>
            <Text
              style={[styles.preview, unread > 0 && styles.previewUnread]}
              numberOfLines={1}
            >
              {preview}
            </Text>
            {unread > 0 ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unread > 99 ? '99+' : unread}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Item thumbnail */}
        {itemImageUri ? (
          <Image source={{ uri: itemImageUri }} style={styles.itemThumb} resizeMode="cover" />
        ) : (
          <View style={styles.itemThumbPlaceholder}>
            <Text style={styles.itemThumbPlaceholderText}>📦</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F0FDF4" />

      {/* Screen Header Bar */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerTextBlock}>
          <Text style={styles.headerTitle}>Messages</Text>
          <Text style={styles.headerSubtitle}>
            {conversations.length} active {conversations.length === 1 ? 'conversation' : 'conversations'}
          </Text>
        </View>
      </View>

      {/* Search Input Box */}
      <View style={styles.searchWrapper}>
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={18} color="#64748B" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or item..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.7}>
              <Text style={styles.clearText}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Conversation FlatList or Empty / Loading State */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#059669" />
          <Text style={styles.loadingText}>Loading conversations...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredConversations}
          keyExtractor={(conversation) =>
            conversation.id || `${conversation.itemId}:${conversation.otherUserId}`
          }
          renderItem={renderConversation}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#064E3B']} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="💬"
              title={searchQuery ? 'No Matches' : 'No conversations yet'}
              description={
                searchQuery
                  ? `No conversation matches "${searchQuery}". Try another name or item.`
                  : 'No conversations yet. Inquire about an item on Explore to start chatting!'
              }
              actionText={searchQuery ? undefined : 'Explore Items'}
              onAction={searchQuery ? undefined : () => navigation.navigate('Explore')}
            />
          }
        />
      )}
    </SafeAreaView>
  );
};

// UI Stylesheet definitions
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F0FDF4',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#064E3B',
  },
  headerTextBlock: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#064E3B',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  searchWrapper: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    backgroundColor: '#FFFFFF',
    borderRadius: 23,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    gap: 8,
  },
  searchIcon: {
    fontSize: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '500',
  },
  clearText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#94A3B8',
    paddingHorizontal: 4,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  rowUnread: {
    borderColor: '#86EFAC',
    backgroundColor: '#F7FEF9',
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#D1FAE5',
    borderWidth: 1.5,
    borderColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F1F5F9',
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: '900',
    color: '#064E3B',
  },
  rowBody: {
    flex: 1,
  },
  rowTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  name: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  time: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
  },
  itemTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
    marginTop: 2,
  },
  rowBottomLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 3,
  },
  preview: {
    flex: 1,
    fontSize: 12,
    color: '#64748B',
  },
  previewUnread: {
    color: '#0F172A',
    fontWeight: '700',
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  itemThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  itemThumbPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemThumbPlaceholderText: {
    fontSize: 18,
  },
});

export default MessagesListScreen;
