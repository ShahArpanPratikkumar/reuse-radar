// =============================================================================
// REUSE RADAR - CHAT SCREEN (ChatScreen.jsx)
// Purpose: Real-time 1-on-1 messaging interface between donor/seller and requester.
// Features:
// 1. Threaded chat linked to specific item (itemId) and recipient (recipientId).
// 2. Polls messages every 6 seconds to keep dialogue fresh without WebSocket complexity.
// 3. Quick pre-canned response chips ('Is this available?', 'Can I pick up today?').
// 4. Keyboard-resilient layout auto-scrolling to latest message on keyboard trigger.
// 5. Direct phone dialer integration (Linking.openURL) and native system share.
// =============================================================================

import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Share,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// AuthContext provides user session data to classify messages as outgoing or incoming
import { AuthContext } from '../context/AuthContext';
// Message service for fetching and posting chat messages
import { messageService } from '../services/messageService';
import { getImageBaseUrl } from '../services/apiConfig';
import VerifiedBadge from '../components/VerifiedBadge';

const IMAGE_BASE_URL = getImageBaseUrl();

// Quick response suggestions for common campus exchange questions
const QUICK_REPLIES = [
  'Is this available?',
  'Can I pick up today?',
  'Where on campus?',
];

// Helper: Converts relative image path to full static URL
const resolveImageUri = (raw) => {
  if (!raw || typeof raw !== 'string') return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return `${IMAGE_BASE_URL}${raw.startsWith('/') ? '' : '/'}${raw}`;
};

// Helper: Formats message creation timestamp to HH:MM format
const formatTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const ChatScreen = ({ route, navigation }) => {
  // Extract route parameters passed from item details or messages list
  const {
    itemId,
    recipientId,
    recipientName = 'ReUse Radar Member',
    itemTitle = '',
    itemImage,
    recipientPhone,
    recipientVerified = false,
  } = route.params || {};

  const { user } = useContext(AuthContext);

  // Screen state variables
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // FlatList reference to programmatically scroll to newest message
  const listRef = useRef(null);

  // Mechanism 1: Scroll to Latest Message Animation
  const scrollToLatest = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  // Mechanism 2: Keyboard Listener
  // Automatically scrolls to the bottom when the software keyboard opens
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        scrollToLatest();
      }
    );
    return () => {
      showSub.remove();
    };
  }, [scrollToLatest]);

  // Mechanism 3: Load Messages from Backend API
  const loadMessages = useCallback(
    async ({ silent = false } = {}) => {
      if (!itemId || !recipientId) {
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      try {
        const res = await messageService.getMessages(itemId, recipientId);
        if (res && res.success) {
          setMessages(res.messages || []);
        }
      } catch (err) {
        if (!silent) Alert.alert('Chat Unavailable', err.message || 'Could not load messages.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [itemId, recipientId]
  );

  // Initial load
  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Mechanism 4: Lightweight Polling Loop
  // Polls every 6 seconds to fetch newly arrived messages without requiring a WebSocket connection
  useEffect(() => {
    const interval = setInterval(() => {
      loadMessages({ silent: true });
    }, 6000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  // Mechanism 5: Send Message Handler
  // Sends typed draft or clicked preset text to the backend
  const handleSend = async (presetText) => {
    const text = (presetText ?? draft).trim();
    if (!text || sending) return;
    if (!itemId || !recipientId) {
      Alert.alert('Chat Unavailable', 'Missing item or recipient information.');
      return;
    }

    setSending(true);
    try {
      const res = await messageService.sendMessage(itemId, recipientId, text);
      if (res && res.success && res.message) {
        // Append newly created message locally to message list
        setMessages((prev) => [...prev, res.message]);
        setDraft('');
        scrollToLatest();
      }
    } catch (err) {
      Alert.alert('Message Not Sent', err.message || 'Could not send your message.');
    } finally {
      setSending(false);
    }
  };

  // Mechanism 5b: Delete Message Handler (long-press on own message)
  const handleDeleteMessage = (messageId) => {
    Alert.alert(
      'Delete Message?',
      'This message will be deleted for everyone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await messageService.deleteMessage(messageId);
              setMessages((prev) => prev.filter((m) => m._id !== messageId));
            } catch (err) {
              Alert.alert('Error', err.message || 'Could not delete message.');
            }
          },
        },
      ]
    );
  };

  // Mechanism 6: Native Phone Dialer Integration
  const handleCall = () => {
    if (!recipientPhone) {
      Alert.alert(
        'Call Unavailable',
        `${recipientName} has not shared a phone number. Coordinate the pickup inside this chat.`
      );
      return;
    }
    Linking.openURL(`tel:${recipientPhone}`).catch(() =>
      Alert.alert('Call Unavailable', 'Unable to open the phone dialer on this device.')
    );
  };

  // Mechanism 7: View Public Student Profile
  const handleOpenProfile = () => {
    if (!recipientId) {
      Alert.alert('Profile Unavailable', 'This conversation has no linked student account.');
      return;
    }
    navigation.navigate('UserProfile', { userId: recipientId, userName: recipientName });
  };

  // Mechanism 8: Native Share Action
  const handleShare = async () => {
    try {
      await Share.share({
        message: itemTitle
          ? `♻️ Coordinate a free reuse handoff for "${itemTitle}" on ReUse Radar.`
          : '♻️ Coordinate a free reuse handoff on ReUse Radar.',
      });
    } catch (e) {
      // User cancelled share
    }
  };

  const itemImageUri = resolveImageUri(itemImage);
  const recipientInitial = (recipientName || 'R').charAt(0).toUpperCase();

  // Mechanism 9: Render Chat Message Bubble
  const renderBubble = ({ item }) => {
    const senderId = item.sender?._id || item.sender;
    const isMe = String(senderId) === String(user?._id);
    const isRead = !!item.isRead;

    return (
      <TouchableOpacity
        onLongPress={isMe ? () => handleDeleteMessage(item._id) : undefined}
        delayLongPress={500}
        activeOpacity={1}
      >
        <View style={[styles.messageRow, isMe ? styles.messageRowMe : styles.messageRowOther]}>
          <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
            <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{item.text}</Text>
          </View>
          <View style={[styles.metaRow, isMe ? styles.metaRowMe : styles.metaRowOther]}>
            <Text style={styles.metaTime}>{formatTime(item.createdAt)}</Text>
            {isMe ? (
              <Text style={[styles.receipt, isRead && styles.receiptRead]}>
                {isRead ? '✓✓' : '✓'}
              </Text>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Screen Header Bar with Recipient Name, Verified Badge, Call, and Share buttons */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerIconBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={styles.headerIconText}>←</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerIdentity}
          onPress={handleOpenProfile}
          activeOpacity={0.75}
        >
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitial}>{recipientInitial}</Text>
            <View style={styles.avatarOnlineDot} />
          </View>
          <View style={styles.headerNameBlock}>
            <View style={styles.headerNameRow}>
              <Text style={styles.headerName} numberOfLines={1}>
                {recipientName}
              </Text>
              <VerifiedBadge verified={Boolean(recipientVerified)} size={13} />
            </View>
            <Text style={styles.headerSub}>Item handoff chat</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={handleCall} activeOpacity={0.7}>
            <Text style={styles.headerIconText}>📞</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIconBtn} onPress={handleShare} activeOpacity={0.7}>
            <Text style={styles.headerIconText}>↗</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Item Context Pill: Shows which item is being discussed */}
      {itemTitle ? (
        <View style={styles.itemPillWrapper}>
          <View style={styles.itemPill}>
            {itemImageUri ? (
              <Image source={{ uri: itemImageUri }} style={styles.itemPillImage} resizeMode="cover" />
            ) : (
              <View style={styles.itemPillImagePlaceholder}>
                <Text style={styles.itemPillImagePlaceholderText}>📦</Text>
              </View>
            )}
            <View style={styles.itemPillTextBlock}>
              <Text style={styles.itemPillLabel}>DISCUSSING</Text>
              <Text style={styles.itemPillTitle} numberOfLines={1}>
                {itemTitle}
              </Text>
            </View>
            {itemId ? (
              <TouchableOpacity
                style={styles.itemPillLink}
                onPress={() => navigation.navigate('ItemDetails', { itemId })}
                activeOpacity={0.7}
              >
                <Text style={styles.itemPillLinkText}>View</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Keyboard Avoiding Container */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color="#059669" />
            <Text style={styles.loadingText}>Loading conversation...</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item, index) => item._id || `${index}`}
            renderItem={renderBubble}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onContentSizeChange={scrollToLatest}
            onLayout={scrollToLatest}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <Text style={styles.emptyChatEmoji}>🤝</Text>
                <Text style={styles.emptyChatTitle}>Start the conversation</Text>
                <Text style={styles.emptyChatText}>
                  Say hello and coordinate pickup timing, location and item condition
                  directly with {recipientName}.
                </Text>
              </View>
            }
          />
        )}

        {/* Quick Response Suggested Reply Chips */}
        <View style={styles.quickRepliesRow}>
          {QUICK_REPLIES.map((reply) => (
            <TouchableOpacity
              key={reply}
              style={styles.quickChip}
              onPress={() => handleSend(reply)}
              disabled={sending}
              activeOpacity={0.75}
            >
              <Text style={styles.quickChipText}>{reply}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Message Input Composer and Send Action */}
        <View style={styles.composerRow}>
          <TextInput
            style={styles.composerInput}
            placeholder="Type your message..."
            placeholderTextColor="#94A3B8"
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={1000}
            textAlignVertical="top"
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]}
            onPress={() => handleSend()}
            disabled={!draft.trim() || sending}
            activeOpacity={0.85}
          >
            {sending ? (
              <ActivityIndicator color="#BEF264" size="small" />
            ) : (
              <Text style={styles.sendBtnText}>➤</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// UI Stylesheet definitions
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F0FDF4',
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 10,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  headerIconText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#064E3B',
  },
  headerIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#D1FAE5',
    borderWidth: 1.5,
    borderColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: '900',
    color: '#064E3B',
  },
  avatarOnlineDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#059669',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  headerNameBlock: {
    flex: 1,
  },
  headerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  headerName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSub: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  itemPillWrapper: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
  },
  itemPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 8,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    gap: 10,
  },
  itemPillImage: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: '#F1F5F9',
  },
  itemPillImagePlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemPillImagePlaceholderText: {
    fontSize: 16,
  },
  itemPillTextBlock: {
    flex: 1,
  },
  itemPillLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#059669',
    letterSpacing: 0.6,
  },
  itemPillTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 1,
  },
  itemPillLink: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
  },
  itemPillLinkText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#064E3B',
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
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexGrow: 1,
  },
  messageRow: {
    marginBottom: 10,
    maxWidth: '85%',
  },
  messageRowMe: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  messageRowOther: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubble: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 16,
  },
  bubbleMe: {
    backgroundColor: '#059669',
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#0F172A',
  },
  bubbleTextMe: {
    color: '#FFFFFF',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  metaRowMe: {
    justifyContent: 'flex-end',
  },
  metaRowOther: {
    justifyContent: 'flex-start',
  },
  metaTime: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
  },
  receipt: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
  },
  receiptRead: {
    color: '#059669',
  },
  emptyChat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 40,
  },
  emptyChatEmoji: {
    fontSize: 40,
    marginBottom: 10,
  },
  emptyChatTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#064E3B',
    marginBottom: 6,
  },
  emptyChatText: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
  },
  quickRepliesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  quickChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  quickChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#064E3B',
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  composerInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    backgroundColor: '#F8FAFC',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 14,
    color: '#0F172A',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  sendBtnText: {
    color: '#BEF264',
    fontSize: 16,
    fontWeight: '900',
  },
});

export default ChatScreen;
