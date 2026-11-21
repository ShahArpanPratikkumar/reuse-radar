// =============================================================================
// REUSE RADAR - REQUESTS SCREEN (RequestsScreen.jsx)
// Purpose: Dedicated screen for tracking exchange handoffs, sent claims, and incoming requests.
// Features:
// 1. Dual-segmented view: 'My Requests' (sent) vs 'Incoming Claims' (received).
// 2. Direct Connect: displays distance, direct phone call, WhatsApp chat, and Google Maps directions.
// 3. 4-digit Handover PIN verification flow for secure item exchange and karma point award.
// 4. Temporary Borrow timer & Overdue tracking ('Due in X days', 'Overdue by X days', 'Mark as Returned').
// =============================================================================

import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Image,
  StatusBar,
  ScrollView,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Service layer communicating with /api/requests endpoints
import { requestService } from '../services/requestService';
import EmptyState from '../components/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner';
import VerifiedBadge from '../components/VerifiedBadge';
import { COLORS } from '../utils/constants';
import { AuthContext } from '../context/AuthContext';
import { getImageBaseUrl } from '../services/apiConfig';

const IMAGE_BASE_URL = getImageBaseUrl();

// Direct Connect helpers: phone formatting and relative campus distance
const digitsOnly = (phone = '') => String(phone).replace(/[^\d]/g, '');

const formatPhone = (phone = '') => {
  const digits = digitsOnly(phone);
  if (!digits) return '';
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
};

const normalizedPhone = (phone = '') => {
  const digits = digitsOnly(phone);
  if (!digits) return '';
  return digits.length === 10 ? `+91${digits}` : `+${digits}`;
};

// Helper: Extracts longitude and latitude coordinates from User or Item location object
const getCoordinates = (person) => {
  const coords = person?.location?.coordinates;
  if (!Array.isArray(coords) || coords.length !== 2) return null;
  const [lng, lat] = coords;
  if (typeof lng !== 'number' || typeof lat !== 'number') return null;
  return [lng, lat];
};

// Helper: Haversine distance in meters between two people on campus
const distanceInMeters = (personA, personB) => {
  const a = getCoordinates(personA);
  const b = getCoordinates(personB);
  if (!a || !b) return null;
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return Math.round(R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
};

// Helper: Formats meter distance into readable campus proximity label
const formatDistanceLabel = (meters) => {
  if (meters === null || meters === undefined) return '';
  if (meters < 1000) {
    const rounded = Math.max(10, Math.round(meters / 10) * 10);
    return `${rounded}m away on campus`;
  }
  return `${(meters / 1000).toFixed(1)} km away on campus`;
};

// Helper: Resolves image paths from relative to full URL
const resolveImageUri = (raw) => {
  if (!raw || typeof raw !== 'string') return null;
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) {
    return raw;
  }
  return `${IMAGE_BASE_URL}${raw.startsWith('/') ? '' : '/'}${raw}`;
};

export const RequestsScreen = ({ navigation }) => {
  const { token } = useContext(AuthContext);

  // Active tab state: 'sent' = My Outgoing Requests, 'received' = Received Incoming Claims
  const [activeTab, setActiveTab] = useState('sent');
  const [filterStatus, setFilterStatus] = useState('All');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Handover Verification PIN Modal State
  const [handoverModalVisible, setHandoverModalVisible] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [enteredPin, setEnteredPin] = useState('');
  const [verifyingPin, setVerifyingPin] = useState(false);

  // Action button spinner tracking
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Mechanism 1: Fetch Requests from Backend API
  const fetchRequests = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const statusParam = filterStatus === 'All' ? 'all' : filterStatus.toLowerCase();
      let res;
      if (activeTab === 'sent') {
        res = await requestService.getOutgoingRequests(statusParam);
      } else {
        res = await requestService.getIncomingRequests(statusParam);
      }

      if (res && res.success) {
        setRequests(res.requests || []);
      } else {
        setRequests([]);
      }
    } catch (err) {
      console.log('[RequestsScreen] fetch error:', err.message);
      setRequests([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, filterStatus, token]);

  useEffect(() => {
    setLoading(true);
    fetchRequests();
  }, [fetchRequests]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRequests();
  };

  // Mechanism 2: Donor Accepts or Declines Incoming Claim Request
  const handleRespond = async (requestId, action) => {
    const actionLabel = action === 'accept' ? 'Accept' : 'Decline';
    Alert.alert(
      `${actionLabel} Request?`,
      action === 'accept'
        ? 'A 4-digit verification PIN will be generated. The requester will show this PIN during item pickup.'
        : 'Are you sure you want to decline this claim request?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: actionLabel,
          style: action === 'reject' ? 'destructive' : 'default',
          onPress: async () => {
            setActionLoadingId(requestId);
            try {
              const res = await requestService.respondToRequest(requestId, action);
              if (res && res.success) {
                Alert.alert(
                  'Success',
                  action === 'accept'
                    ? `Request accepted! Verification PIN: ${res.request?.handoverCode || ''}`
                    : 'Request declined.'
                );
                fetchRequests();
              }
            } catch (err) {
              Alert.alert('Error', err.message || 'Could not update request.');
            } finally {
              setActionLoadingId(null);
            }
          },
        },
      ]
    );
  };

  // Mechanism 3: Requester Cancels Their Pending Request
  const handleCancel = (requestId) => {
    Alert.alert(
      'Cancel Request?',
      'Are you sure you want to cancel your request for this item?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            setActionLoadingId(requestId);
            try {
              const res = await requestService.cancelRequest(requestId);
              if (res && res.success) {
                Alert.alert('Request Cancelled', 'Your request has been removed.');
                fetchRequests();
              }
            } catch (err) {
              Alert.alert('Error', err.message || 'Could not cancel request.');
            } finally {
              setActionLoadingId(null);
            }
          },
        },
      ]
    );
  };

  // Mechanism 4: Complete Exchange Handover by Verifying 4-Digit Code
  const handleCompleteHandover = async () => {
    if (!enteredPin || enteredPin.trim().length !== 4) {
      Alert.alert('Invalid PIN', 'Please enter the 4-digit code provided by the receiver.');
      return;
    }

    setVerifyingPin(true);
    try {
      const res = await requestService.completeRequest(selectedRequest._id, enteredPin.trim());
      if (res && res.success) {
        setHandoverModalVisible(false);
        setEnteredPin('');
        setSelectedRequest(null);
        Alert.alert('🎉 Exchange Completed!', 'Both donor and receiver have earned karma points. Thank you for circular sharing!');
        fetchRequests();
      }
    } catch (err) {
      Alert.alert('Verification Failed', err.message || 'Incorrect PIN code or server error.');
    } finally {
      setVerifyingPin(false);
    }
  };

  // Mechanism 5: Confirm Return of Borrowed Item
  const handleMarkReturned = (request) => {
    Alert.alert(
      'Mark as Returned?',
      'Confirm that this borrowed item has been returned to you. It will be listed as available again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Returned',
          onPress: async () => {
            setActionLoadingId(request._id);
            try {
              const res = await requestService.markReturned(request._id);
              if (res && res.success) {
                Alert.alert('Returned ✅', 'The borrowed item is back in your hands.');
                fetchRequests();
              }
            } catch (err) {
              Alert.alert('Error', err.message || 'Could not mark the item returned.');
            } finally {
              setActionLoadingId(null);
            }
          },
        },
      ]
    );
  };

  // Status badge styling helper
  const getStatusColor = (status = 'pending') => {
    switch (status.toLowerCase()) {
      case 'accepted':
        return { bg: '#DCFCE7', text: '#166534', border: '#86EFAC' };
      case 'completed':
        return { bg: '#E0F2FE', text: '#0369A1', border: '#7DD3FC' };
      case 'rejected':
      case 'cancelled':
        return { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' };
      case 'pending':
      default:
        return { bg: '#FEF3C7', text: '#92400E', border: '#FCD34D' };
    }
  };

  // Mechanism 6: Render Exchange Request Card
  const renderRequestCard = ({ item }) => {
    const badgeStyle = getStatusColor(item.status);
    const itemData = item.item || {};
    const requester = item.requester || item.sender || {};
    const donor = item.donor || item.receiver || {};
    const isSent = activeTab === 'sent';
    const otherPerson = isSent ? donor : requester;
    const personLabel = isSent ? `Donor: ${donor.name || 'Member'}` : `Requester: ${requester.name || 'Member'}`;

    let imageUri = 'https://images.unsplash.com/photo-1532012164546-f432f2e3777a?auto=format&fit=crop&w=600&q=80';
    if (itemData.images && itemData.images.length > 0) {
      const first = itemData.images[0];
      imageUri = first.startsWith('http') ? first : `${IMAGE_BASE_URL}${first.startsWith('/') ? '' : '/'}${first}`;
    }

    const timeAgo = item.createdAt
      ? new Date(item.createdAt).toLocaleDateString()
      : 'Recently';

    const isBorrowRequest = itemData.listingType === 'borrow';
    const borrowDays = Number(itemData.borrowDays) || 7;
    const dueDate = item.dueAt ? new Date(item.dueAt) : null;
    const daysLeft = dueDate
      ? Math.ceil((dueDate.getTime() - Date.now()) / 86400000)
      : null;
    const showBorrowTimer = isBorrowRequest && item.handedOverAt && !item.returnedAt;

    // Direct Connect details unlocked by active exchange
    const contact = isSent ? donor : requester;
    const viewer = isSent ? requester : donor;
    const contactUnlocked = ['pending', 'accepted', 'completed'].includes(item.status);
    const contactPhone = String(contact.phone || '').trim();
    const contactPhonePretty = formatPhone(contactPhone);
    const mutualMeters = distanceInMeters(viewer, contact);
    const mutualDistanceLabel = formatDistanceLabel(mutualMeters);

    const handleCall = () => {
      const tel = normalizedPhone(contactPhone);
      if (!tel) {
        Alert.alert('No Number', 'This student has not added a contact number yet.');
        return;
      }
      Linking.openURL(`tel:${tel}`).catch(() =>
        Alert.alert('Call Failed', 'Your device could not place this call.')
      );
    };

    const handleWhatsApp = () => {
      const wa = normalizedPhone(contactPhone);
      if (!wa) {
        Alert.alert('No Number', 'This student has not added a contact number yet.');
        return;
      }
      Linking.openURL(`https://wa.me/${wa.replace('+', '')}`).catch(() =>
        Alert.alert('WhatsApp Unavailable', 'WhatsApp could not be opened on this device.')
      );
    };

    const handleDirections = () => {
      const coords =
        (Array.isArray(itemData.location?.coordinates) && itemData.location.coordinates.length === 2
          ? itemData.location.coordinates
          : null) || getCoordinates(contact);
      if (!coords) {
        Alert.alert('Directions Unavailable', 'Pickup coordinates are not shared for this listing.');
        return;
      }
      const [lng, lat] = coords;
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`).catch(() =>
        Alert.alert('Maps Unavailable', 'Could not open Google Maps on this device.')
      );
    };

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Image source={{ uri: imageUri }} style={styles.itemThumb} resizeMode="cover" />
          <View style={styles.cardMeta}>
            <Text style={styles.itemTitle} numberOfLines={1}>
              {itemData.title || 'Reusable Item'}
            </Text>
            <Text style={styles.categoryBadge}>{itemData.category || 'General'}</Text>
            {isBorrowRequest ? (
              <Text style={styles.borrowTag}>🔄 Borrow • {borrowDays} day term</Text>
            ) : null}
            <TouchableOpacity
              style={styles.personRow}
              onPress={() =>
                otherPerson?._id &&
                navigation.navigate('UserProfile', {
                  userId: otherPerson._id,
                  userName: otherPerson.name || 'Campus Student',
                })
              }
              disabled={!otherPerson?._id}
              activeOpacity={0.7}
            >
              {resolveImageUri(otherPerson?.avatar) ? (
                <Image
                  source={{ uri: resolveImageUri(otherPerson.avatar) }}
                  style={styles.personAvatarImg}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.personAvatar}>
                  <Text style={styles.personInitial}>
                    {(otherPerson?.name || 'C').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={styles.personText} numberOfLines={1}>
                👤 {personLabel}
              </Text>
              <VerifiedBadge verified={Boolean(otherPerson?.isVerified)} size={12} />
            </TouchableOpacity>
            <Text style={styles.timeText}>🕒 {timeAgo}</Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: badgeStyle.bg, borderColor: badgeStyle.border },
            ]}
          >
            <Text style={[styles.statusText, { color: badgeStyle.text }]}>
              {item.status?.toUpperCase() || 'PENDING'}
            </Text>
          </View>
        </View>

        {/* Temporary Borrow Due Timer Banner */}
        {showBorrowTimer ? (
          <View
            style={[
              styles.borrowDueCard,
              daysLeft !== null && daysLeft < 0 && styles.borrowDueOverdue,
            ]}
          >
            <Text
              style={[
                styles.borrowDueTitle,
                daysLeft !== null && daysLeft < 0 && styles.borrowDueTitleOverdue,
              ]}
            >
              {daysLeft === null
                ? '⏳ Borrowed'
                : daysLeft >= 0
                ? `⏳ Due in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`
                : `⚠️ Overdue by ${Math.abs(daysLeft)} ${Math.abs(daysLeft) === 1 ? 'day' : 'days'}`}
            </Text>
            <Text style={styles.borrowDueSub}>
              Due {dueDate ? dueDate.toLocaleDateString() : 'soon'}
              {item.returnedAt ? ' • Returned' : ''}
            </Text>
          </View>
        ) : null}

        {/* Message Note from Requester */}
        {item.message ? (
          <View style={styles.messageBox}>
            <Text style={styles.messageLabel}>Note:</Text>
            <Text style={styles.messageContent} numberOfLines={2}>
              "{item.message}"
            </Text>
          </View>
        ) : null}

        {/* Direct Connect Card: Phone, WhatsApp, Google Maps */}
        {contactUnlocked ? (
          <View style={styles.connectCard}>
            <View style={styles.connectHeaderRow}>
              <Text style={styles.connectTitle}>🤝 Direct Connect</Text>
              {mutualDistanceLabel ? (
                <View style={styles.distancePill}>
                  <Text style={styles.distancePillText}>📍 {mutualDistanceLabel}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.connectNameRow}>
              <Text style={styles.connectName} numberOfLines={1}>
                {contact.name || 'Campus Member'}
              </Text>
              <VerifiedBadge verified={Boolean(contact.isVerified)} size={13} />
            </View>

            <Text style={styles.connectMeta} numberOfLines={2}>
              🎓 {contact.department || 'Student'}
              {' • '}
              🏫{' '}
              {contact.addressName ||
                (itemData.addressText ? itemData.addressText.split(',')[0].trim() : 'Campus Community')}
            </Text>

            {contactPhonePretty ? (
              <Text style={styles.connectPhone}>📱 {contactPhonePretty}</Text>
            ) : (
              <Text style={styles.connectPhoneMuted}>📱 Contact number not shared yet</Text>
            )}

            <View style={styles.connectActionsRow}>
              <TouchableOpacity
                style={[styles.callBtn, !contactPhonePretty && styles.connectBtnDisabled]}
                onPress={handleCall}
                disabled={!contactPhonePretty}
                activeOpacity={0.85}
              >
                <Text style={styles.callBtnText}>📞 Call</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.waBtn, !contactPhonePretty && styles.connectBtnDisabled]}
                onPress={handleWhatsApp}
                disabled={!contactPhonePretty}
                activeOpacity={0.85}
              >
                <Text style={styles.waBtnText}>💬 WhatsApp</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dirBtn}
                onPress={handleDirections}
                activeOpacity={0.85}
              >
                <Text style={styles.dirBtnText}>🗺️ Directions</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.connectLockedCard}>
            <Text style={styles.connectLockedText}>
              🔒 Contact number & exact location unlock once this request is active.
            </Text>
          </View>
        )}

        {/* Pickup Details & PIN Indicator */}
        <View style={styles.cardFooter}>
          <Text style={styles.locationText} numberOfLines={1}>
            📍 {itemData.addressText ? itemData.addressText.split(',')[0].trim() : 'Campus Area'}
          </Text>

          {item.handoverCode && item.status === 'accepted' ? (
            <View style={styles.pinPill}>
              <Text style={styles.pinLabel}>{isSent ? 'Show PIN:' : 'PIN:'}</Text>
              <Text style={styles.pinValue}>{item.handoverCode}</Text>
            </View>
          ) : null}
        </View>

        {/* Action Controls */}
        <View style={styles.actionsRow}>
          {otherPerson?._id && itemData._id ? (
            <TouchableOpacity
              style={styles.chatQuickBtn}
              onPress={() =>
                navigation.navigate('Chat', {
                  itemId: itemData._id,
                  recipientId: otherPerson._id,
                  recipientName: otherPerson.name || 'Member',
                  recipientVerified: Boolean(otherPerson.isVerified),
                  itemTitle: itemData.title || '',
                  itemImage: itemData.images?.[0],
                })
              }
              activeOpacity={0.8}
            >
              <Text style={styles.chatQuickBtnText}>💬 Chat</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={styles.detailsBtn}
            onPress={() => itemData._id && navigation.navigate('ItemDetails', { item: itemData, itemId: itemData._id })}
            activeOpacity={0.8}
          >
            <Text style={styles.detailsBtnText}>👁️ View Item</Text>
          </TouchableOpacity>

          {/* Pending Incoming Claim: Accept / Decline */}
          {!isSent && item.status === 'pending' ? (
            <View style={styles.responseBtnsRow}>
              <TouchableOpacity
                style={styles.rejectBtn}
                onPress={() => handleRespond(item._id, 'reject')}
                disabled={actionLoadingId === item._id}
              >
                <Text style={styles.rejectBtnText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.acceptBtn}
                onPress={() => handleRespond(item._id, 'accept')}
                disabled={actionLoadingId === item._id}
              >
                <Text style={styles.acceptBtnText}>Accept</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Accepted Incoming Claim: Verify Handover */}
          {!isSent && item.status === 'accepted' ? (
            <TouchableOpacity
              style={styles.completeBtn}
              onPress={() => {
                setSelectedRequest(item);
                setEnteredPin('');
                setHandoverModalVisible(true);
              }}
            >
              <Text style={styles.completeBtnText}>🤝 Verify Handover</Text>
            </TouchableOpacity>
          ) : null}

          {/* Borrow Return Action */}
          {!isSent && showBorrowTimer ? (
            <TouchableOpacity
              style={styles.returnBtn}
              onPress={() => handleMarkReturned(item)}
              disabled={actionLoadingId === item._id}
              activeOpacity={0.85}
            >
              <Text style={styles.returnBtnText}>↩️ Mark as Returned</Text>
            </TouchableOpacity>
          ) : null}

          {/* Pending Outgoing Request: Cancel */}
          {isSent && item.status === 'pending' ? (
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => handleCancel(item._id)}
              disabled={actionLoadingId === item._id}
            >
              <Text style={styles.cancelBtnText}>Cancel Request</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F0FDF4" />

      {/* Screen Title Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Requests & Exchanges</Text>
        <Text style={styles.headerSubtitle}>
          Track your campus reuse handoffs and incoming claims
        </Text>
      </View>

      {/* Main Tab Segmented Control */}
      <View style={styles.segmentedContainer}>
        <TouchableOpacity
          style={[
            styles.segmentBtn,
            activeTab === 'sent' && styles.segmentBtnActive,
          ]}
          onPress={() => setActiveTab('sent')}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.segmentText,
              activeTab === 'sent' && styles.segmentTextActive,
            ]}
          >
            My Requests {activeTab === 'sent' ? `(${requests.length})` : ''}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.segmentBtn,
            activeTab === 'received' && styles.segmentBtnActive,
          ]}
          onPress={() => setActiveTab('received')}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.segmentText,
              activeTab === 'received' && styles.segmentTextActive,
            ]}
          >
            Incoming Claims {activeTab === 'received' ? `(${requests.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Status Filter Horizontal Chips */}
      <View style={styles.filterPillsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {['All', 'Pending', 'Accepted', 'Completed', 'Rejected'].map((status) => (
            <TouchableOpacity
              key={status}
              style={[
                styles.statusFilterChip,
                filterStatus === status && styles.statusFilterChipActive,
              ]}
              onPress={() => setFilterStatus(status)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.statusFilterText,
                  filterStatus === status && styles.statusFilterTextActive,
                ]}
              >
                {status}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Requests FlatList or Loading / Empty Component */}
      {loading ? (
        <LoadingSpinner message="Loading exchange requests..." />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item._id}
          renderItem={renderRequestCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#064E3B']} />
          }
          ListEmptyComponent={
            <EmptyState
              icon={activeTab === 'sent' ? '📦' : '📬'}
              title={activeTab === 'sent' ? 'No Sent Requests' : 'No Incoming Claims'}
              description={
                filterStatus === 'All'
                  ? activeTab === 'sent'
                    ? 'You have not requested any items yet. Explore nearby items on the Radar!'
                    : 'No students have requested your items yet. List more items to share circular resources.'
                  : `No requests with status "${filterStatus}".`
              }
              actionText={activeTab === 'sent' ? 'Explore Items' : '+ List Free Item'}
              onAction={() => navigation.navigate(activeTab === 'sent' ? 'Explore' : 'AddItem')}
            />
          }
        />
      )}

      {/* Handover Verification PIN Modal */}
      <Modal visible={handoverModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🤝 Verify Handover</Text>
            <Text style={styles.modalSubtitle}>
              Ask the receiver for their 4-digit verification code to complete this exchange and award karma points.
            </Text>

            <TextInput
              style={styles.pinInput}
              placeholder="Enter 4-digit PIN"
              placeholderTextColor="#94A3B8"
              keyboardType="number-pad"
              maxLength={4}
              value={enteredPin}
              onChangeText={setEnteredPin}
            />

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setHandoverModalVisible(false)}
                disabled={verifyingPin}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleCompleteHandover}
                disabled={verifyingPin}
              >
                {verifyingPin ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalConfirmBtnText}>Confirm Handover</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#064E3B',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  segmentedContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    padding: 4,
    marginBottom: 10,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 9,
  },
  segmentBtnActive: {
    backgroundColor: '#064E3B',
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  segmentTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  filterPillsContainer: {
    marginBottom: 10,
  },
  filterScroll: {
    paddingHorizontal: 20,
    gap: 8,
  },
  statusFilterChip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statusFilterChipActive: {
    backgroundColor: '#064E3B',
    borderColor: '#064E3B',
  },
  statusFilterText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  statusFilterTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemThumb: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  cardMeta: {
    flex: 1,
    marginLeft: 12,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  categoryBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
    marginBottom: 2,
  },
  borrowTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#075985',
    marginBottom: 2,
  },
  borrowDueCard: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 10,
  },
  borrowDueOverdue: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  borrowDueTitle: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#075985',
  },
  borrowDueTitleOverdue: {
    color: '#991B1B',
  },
  borrowDueSub: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  returnBtn: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#7DD3FC',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  returnBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#075985',
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  personAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  personAvatarImg: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#D1FAE5',
  },
  personInitial: {
    fontSize: 9,
    fontWeight: '900',
    color: '#059669',
  },
  personText: {
    flexShrink: 1,
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  timeText: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  messageBox: {
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 10,
    marginTop: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#059669',
  },
  messageLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 2,
  },
  messageContent: {
    fontSize: 12,
    color: '#334155',
    fontStyle: 'italic',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  locationText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    flex: 1,
  },
  pinPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  pinLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#166534',
  },
  pinValue: {
    fontSize: 13,
    fontWeight: '900',
    color: '#064E3B',
    letterSpacing: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 10,
  },
  detailsBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  detailsBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  chatQuickBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  chatQuickBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#064E3B',
  },
  responseBtnsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  rejectBtn: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  rejectBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#991B1B',
  },
  acceptBtn: {
    backgroundColor: '#064E3B',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
  },
  acceptBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#BEF264',
  },
  completeBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
  },
  completeBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  cancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
  },
  cancelBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#991B1B',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 22,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 16,
    lineHeight: 18,
  },
  pinInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 2,
    borderColor: '#059669',
    borderRadius: 14,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    paddingVertical: 12,
    letterSpacing: 8,
    color: '#064E3B',
    marginBottom: 20,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  modalConfirmBtn: {
    flex: 1.5,
    backgroundColor: '#064E3B',
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
  },
  modalConfirmBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#BEF264',
  },
  connectCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  connectHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  connectTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#064E3B',
    letterSpacing: 0.4,
  },
  distancePill: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  distancePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#166534',
  },
  connectNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  connectName: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
    flexShrink: 1,
  },
  connectMeta: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    marginTop: 3,
    lineHeight: 15,
  },
  connectPhone: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#075985',
    marginTop: 5,
    letterSpacing: 0.3,
  },
  connectPhoneMuted: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 5,
  },
  connectActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  connectBtnDisabled: {
    opacity: 0.5,
  },
  callBtn: {
    flex: 1,
    backgroundColor: '#064E3B',
    paddingVertical: 9,
    borderRadius: 11,
    alignItems: 'center',
  },
  callBtnText: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#BEF264',
  },
  waBtn: {
    flex: 1,
    backgroundColor: '#25D366',
    paddingVertical: 9,
    borderRadius: 11,
    alignItems: 'center',
  },
  waBtnText: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  dirBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#7DD3FC',
    paddingVertical: 9,
    borderRadius: 11,
    alignItems: 'center',
  },
  dirBtnText: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#075985',
  },
  connectLockedCard: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  connectLockedText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
  },
});

export default RequestsScreen;
