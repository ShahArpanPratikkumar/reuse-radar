// =============================================================================
// REUSE RADAR - ADMIN MODERATION SCREEN (AdminModerationScreen.jsx)
// Purpose: Content moderation dashboard for campus administrators to review reports.
// Features:
// 1. Report filtering tabs ('pending', 'reviewing', 'resolved', 'all').
// 2. Moderation stats summary banner (pending reports, reviewing, resolved, suspended users).
// 3. One-click listing hiding (hides spam/prohibited items from marketplace search).
// 4. One-click user suspension (suspends abusive campus members from posting/requesting).
// 5. Admin resolution notes modal documenting moderator actions.
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  StatusBar,
  ScrollView,
} from 'react-native';

// Report service provides admin moderation endpoints (/api/reports/admin/...)
import { reportService } from '../services/reportService';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { COLORS } from '../utils/constants';

// Tab options for filtering reports by review stage
const STATUS_TABS = ['pending', 'reviewing', 'resolved', 'all'];

const AdminModerationScreen = ({ navigation }) => {
  // Screen state definitions
  const [activeTab, setActiveTab] = useState('pending');
  const [reports, setReports] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Administrative Resolution Notes Modal States
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [targetStatus, setTargetStatus] = useState('');
  const [adminNote, setAdminNote] = useState('');

  // Mechanism 1: Fetch Moderation Queue and Admin Statistics
  const loadModerationData = useCallback(async () => {
    try {
      // Execute both report queue query and overview stats in parallel
      const [reportsRes, statsRes] = await Promise.all([
        reportService.getAdminReports(activeTab),
        reportService.getAdminStats(),
      ]);

      if (reportsRes && reportsRes.success) {
        setReports(reportsRes.reports || []);
      }
      if (statsRes && statsRes.success) {
        setStats(statsRes.stats);
      }
    } catch (err) {
      Alert.alert('Admin Notice', err.message || 'Could not load moderation data. Check admin permissions.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab]);

  // Load data whenever the active filter tab changes
  useEffect(() => {
    setLoading(true);
    loadModerationData();
  }, [loadModerationData]);

  // Mechanism 2: Pull to Refresh
  const onRefresh = () => {
    setRefreshing(true);
    loadModerationData();
  };

  // Mechanism 3: Open Status Change Modal
  const handleOpenStatusModal = (report, status) => {
    setSelectedReport(report);
    setTargetStatus(status);
    setAdminNote(report.adminNotes || '');
    setNoteModalVisible(true);
  };

  // Mechanism 4: Confirm Report Status Update
  const handleConfirmStatusChange = async () => {
    if (!selectedReport || !targetStatus) return;
    setActionLoadingId(selectedReport._id);
    setNoteModalVisible(false);
    try {
      const res = await reportService.updateReportStatus(
        selectedReport._id,
        targetStatus,
        adminNote
      );
      if (res && res.success) {
        Alert.alert('Status Updated', `Report marked as ${targetStatus}.`);
        loadModerationData();
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not update status');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Mechanism 5: Toggle Hide / Restore Item Listing
  // Immediately hides an item from public search queries when reported for spam or prohibited content
  const handleToggleHideItem = (item) => {
    if (!item) return;
    const willHide = !item.isHidden;
    Alert.alert(
      willHide ? 'Hide Item Listing' : 'Restore Item Listing',
      willHide
        ? `Are you sure you want to hide "${item.title}" from search and marketplace results?`
        : `Restore "${item.title}" to public marketplace visibility?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: willHide ? 'Hide Item' : 'Restore Item',
          style: willHide ? 'destructive' : 'default',
          onPress: async () => {
            setActionLoadingId(item._id);
            try {
              const res = await reportService.toggleHideItem(
                item._id,
                willHide,
                willHide ? 'Hidden by moderation team' : ''
              );
              if (res && res.success) {
                Alert.alert('Item Moderated', res.message);
                loadModerationData();
              }
            } catch (err) {
              Alert.alert('Error', err.message);
            } finally {
              setActionLoadingId(null);
            }
          },
        },
      ]
    );
  };

  // Mechanism 6: Toggle Suspend / Restore Student Account
  // Suspends bad actors, preventing them from listing items, requesting items, or chatting
  const handleToggleSuspendUser = (targetUser) => {
    if (!targetUser) return;
    const willSuspend = !targetUser.isSuspended;
    Alert.alert(
      willSuspend ? 'Suspend User' : 'Restore User',
      willSuspend
        ? `Are you sure you want to suspend "${targetUser.name}"? They will not be able to list items or send requests.`
        : `Re-activate "${targetUser.name}" account?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: willSuspend ? 'Suspend User' : 'Restore User',
          style: willSuspend ? 'destructive' : 'default',
          onPress: async () => {
            setActionLoadingId(targetUser._id);
            try {
              const res = await reportService.toggleSuspendUser(
                targetUser._id,
                willSuspend,
                willSuspend ? 'Community guidelines violation' : ''
              );
              if (res && res.success) {
                Alert.alert('User Moderated', res.message);
                loadModerationData();
              }
            } catch (err) {
              Alert.alert('Error', err.message);
            } finally {
              setActionLoadingId(null);
            }
          },
        },
      ]
    );
  };

  // Helper returning badge styles based on report status
  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case 'pending':
        return { bg: '#FEF3C7', text: '#92400E' };
      case 'reviewing':
        return { bg: '#E0F2FE', text: '#0369A1' };
      case 'resolved':
        return { bg: '#DCFCE7', text: '#15803D' };
      case 'rejected':
      default:
        return { bg: '#F1F5F9', text: '#475569' };
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F0FDF4" />

      {/* Screen Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>

        <View style={styles.topBarTitleRow}>
          <View style={styles.miniLogoBox}>
            <Text style={styles.miniLogoLetter}>🛡️</Text>
          </View>
          <Text style={styles.topBarTitle}>Admin Moderation</Text>
        </View>

        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
          <Text style={styles.refreshIcon}>🔄</Text>
        </TouchableOpacity>
      </View>

      {/* Overview Statistics Banner */}
      {stats && (
        <View style={styles.statsCard}>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{stats.pendingReports}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: '#0284C7' }]}>{stats.reviewingReports}</Text>
            <Text style={styles.statLabel}>Reviewing</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: '#059669' }]}>{stats.resolvedReports}</Text>
            <Text style={styles.statLabel}>Resolved</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: '#DC2626' }]}>{stats.suspendedUsers}</Text>
            <Text style={styles.statLabel}>Suspended</Text>
          </View>
        </View>
      )}

      {/* Status Segment Filter Tabs */}
      <View style={styles.tabsRow}>
        {STATUS_TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Reports List / Loading / Empty States */}
      {loading ? (
        <LoadingSpinner message="Loading reports..." />
      ) : reports.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="🛡️"
            title="All Clear!"
            message={`No ${activeTab} reports in the moderation queue.`}
          />
        </View>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#064E3B']} />
          }
          renderItem={({ item }) => {
            const badgeStyle = getStatusBadgeStyle(item.status);
            const isProcessing = actionLoadingId === item._id;

            return (
              <View style={styles.reportCard}>
                {/* Header with Report Type and Status Badges */}
                <View style={styles.cardHeader}>
                  <View
                    style={[
                      styles.typeBadge,
                      item.reportType === 'item' ? styles.typeBadgeItem : styles.typeBadgeUser,
                    ]}
                  >
                    <Text style={styles.typeBadgeText}>
                      {item.reportType === 'item' ? '🚩 ITEM REPORT' : '👤 USER REPORT'}
                    </Text>
                  </View>

                  <View style={[styles.statusBadge, { backgroundColor: badgeStyle.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: badgeStyle.text }]}>
                      {item.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                {/* Reason & Timestamp */}
                <Text style={styles.reportReason}>Reason: {item.reason}</Text>
                <Text style={styles.reportDate}>
                  Reported on {new Date(item.createdAt).toLocaleDateString()} at{' '}
                  {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>

                {/* Reporter's Detailed Description */}
                {item.description ? (
                  <View style={styles.quoteBox}>
                    <Text style={styles.quoteText}>"{item.description}"</Text>
                  </View>
                ) : null}

                {/* Subject Information Box */}
                <View style={styles.infoBox}>
                  {item.reportType === 'item' && item.reportedItem ? (
                    <View style={styles.targetRow}>
                      <Text style={styles.targetLabel}>Reported Listing:</Text>
                      <Text style={styles.targetTitle} numberOfLines={1}>
                        {item.reportedItem.title}
                      </Text>
                      {item.reportedItem.isHidden && (
                        <View style={styles.hiddenPill}>
                          <Text style={styles.hiddenPillText}>HIDDEN</Text>
                        </View>
                      )}
                    </View>
                  ) : null}

                  {item.reportedUser ? (
                    <View style={styles.targetRow}>
                      <Text style={styles.targetLabel}>Reported User:</Text>
                      <Text style={styles.targetTitle}>
                        {item.reportedUser.name} ({item.reportedUser.email})
                      </Text>
                      {item.reportedUser.isSuspended && (
                        <View style={styles.suspendedPill}>
                          <Text style={styles.suspendedPillText}>SUSPENDED</Text>
                        </View>
                      )}
                    </View>
                  ) : null}

                  <View style={styles.targetRow}>
                    <Text style={styles.targetLabel}>Reporter:</Text>
                    <Text style={styles.targetVal}>
                      {item.reporter?.name || 'Anonymous'} ({item.reporter?.email || 'N/A'})
                    </Text>
                  </View>

                  {item.adminNotes ? (
                    <View style={styles.adminNoteRow}>
                      <Text style={styles.adminNoteLabel}>Admin Note: </Text>
                      <Text style={styles.adminNoteVal}>{item.adminNotes}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Action Buttons Row */}
                <View style={styles.actionButtonsRow}>
                  {/* Transition to Reviewing */}
                  {item.status !== 'reviewing' && (
                    <TouchableOpacity
                      style={styles.reviewBtn}
                      onPress={() => handleOpenStatusModal(item, 'reviewing')}
                      disabled={isProcessing}
                    >
                      <Text style={styles.reviewBtnText}>Reviewing</Text>
                    </TouchableOpacity>
                  )}

                  {/* Transition to Resolved */}
                  {item.status !== 'resolved' && (
                    <TouchableOpacity
                      style={styles.resolveBtn}
                      onPress={() => handleOpenStatusModal(item, 'resolved')}
                      disabled={isProcessing}
                    >
                      <Text style={styles.resolveBtnText}>✓ Resolve</Text>
                    </TouchableOpacity>
                  )}

                  {/* Transition to Rejected */}
                  {item.status !== 'rejected' && (
                    <TouchableOpacity
                      style={styles.rejectBtn}
                      onPress={() => handleOpenStatusModal(item, 'rejected')}
                      disabled={isProcessing}
                    >
                      <Text style={styles.rejectBtnText}>✕ Reject</Text>
                    </TouchableOpacity>
                  )}

                  {/* Quick Moderation: Hide/Restore Item */}
                  {item.reportedItem && (
                    <TouchableOpacity
                      style={[
                        styles.moderationActionBtn,
                        item.reportedItem.isHidden ? styles.restoreBtn : styles.hideBtn,
                      ]}
                      onPress={() => handleToggleHideItem(item.reportedItem)}
                      disabled={isProcessing}
                    >
                      <Text style={styles.moderationActionBtnText}>
                        {item.reportedItem.isHidden ? 'Restore Item' : 'Hide Item'}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* Quick Moderation: Suspend/Unsuspend User */}
                  {item.reportedUser && (
                    <TouchableOpacity
                      style={[
                        styles.moderationActionBtn,
                        item.reportedUser.isSuspended ? styles.restoreBtn : styles.suspendBtn,
                      ]}
                      onPress={() => handleToggleSuspendUser(item.reportedUser)}
                      disabled={isProcessing}
                    >
                      <Text style={styles.moderationActionBtnText}>
                        {item.reportedUser.isSuspended ? 'Unsuspend' : 'Suspend User'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Admin Notes / Status Confirmation Modal */}
      <Modal visible={noteModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Mark as {targetStatus?.toUpperCase()}</Text>
            <Text style={styles.modalSubtitle}>
              Add an optional administrative note explaining the resolution for team records.
            </Text>

            <TextInput
              style={styles.modalNoteInput}
              placeholder="e.g. Verified with donor. Item was hidden due to duplicate listing."
              placeholderTextColor="#94A3B8"
              multiline
              numberOfLines={3}
              value={adminNote}
              onChangeText={setAdminNote}
            />

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setNoteModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleConfirmStatusChange}
              >
                <Text style={styles.modalConfirmText}>Save & Update</Text>
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
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  backBtnText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#064E3B',
  },
  topBarTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniLogoBox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniLogoLetter: {
    fontSize: 14,
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#064E3B',
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  refreshIcon: {
    fontSize: 16,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    marginBottom: 10,
    gap: 8,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingVertical: 8,
    borderRadius: 10,
  },
  statNum: {
    fontSize: 18,
    fontWeight: '900',
    color: '#D97706',
  },
  statLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '700',
    marginTop: 2,
  },
  tabsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 11,
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: '#064E3B',
  },
  tabText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#BEF264',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  reportCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  typeBadgeItem: {
    backgroundColor: '#FEE2E2',
  },
  typeBadgeUser: {
    backgroundColor: '#E0E7FF',
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0F172A',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  reportReason: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  reportDate: {
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 8,
  },
  quoteBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#DC2626',
    marginBottom: 10,
  },
  quoteText: {
    fontSize: 12,
    color: '#334155',
    fontStyle: 'italic',
  },
  infoBox: {
    backgroundColor: '#F0FDF4',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    marginBottom: 12,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  targetLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#064E3B',
  },
  targetTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  targetVal: {
    fontSize: 11,
    color: '#475569',
  },
  hiddenPill: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  hiddenPillText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
  suspendedPill: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  suspendedPillText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
  adminNoteRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  adminNoteLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0369A1',
  },
  adminNoteVal: {
    fontSize: 11,
    color: '#0F172A',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  reviewBtn: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  reviewBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369A1',
  },
  resolveBtn: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  resolveBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  rejectBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  rejectBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  moderationActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  hideBtn: {
    backgroundColor: '#FEE2E2',
  },
  restoreBtn: {
    backgroundColor: '#E6F4EA',
  },
  suspendBtn: {
    backgroundColor: '#FEE2E2',
  },
  moderationActionBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
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
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 12,
  },
  modalNoteInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    padding: 10,
    fontSize: 12,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    height: 80,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    height: 42,
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
  modalConfirmBtn: {
    flex: 1.5,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#BEF264',
  },
});

export default AdminModerationScreen;
