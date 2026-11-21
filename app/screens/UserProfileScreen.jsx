// =============================================================================
// REUSE RADAR - USER PROFILE SCREEN (UserProfileScreen.jsx)
// Purpose: Public student community trust profile and reputation scorecard.
// Features:
// 1. Displays karma points, completed handovers count, and trust record status.
// 2. Privacy-first communication: phone & WhatsApp remain locked until an active request exists.
// 3. Grid of all public item listings created by this student.
// 4. In-app student report system (Spam, Harassment, Scam, Inappropriate Behavior).
// =============================================================================

import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  StatusBar,
  Linking,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Service integrations for public profile, requests, and reporting
import { authService } from '../services/authService';
import { requestService } from '../services/requestService';
import { reportService } from '../services/reportService';
import ItemCard from '../components/ItemCard';
import { getImageBaseUrl } from '../services/apiConfig';
import { AuthContext } from '../context/AuthContext';

const IMAGE_BASE_URL = getImageBaseUrl();

// Pre-defined reasons for reporting a student profile
const USER_REPORT_REASONS = [
  'Spam',
  'Harassment',
  'Fake Profile',
  'Scam / Fraud',
  'Inappropriate Behavior',
  'Other',
];

// Contact details unlock only when an active request exists
const UNLOCKED_STATUSES = ['pending', 'accepted', 'completed'];

// Helper 1: Converts avatar image path to fully resolved URL
const resolveImageUri = (raw) => {
  if (!raw || typeof raw !== 'string') return null;
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) {
    return raw;
  }
  return `${IMAGE_BASE_URL}${raw.startsWith('/') ? '' : '/'}${raw}`;
};

// Helper 2: Strips non-digit characters from telephone number string
const digitsOnly = (phone = '') => String(phone).replace(/[^\d]/g, '');

// Helper 3: Formats digits into clean +91 standard phone representation
const formatPhone = (phone = '') => {
  const digits = digitsOnly(phone);
  if (!digits) return '';
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
};

// Helper 4: Formats registration timestamp to "Member since Month Year"
const memberSince = (createdAt) => {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 'New on ReUse Radar';
  return `Member since ${date.toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  })}`;
};

const UserProfileScreen = ({ route, navigation }) => {
  // Extract targeted student's userId from route parameters
  const userId = route.params?.userId || route.params?.user?._id || null;
  const paramName = route.params?.userName || route.params?.user?.name || '';
  const { user: currentUser } = useContext(AuthContext);

  // Screen state variables
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [listings, setListings] = useState([]);
  const [contactPhone, setContactPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Report student modal states
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [selectedReason, setSelectedReason] = useState(USER_REPORT_REASONS[0]);
  const [reportDescription, setReportDescription] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);

  // Mechanism 1: Unlocked Phone Query
  // Privacy feature: resolves phone number ONLY if an active exchange connects both students
  const fetchUnlockedPhone = useCallback(async () => {
    if (!userId) return;
    try {
      const [outgoing, incoming] = await Promise.all([
        requestService.getOutgoingRequests('all'),
        requestService.getIncomingRequests('all'),
      ]);

      const outgoingMatch = (outgoing?.requests || []).find(
        (r) =>
          UNLOCKED_STATUSES.includes(r.status) &&
          String(r.receiver?._id || r.receiver) === String(userId)
      );
      const incomingMatch = (incoming?.requests || []).find(
        (r) =>
          UNLOCKED_STATUSES.includes(r.status) &&
          String(r.sender?._id || r.sender) === String(userId)
      );

      const other = outgoingMatch?.receiver || incomingMatch?.sender || null;
      setContactPhone(String(other?.phone || '').trim());
    } catch (e) {
      setContactPhone('');
    }
  }, [userId]);

  // Mechanism 2: Fetch Public Student Profile & Trust Metrics
  const loadProfile = useCallback(
    async ({ silent = false } = {}) => {
      if (!userId) {
        setErrorMessage('No student selected.');
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      try {
        const res = await authService.getPublicProfile(userId);
        if (res && res.success) {
          setProfile(res.profile || null);
          setStats(res.stats || null);
          setListings(res.listings || []);
          setErrorMessage('');
        }
      } catch (err) {
        setErrorMessage(err.message || 'Could not load this student profile.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [userId]
  );

  useEffect(() => {
    loadProfile();
    fetchUnlockedPhone();
  }, [loadProfile, fetchUnlockedPhone]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadProfile({ silent: true });
    fetchUnlockedPhone();
  };

  const phoneDigits = digitsOnly(contactPhone);
  const phonePretty = formatPhone(contactPhone);

  // Mechanism 3: Direct Phone Call Action
  const handleCall = () => {
    if (!phoneDigits) {
      Alert.alert('Call Unavailable', 'Phone numbers unlock once you have an active exchange with this student.');
      return;
    }
    const tel = phoneDigits.length === 10 ? `+91${phoneDigits}` : `+${phoneDigits}`;
    Linking.openURL(`tel:${tel}`).catch(() =>
      Alert.alert('Call Failed', 'Your device could not place this call.')
    );
  };

  // Mechanism 4: WhatsApp Deep Linking Action
  const handleWhatsApp = () => {
    if (!phoneDigits) {
      Alert.alert('WhatsApp Unavailable', 'Phone numbers unlock once you have an active exchange with this student.');
      return;
    }
    const wa = phoneDigits.length === 10 ? `91${phoneDigits}` : phoneDigits;
    Linking.openURL(`https://wa.me/${wa}`).catch(() =>
      Alert.alert('WhatsApp Unavailable', 'WhatsApp could not be opened on this device.')
    );
  };

  // Mechanism 5: Open Direct Chat with Student
  const handleStartChat = () => {
    const firstListing = listings[0];
    if (!userId) return;
    if (!firstListing?._id) {
      Alert.alert(
        'Chat Needs a Listing',
        'This student has no active listing to discuss yet. You can reach out once they list an item.'
      );
      return;
    }
    navigation.navigate('Chat', {
      itemId: firstListing._id,
      recipientId: userId,
      recipientName: profile?.name || paramName || 'Campus Student',
      recipientVerified: Boolean(profile?.isVerified),
      itemTitle: firstListing.title || '',
      itemImage: firstListing.images?.[0],
    });
  };

  // Mechanism 6: Submit User Violation Report
  const openReportModal = () => {
    setSelectedReason(USER_REPORT_REASONS[0]);
    setReportDescription('');
    setReportModalVisible(true);
  };

  const handleSubmitReport = async () => {
    if (!selectedReason) {
      Alert.alert('Validation Error', 'Please select a reason for the report.');
      return;
    }
    setSubmittingReport(true);
    try {
      const res = await reportService.reportUser(userId, selectedReason, reportDescription);
      if (res && res.success) {
        setReportModalVisible(false);
        Alert.alert(
          'Report Received',
          res.message || 'Thank you. Our campus moderation team is reviewing this account.'
        );
        loadProfile({ silent: true });
      }
    } catch (err) {
      Alert.alert('Report Notice', err.message || 'Unable to submit report. Please try again.');
    } finally {
      setSubmittingReport(false);
    }
  };

  const avatarUri = resolveImageUri(profile?.avatar);
  const displayName = profile?.name || paramName || 'Campus Student';
  const initial = displayName.charAt(0).toUpperCase();
  const isMe = currentUser && userId && String(currentUser._id) === String(userId);
  const cleanRecord = stats ? stats.cleanRecord !== false : true;

  if (loading) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor="#F0FDF4" />
        <ActivityIndicator size="large" color="#064E3B" />
        <Text style={styles.loadingText}>Checking campus trust record…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F0FDF4" />

      {/* Screen Header Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Student Profile</Text>
        <View style={styles.topBarSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#064E3B" />
        }
      >
        {errorMessage ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => loadProfile()}>
              <Text style={styles.retryBtnText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Identity & Campus Badges Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} resizeMode="cover" />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>{initial}</Text>
              </View>
            )}
            {profile?.isVerified ? (
              <View style={styles.avatarCheck}>
                <Text style={styles.avatarCheckText}>✓</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.name} numberOfLines={2}>
            {displayName}
          </Text>

          {profile?.isVerified ? (
            <View style={styles.verifiedPill}>
              <Text style={styles.verifiedPillText}>Verified Campus Student ✅</Text>
            </View>
          ) : (
            <View style={styles.unverifiedPill}>
              <Text style={styles.unverifiedPillText}>Campus Student • Unverified</Text>
            </View>
          )}

          <View style={styles.chipRow}>
            <View style={styles.chip}>
              <Text style={styles.chipText}>🏫 {profile?.collegeName || 'Campus Community'}</Text>
            </View>
            {profile?.department ? (
              <View style={styles.chip}>
                <Text style={styles.chipText}>🎓 {profile.department}</Text>
              </View>
            ) : null}
            {profile?.enrollmentNumber ? (
              <View style={styles.chipMuted}>
                <Text style={styles.chipMutedText}>ID • {profile.enrollmentNumber}</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.memberSince}>{memberSince(profile?.createdAt)}</Text>
        </View>

        {/* Trust Metrics Bar: Karma, Completed Handovers, Clean Safety Record */}
        <View style={styles.trustBar}>
          <View style={styles.trustCell}>
            <Text style={styles.trustEmoji}>⭐</Text>
            <Text style={styles.trustValue}>{profile?.karmaPoints ?? 0}</Text>
            <Text style={styles.trustLabel}>Karma Points</Text>
          </View>
          <View style={styles.trustDivider} />
          <View style={styles.trustCell}>
            <Text style={styles.trustEmoji}>🤝</Text>
            <Text style={styles.trustValue}>{stats?.completedHandovers ?? 0}</Text>
            <Text style={styles.trustLabel}>Completed Handovers</Text>
          </View>
          <View style={styles.trustDivider} />
          <View style={styles.trustCell}>
            <Text style={styles.trustEmoji}>🛡️</Text>
            <Text style={[styles.trustValue, !cleanRecord && styles.trustValueWarn]}>
              {cleanRecord ? 'Clean' : `${stats?.totalComplaints ?? 0}`}
            </Text>
            <Text style={styles.trustLabel}>
              {cleanRecord ? 'Clean Record' : 'Complaint(s) on file'}
            </Text>
          </View>
        </View>

        {/* Contribution Summary Statistics */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryValue}>{stats?.totalItemsShared ?? 0}</Text>
            <Text style={styles.summaryLabel}>Items shared</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryValue}>{stats?.totalItemsReceived ?? 0}</Text>
            <Text style={styles.summaryLabel}>Items received</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryValue}>{stats?.activeListings ?? listings.length}</Text>
            <Text style={styles.summaryLabel}>Active listings</Text>
          </View>
        </View>

        {/* Action Controls: Chat, Call, WhatsApp, Report */}
        {!isMe ? (
          <View style={styles.actionsBlock}>
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.chatBtn}
                onPress={handleStartChat}
                activeOpacity={0.85}
              >
                <Text style={styles.chatBtnText}>💬 Start Chat</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.callBtn, !phoneDigits && styles.actionBtnDisabled]}
                onPress={handleCall}
                activeOpacity={0.85}
              >
                <Text style={styles.callBtnText}>📞 Call</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.waBtn, !phoneDigits && styles.actionBtnDisabled]}
                onPress={handleWhatsApp}
                activeOpacity={0.85}
              >
                <Text style={styles.waBtnText}>💬 WhatsApp</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.contactHint}>
              {phoneDigits
                ? `📱 ${phonePretty}`
                : '🔒 Phone number unlocks after an active request, keeping every student private until you connect.'}
            </Text>

            <TouchableOpacity
              style={styles.reportBtn}
              onPress={openReportModal}
              activeOpacity={0.85}
            >
              <Text style={styles.reportBtnText}>🚩 Report Suspicious User</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.selfCard}>
            <Text style={styles.selfCardText}>This is how other students see your trust profile.</Text>
          </View>
        )}

        {/* Active Campus Listings Section */}
        <Text style={styles.sectionTitle}>Campus Listings by this Student</Text>

        {listings.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>📦</Text>
            <Text style={styles.emptyTitle}>No active listings right now</Text>
            <Text style={styles.emptySub}>
              When this student gives something away it will appear here.
            </Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {listings.map((item) => (
              <View key={item._id} style={styles.gridCell}>
                <ItemCard
                  item={item}
                  isGrid
                  onPress={() =>
                    navigation.navigate('ItemDetails', { item, itemId: item._id })
                  }
                />
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Report Student Modal */}
      <Modal visible={reportModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalBadge}>🚩 REPORT USER</Text>
              <TouchableOpacity onPress={() => setReportModalVisible(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalTitle}>Report {displayName}</Text>
            <Text style={styles.modalSub}>
              Reports are private and reviewed by the campus safety team.
            </Text>

            <Text style={styles.modalLabel}>REASON *</Text>
            <View style={styles.reasonWrap}>
              {USER_REPORT_REASONS.map((reason) => (
                <TouchableOpacity
                  key={reason}
                  style={[
                    styles.reasonChip,
                    selectedReason === reason && styles.reasonChipSelected,
                  ]}
                  onPress={() => setSelectedReason(reason)}
                >
                  <Text
                    style={[
                      styles.reasonChipText,
                      selectedReason === reason && styles.reasonChipTextSelected,
                    ]}
                  >
                    {reason}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalLabel}>ADDITIONAL DETAILS (OPTIONAL)</Text>
            <TextInput
              style={styles.reportInput}
              placeholder="What made you suspicious? Share any details that help our team."
              placeholderTextColor="#94A3B8"
              multiline
              numberOfLines={3}
              value={reportDescription}
              onChangeText={setReportDescription}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setReportModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={handleSubmitReport}
                disabled={submittingReport}
              >
                {submittingReport ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>Submit Report</Text>
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
  centered: {
    flex: 1,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
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
  topBarTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#064E3B',
  },
  topBarSpacer: {
    width: 36,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#991B1B',
    marginBottom: 8,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#064E3B',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
  },
  retryBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#BEF264',
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingVertical: 22,
    paddingHorizontal: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 12,
  },
  avatarImage: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 3,
    borderColor: '#059669',
    backgroundColor: '#D1FAE5',
  },
  avatarFallback: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 3,
    borderColor: '#059669',
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 34,
    fontWeight: '900',
    color: '#064E3B',
  },
  avatarCheck: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  avatarCheckText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  name: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8,
  },
  verifiedPill: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    marginBottom: 12,
  },
  verifiedPillText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#15803D',
  },
  unverifiedPill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    marginBottom: 12,
  },
  unverifiedPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#92400E',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
  },
  chip: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#064E3B',
  },
  chipMuted: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  chipMutedText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  memberSince: {
    fontSize: 10.5,
    color: '#94A3B8',
    fontWeight: '600',
    marginTop: 10,
  },
  trustBar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#064E3B',
    borderRadius: 18,
    paddingVertical: 14,
    marginTop: 14,
  },
  trustCell: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  trustDivider: {
    width: 1,
    backgroundColor: 'rgba(190, 242, 100, 0.25)',
  },
  trustEmoji: {
    fontSize: 16,
    marginBottom: 4,
  },
  trustValue: {
    fontSize: 17,
    fontWeight: '900',
    color: '#BEF264',
  },
  trustValueWarn: {
    color: '#FCA5A5',
  },
  trustLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#D1FAE5',
    textAlign: 'center',
    marginTop: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  summaryBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 12,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  summaryLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 2,
    textAlign: 'center',
  },
  actionsBlock: {
    marginTop: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chatBtn: {
    flex: 1.2,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#BEF264',
  },
  callBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#064E3B',
  },
  waBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#064E3B',
  },
  actionBtnDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  contactHint: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#475569',
    lineHeight: 15,
    marginTop: 10,
  },
  reportBtn: {
    marginTop: 12,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#DC2626',
  },
  selfCard: {
    marginTop: 14,
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  selfCardText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#064E3B',
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 20,
    marginBottom: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -5,
  },
  gridCell: {
    width: '50%',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 22,
    alignItems: 'center',
  },
  emptyEmoji: {
    fontSize: 26,
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalBadge: {
    fontSize: 10,
    fontWeight: '900',
    color: '#DC2626',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    letterSpacing: 0.5,
  },
  modalClose: {
    fontSize: 18,
    fontWeight: '700',
    color: '#64748B',
    padding: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 4,
  },
  modalSub: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
    marginBottom: 14,
  },
  modalLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  reasonWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  reasonChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  reasonChipSelected: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  reasonChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  reasonChipTextSelected: {
    color: '#FFFFFF',
  },
  reportInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    padding: 10,
    fontSize: 12,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    textAlignVertical: 'top',
    height: 74,
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  modalSubmitBtn: {
    flex: 2,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubmitText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

export default UserProfileScreen;
