// =============================================================================
// REUSE RADAR - MY ITEMS SCREEN (MyItemsScreen.jsx)
// Purpose: Multi-tab dashboard managing the student's item listings, incoming requests,
//          and outgoing exchange requests.
// Features:
// 1. Tabbed segments: 'Incoming' (received requests), 'My Requests' (sent), and 'Listings'.
// 2. 4-digit handover verification PIN mechanism (item owner confirms pickup code).
// 3. One-click clipboard copy for handover PINs and item listing IDs.
// 4. Quick listing operations: Edit item, Toggle availability (Mark Completed/Available), Delete item.
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  RefreshControl,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
  StatusBar,
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';

// Service integrations for listings and exchange requests
import { itemService } from '../services/itemService';
import { requestService } from '../services/requestService';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { COLORS } from '../utils/constants';
import { getImageBaseUrl } from '../services/apiConfig';

const IMAGE_BASE_URL = getImageBaseUrl();

const MyItemsScreen = ({ route, navigation }) => {
  // Determine initial active tab from route parameters ('received' | 'sent' | 'listings')
  const initialSection = route.params?.initialTab || 'received';

  const [activeSection, setActiveSection] = useState(initialSection);
  const [requestStatusFilter, setRequestStatusFilter] = useState('all');

  // State arrays for user's listings and exchange requests
  const [myItems, setMyItems] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Handover Code Verification Modal State
  const [handoverModalVisible, setHandoverModalVisible] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [enteredCode, setEnteredCode] = useState('');
  const [verifyingCode, setVerifyingCode] = useState(false);

  // Floating notification toast message state
  const [toastMsg, setToastMsg] = useState('');
  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  // Mechanism 1: Fetch Data according to Active Tab Segment
  const loadData = useCallback(async () => {
    try {
      if (activeSection === 'listings') {
        const res = await itemService.getMyItems();
        if (res && res.success) setMyItems(res.items || []);
      } else if (activeSection === 'received') {
        const res = await requestService.getIncomingRequests(requestStatusFilter);
        if (res && res.success) setIncomingRequests(res.requests || []);
      } else if (activeSection === 'sent') {
        const res = await requestService.getOutgoingRequests(requestStatusFilter);
        if (res && res.success) setOutgoingRequests(res.requests || []);
      }
    } catch (err) {
      console.log('[MyItems] Error loading data:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeSection, requestStatusFilter]);

  // Reload data when active tab changes
  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  // Mechanism 2: Pull to Refresh
  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Mechanism 3: Delete Item Listing
  const handleDeleteItem = (item) => {
    Alert.alert(
      'Delete Listing',
      `Are you sure you want to delete "${item.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await itemService.deleteItem(item._id);
              showToast('Item deleted successfully');
              loadData();
            } catch (err) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ]
    );
  };

  // Mechanism 4: Toggle Listing Status ('available' <-> 'completed')
  const handleToggleStatus = async (item) => {
    const nextStatus = item.status === 'available' ? 'completed' : 'available';
    try {
      await itemService.toggleStatus(item._id, nextStatus);
      showToast(`Status changed to ${nextStatus}`);
      loadData();
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  };

  // Mechanism 5: Accept or Decline Incoming Request
  const handleRespondRequest = async (requestId, action) => {
    try {
      const res = await requestService.respondToRequest(requestId, action);
      if (res && res.success) {
        showToast(`Request ${action}ed`);
        loadData();
      }
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  };

  // Mechanism 6: Cancel Outgoing Request
  const handleCancelRequest = async (requestId) => {
    Alert.alert('Cancel Request', 'Are you sure you want to cancel this request?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel',
        style: 'destructive',
        onPress: async () => {
          try {
            await requestService.cancelRequest(requestId);
            showToast('Request cancelled');
            loadData();
          } catch (err) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  // Mechanism 7: Copy Handover Code to Clipboard
  const handleCopyHandoverCode = async (code) => {
    await Clipboard.setStringAsync(code);
    showToast(`Code ${code} copied to clipboard!`);
  };

  // Mechanism 8: Copy Item ID to Clipboard
  const handleCopyItemId = async (itemId) => {
    if (!itemId) return;
    await Clipboard.setStringAsync(String(itemId));
    showToast('Item ID copied to clipboard!');
  };

  // Mechanism 9: Complete Exchange Handover Verification
  // Verifies the 4-digit PIN provided by the requester, marks request completed,
  // awards +50 karma points to donor, +10 to receiver, and marks item completed
  const handleVerifyHandoverCode = async () => {
    if (!enteredCode.trim() || !selectedRequest) return;
    setVerifyingCode(true);
    try {
      const res = await requestService.completeRequest(selectedRequest._id, enteredCode.trim());
      if (res && res.success) {
        setHandoverModalVisible(false);
        setEnteredCode('');
        Alert.alert('🎉 Item Handover Completed!', 'Karma points & XP have been awarded to both of you!');
        loadData();
      }
    } catch (err) {
      Alert.alert('Verification Failed', err.message || 'Incorrect 4-digit code. Please check with requester.');
    } finally {
      setVerifyingCode(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F0FDF4" />

      {/* Top Header Bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarTitleRow}>
          <View style={styles.miniLogoBox}>
            <Text style={styles.miniLogoLetter}>R</Text>
          </View>
          <Text style={styles.topBarTitle}>Requests & Exchanges</Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate('AddItem')}
          activeOpacity={0.8}
        >
          <Text style={styles.addBtnText}>+ List Item</Text>
        </TouchableOpacity>
      </View>

      {/* Floating Status Toast Message */}
      {toastMsg ? (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      ) : null}

      {/* Segmented Tab Controls */}
      <View style={styles.segmentContainer}>
        <TouchableOpacity
          style={[styles.segmentBtn, activeSection === 'received' && styles.segmentBtnActive]}
          onPress={() => setActiveSection('received')}
        >
          <Text style={[styles.segmentText, activeSection === 'received' && styles.segmentTextActive]}>
            Incoming ({incomingRequests.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, activeSection === 'sent' && styles.segmentBtnActive]}
          onPress={() => setActiveSection('sent')}
        >
          <Text style={[styles.segmentText, activeSection === 'sent' && styles.segmentTextActive]}>
            My Requests ({outgoingRequests.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, activeSection === 'listings' && styles.segmentBtnActive]}
          onPress={() => setActiveSection('listings')}
        >
          <Text style={[styles.segmentText, activeSection === 'listings' && styles.segmentTextActive]}>
            Listings ({myItems.length})
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <LoadingSpinner message="Loading exchanges..." />
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#064E3B']} />}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* TAB 1: INCOMING REQUESTS FROM OTHER STUDENTS */}
          {activeSection === 'received' && (
            incomingRequests.length === 0 ? (
              <EmptyState
                icon="📬"
                title="No Incoming Requests Yet"
                description="When campus neighbors request your items, they will appear here with pickup options."
              />
            ) : (
              incomingRequests.map((req) => (
                <View key={req._id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.itemTitle}>{req.item?.title || 'Reusable Item'}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: req.status === 'accepted' ? '#DCFCE7' : '#FEF3C7' }]}>
                      <Text style={[styles.statusText, { color: req.status === 'accepted' ? '#166534' : '#92400E' }]}>
                        {req.status?.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.requesterInfo}>
                    From: <Text style={{ fontWeight: '700', color: '#0F172A' }}>{req.sender?.name || 'Fellow Neighbor'}</Text>
                    {req.sender?.collegeName ? ` • ${req.sender.collegeName}` : ''}
                  </Text>

                  {req.message ? (
                    <View style={styles.quoteBox}>
                      <Text style={styles.quoteText}>"{req.message}"</Text>
                    </View>
                  ) : null}

                  {/* Accept / Decline Action Buttons */}
                  {req.status === 'pending' && (
                    <View style={styles.actionsRow}>
                      <TouchableOpacity
                        style={styles.rejectBtn}
                        onPress={() => handleRespondRequest(req._id, 'reject')}
                      >
                        <Text style={styles.rejectBtnText}>Decline</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.acceptBtn}
                        onPress={() => handleRespondRequest(req._id, 'accept')}
                      >
                        <Text style={styles.acceptBtnText}>Accept Request</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Handover PIN Verification Action */}
                  {req.status === 'accepted' && (
                    <TouchableOpacity
                      style={styles.verifyBtn}
                      onPress={() => {
                        setSelectedRequest(req);
                        setHandoverModalVisible(true);
                      }}
                    >
                      <Text style={styles.verifyBtnText}>🔐 Verify 4-Digit Handover PIN</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )
          )}

          {/* TAB 2: OUTGOING REQUESTS SENT BY ME */}
          {activeSection === 'sent' && (
            outgoingRequests.length === 0 ? (
              <EmptyState
                icon="🧭"
                title="No Active Requests"
                description="Discover free books, cycles, or electronics nearby and request them."
                actionText="Explore Radar"
                onAction={() => navigation.navigate('Explore')}
              />
            ) : (
              outgoingRequests.map((req) => (
                <View key={req._id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.itemTitle}>{req.item?.title || 'Requested Item'}</Text>
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusText}>{req.status?.toUpperCase()}</Text>
                    </View>
                  </View>

                  <Text style={styles.requesterInfo}>
                    Owner: <Text style={{ fontWeight: '700', color: '#0F172A' }}>{req.receiver?.name || 'Owner'}</Text>
                  </Text>

                  {/* 4-digit Handover PIN Display (Shown when request is accepted) */}
                  {req.status === 'accepted' && req.handoverCode && (
                    <View style={styles.codeBanner}>
                      <Text style={styles.codeLabel}>YOUR 4-DIGIT HANDOVER PIN:</Text>
                      <TouchableOpacity onPress={() => handleCopyHandoverCode(req.handoverCode)}>
                        <Text style={styles.codeValue}>{req.handoverCode} 📋</Text>
                      </TouchableOpacity>
                      <Text style={styles.codeHelp}>Show this PIN to the owner during item pickup.</Text>
                    </View>
                  )}

                  {req.status === 'pending' && (
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={() => handleCancelRequest(req._id)}
                    >
                      <Text style={styles.cancelBtnText}>Cancel Request</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )
          )}

          {/* TAB 3: MY POSTED ITEM LISTINGS */}
          {activeSection === 'listings' && (
            myItems.length === 0 ? (
              <EmptyState
                icon="📦"
                title="No Listed Items"
                description="Give your unused books, electronics, or clothes a second life."
                actionText="+ List Free Item"
                onAction={() => navigation.navigate('AddItem')}
              />
            ) : (
              myItems.map((item) => {
                let imageUri = null;
                if (item.images && item.images.length > 0) {
                  const first = item.images[0];
                  imageUri = first.startsWith('http')
                    ? first
                    : `${IMAGE_BASE_URL}${first.startsWith('/') ? '' : '/'}${first}`;
                }

                return (
                  <TouchableOpacity
                    key={item._id}
                    style={styles.card}
                    activeOpacity={0.9}
                    onPress={() => navigation.navigate('ItemDetails', { item })}
                  >
                    <View style={styles.listingCardTopRow}>
                      {imageUri ? (
                        <Image source={{ uri: imageUri }} style={styles.listingThumbnail} resizeMode="cover" />
                      ) : null}

                      <View style={{ flex: 1 }}>
                        <View style={styles.cardHeader}>
                          <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                          <View style={[styles.statusBadge, { backgroundColor: item.status === 'available' ? '#DCFCE7' : '#F1F5F9' }]}>
                            <Text style={[styles.statusText, { color: item.status === 'available' ? '#166534' : '#64748B' }]}>
                              {item.status?.toUpperCase()}
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.requesterInfo}>
                          {item.category} • {item.condition} • {item.addressText || 'Campus Area'}
                        </Text>
                        <Text style={styles.listingViewsCount}>
                          👁️ {item.views || 0} views • 🕒 {new Date(item.createdAt).toLocaleDateString()}
                        </Text>
                      </View>
                    </View>

                    {/* Listing Action Controls */}
                    <View style={styles.actionsRow}>
                      <TouchableOpacity
                        style={styles.copyIdBtn}
                        onPress={() => handleCopyItemId(item._id)}
                      >
                        <Text style={styles.copyIdBtnText}>📋 ID</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.editBtn}
                        onPress={() => navigation.navigate('AddItem', { itemToEdit: item })}
                      >
                        <Text style={styles.editBtnText}>✏️ Edit</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.toggleStatusBtn}
                        onPress={() => handleToggleStatus(item)}
                      >
                        <Text style={styles.toggleStatusBtnText}>
                          {item.status === 'available' ? 'Mark Completed' : 'Mark Available'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => handleDeleteItem(item)}
                      >
                        <Text style={styles.deleteBtnText}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })
            )
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Handover Code Verification Modal */}
      <Modal visible={handoverModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Verify Handover PIN</Text>
            <Text style={styles.modalDesc}>
              Ask the requester for their 4-digit PIN to securely complete the item handoff.
            </Text>

            <TextInput
              style={styles.pinInput}
              value={enteredCode}
              onChangeText={setEnteredCode}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="••••"
              placeholderTextColor="#94A3B8"
              textAlign="center"
            />

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setHandoverModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalVerifyBtn}
                onPress={handleVerifyHandoverCode}
                disabled={verifyingCode}
              >
                {verifyingCode ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalVerifyText}>Verify & Complete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// UI Stylesheet definitions
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0FDF4',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    backgroundColor: '#F0FDF4',
  },
  topBarTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniLogoBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniLogoLetter: {
    color: '#BEF264',
    fontSize: 16,
    fontWeight: '900',
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#064E3B',
  },
  addBtn: {
    backgroundColor: '#064E3B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  addBtnText: {
    color: '#BEF264',
    fontSize: 11,
    fontWeight: '800',
  },
  toast: {
    backgroundColor: '#064E3B',
    padding: 10,
    marginHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  segmentContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#064E3B',
  },
  segmentText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 30,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#DCFCE7',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#166534',
  },
  requesterInfo: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 8,
  },
  quoteBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#059669',
  },
  quoteText: {
    fontSize: 12,
    color: '#334155',
    fontStyle: 'italic',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  listingCardTopRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  listingThumbnail: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
  },
  listingViewsCount: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
    marginTop: 2,
  },
  copyIdBtn: {
    paddingHorizontal: 10,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyIdBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  editBtn: {
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#064E3B',
  },
  rejectBtn: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  acceptBtn: {
    flex: 2,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  verifyBtn: {
    backgroundColor: '#064E3B',
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  verifyBtnText: {
    color: '#BEF264',
    fontSize: 13,
    fontWeight: '800',
  },
  codeBanner: {
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  codeLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#064E3B',
    letterSpacing: 0.5,
  },
  codeValue: {
    fontSize: 26,
    fontWeight: '900',
    color: '#064E3B',
    letterSpacing: 4,
    marginVertical: 4,
  },
  codeHelp: {
    fontSize: 11,
    color: '#059669',
  },
  cancelBtn: {
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  toggleStatusBtn: {
    flex: 2,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleStatusBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  deleteBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#DC2626',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 4,
  },
  modalDesc: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  pinInput: {
    width: 140,
    height: 52,
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    fontSize: 26,
    fontWeight: '900',
    color: '#064E3B',
    letterSpacing: 6,
    marginBottom: 20,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  modalVerifyBtn: {
    flex: 2,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalVerifyText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#BEF264',
  },
});

export default MyItemsScreen;
