// =============================================================================
// REUSE RADAR - PROFILE SCREEN (ProfileScreen.jsx)
// Purpose: Displays student's personal karma profile, circular impact metrics,
//          award certificate export, and classmate invitation tool.
// Features:
// 1. Live circular impact metrics (Money Saved, CO₂ Diverted, Trees Saved).
// 2. Official Green Campus Award certificate modal with FileSystem local text export & sharing.
// 3. Native device Contacts integration via expo-contacts for SMS invitations.
// 4. Eco reputation levels based on karma points ('Green Seedling' -> 'Planet Champion').
// =============================================================================

import React, { useCallback, useContext, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  StatusBar,
  Platform,
  Modal,
  Share,
  Linking,
  TextInput,
} from 'react-native';
import * as Contacts from 'expo-contacts';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

// AuthContext provides session data, user state, and logout actions
import { AuthContext } from '../context/AuthContext';
import { getImageBaseUrl, resolveImageUri } from '../services/apiConfig';
import { itemService } from '../services/itemService';
import CircularProgress from '../components/CircularProgress';

const IMAGE_BASE_URL = getImageBaseUrl();

// Helper: Converts relative avatar path to full URL
const resolveAvatarUri = (avatar) => {
  if (!avatar || typeof avatar !== 'string') return null;
  if (avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('data:')) {
    return avatar;
  }
  return `${IMAGE_BASE_URL}${avatar.startsWith('/') ? '' : '/'}${avatar}`;
};

// Eco reputation levels driven by accumulated Karma points
const ECO_LEVELS = [
  { min: 0, name: 'Green Seedling' },
  { min: 100, name: 'Eco Guardian' },
  { min: 250, name: 'Eco Champion' },
  { min: 500, name: 'Planet Champion' },
];

// Helper: Calculates current eco badge level and percentage progress toward the next tier
const getEcoLevel = (karmaPoints) => {
  const points = Number(karmaPoints) || 0;
  let index = 0;
  ECO_LEVELS.forEach((level, i) => {
    if (points >= level.min) index = i;
  });

  const current = ECO_LEVELS[index];
  const next = ECO_LEVELS[index + 1] || null;
  const span = next ? next.min - current.min : 1;
  const progress = next
    ? Math.min(Math.max((points - current.min) / span, 0), 1)
    : 1;

  return {
    name: current.name,
    nextName: next ? next.name : null,
    pointsToNext: next ? Math.max(next.min - points, 0) : 0,
    progress,
  };
};

const ProfileScreen = ({ navigation }) => {
  const { user, logout, refreshUser } = useContext(AuthContext);

  // Screen modal states
  const [certificateVisible, setCertificateVisible] = useState(false);
  const [contactsVisible, setContactsVisible] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [contactsError, setContactsError] = useState('');
  const [myItems, setMyItems] = useState([]);
  const [myItemsTab, setMyItemsTab] = useState('all'); // 'all' | 'donation' | 'sell' | 'borrow'

  const loadMyItems = useCallback(async () => {
    try {
      const res = await itemService.getMyItems();
      if (res && res.success) {
        setMyItems(res.items || []);
      }
    } catch (e) {
      // ignore silently
    }
  }, []);

  // Refresh user data whenever user switches to this tab
  useFocusEffect(
    useCallback(() => {
      refreshUser();
      loadMyItems();
    }, [refreshUser, loadMyItems])
  );

  // Derived metrics from user document
  const itemsShared = user?.itemsDonatedCount ?? user?.successfulReuses ?? 0;
  const itemsReceived = user?.itemsClaimedCount ?? user?.completedExchanges ?? 0;
  const karmaPoints = Number(user?.karmaPoints) || 0;
  const favoritesCount =
    user?.favoritesCount ?? (Array.isArray(user?.favorites) ? user.favorites.length : 0);

  // Environmental impact formulas: 2.5 kg CO2 per reuse, 21 kg CO2 absorbed per tree per year
  const impact = user?.impact || {
    totalReused: itemsShared + itemsReceived,
    moneySaved: itemsReceived * 450,
    co2ReducedKg: Number(((itemsShared + itemsReceived) * 2.5).toFixed(1)),
    treesSaved: Number((((itemsShared + itemsReceived) * 2.5) / 21).toFixed(1)),
  };
  const co2SavedKg = Number(impact.co2ReducedKg) || 0;
  const moneySaved = Number(impact.moneySaved) || 0;
  const treesSaved = Number(impact.treesSaved) || 0;
  const isVerified = Boolean(user?.isVerified);
  const certificateDate = new Date().toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Mechanism 1: Share Sustainability Certificate via Native Share Sheet
  const handleShareCertificate = async () => {
    try {
      await Share.share({
        message:
          `🏅 Green Campus Award — ${user?.name || 'ReUse Radar Student'}\n` +
          `${user?.collegeName || 'Campus Community'}\n\n` +
          `I have reused ${impact.totalReused} campus item(s) through ReUse Radar:\n` +
          `• ${co2SavedKg} kg of CO₂ reduced\n` +
          `• ₹${moneySaved} saved\n` +
          `• ${treesSaved} trees' worth of carbon absorbed\n\n` +
          'Join the circular campus movement on ReUse Radar 🌱',
        title: 'My Green Campus Award',
      });
    } catch (e) {
      // User cancelled share
    }
  };

  const certificateText =
    `🏅 Green Campus Award — ${user?.name || 'ReUse Radar Student'}\n` +
    `${user?.collegeName || 'Campus Community'}\n` +
    `Issued ${certificateDate}\n\n` +
    `Items reused: ${impact.totalReused}\n` +
    `CO₂ reduced: ${co2SavedKg} kg\n` +
    `Money saved: ${moneySaved}\n` +
    `Trees saved: ${treesSaved}\n\n` +
    'ReUse Radar • Circular Campus Platform';

  // Mechanism 2: Write Certificate to Local File and Trigger Sharing Dialog
  const handleSaveCertificateFile = async () => {
    const fileName = 'ReUseRadar-Green-Campus-Award.txt';
    try {
      if (Platform.OS === 'web') {
        await Share.share({ message: certificateText, title: 'Green Campus Award' });
        return;
      }

      const available = await Sharing.isAvailableAsync();
      if (!available) {
        await Share.share({ message: certificateText, title: 'Green Campus Award' });
        return;
      }

      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, certificateText, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/plain',
        dialogTitle: 'Save or share your Green Campus Award',
        UTI: 'public.plain-text',
      });
    } catch (e) {
      Alert.alert(
        'Certificate Export Failed',
        e?.message || 'Could not create the certificate file on this device.'
      );
    }
  };

  // Mechanism 3: Read Device Address Book via expo-contacts
  const handleOpenContacts = async () => {
    if (Platform.OS === 'web') {
      Alert.alert(
        'Contacts Available on Mobile',
        'Open ReUse Radar on your phone to pick a classmate from your contacts.'
      );
      return;
    }

    try {
      const permission = await Contacts.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert(
          'Contacts Permission Required',
          'ReUse Radar needs contacts access to invite campus classmates to reuse items.',
          permission.canAskAgain === false
            ? [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open Settings', onPress: () => Linking.openSettings() },
              ]
            : [{ text: 'Cancel', style: 'cancel' }]
        );
        return;
      }

      setContactsVisible(true);
      setContactsLoading(true);
      setContactsError('');
      setContactSearch('');

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
        pageSize: 1000,
      });

      const selectable = (data || [])
        .filter((contact) => contact?.name && contact.phoneNumbers?.length > 0)
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));

      setContacts(selectable);
      if (selectable.length === 0) {
        setContactsError('No contacts with phone numbers were found on this device.');
      }
    } catch (e) {
      setContactsVisible(true);
      setContactsError(e?.message || 'Could not read contacts on this device.');
    } finally {
      setContactsLoading(false);
    }
  };

  // Mechanism 4: Send SMS Invitation to Selected Contact
  const handleInviteContact = async (contact) => {
    const rawNumber = contact?.phoneNumbers?.[0]?.number || '';
    const phone = rawNumber.replace(/[^\d+]/g, '');
    const message =
      `Hey ${contact?.name || 'friend'}! Join me on ReUse Radar — our campus marketplace ` +
      'for free giveaways, borrowing and affordable second-hand items. ' +
      `Sign up with ${user?.collegeName || 'our campus'} and start reusing 🌱`;

    try {
      if (phone) {
        const separator = Platform.OS === 'ios' ? '&' : '?';
        const smsUrl = `sms:${phone}${separator}body=${encodeURIComponent(message)}`;
        const canSms = await Linking.canOpenURL(smsUrl).catch(() => false);
        if (canSms) {
          setContactsVisible(false);
          await Linking.openURL(smsUrl);
          return;
        }
      }

      setContactsVisible(false);
      await Share.share({ message, title: 'Invite to ReUse Radar' });
    } catch (e) {
      Alert.alert('Invite Failed', e?.message || 'Could not open messaging for this contact.');
    }
  };

  // Search filter across device contacts
  const filteredContacts = useMemo(() => {
    const query = contactSearch.trim().toLowerCase();
    if (!query) return contacts;
    return contacts.filter((contact) =>
      String(contact.name || '').toLowerCase().includes(query)
    );
  }, [contacts, contactSearch]);

  const level = getEcoLevel(karmaPoints);
  const avatarUri = resolveAvatarUri(user?.avatar);
  const initial = (user?.name || 'R').charAt(0).toUpperCase();

  // Mechanism 5: Logout confirmation dialog
  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out of ReUse Radar?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          if (logout) await logout();
        },
      },
    ]);
  };

  // Profile navigation actions menu
  const actionItems = [
    {
      key: 'my-items',
      icon: '📦',
      iconBg: '#DCFCE7',
      title: 'My Listed Items & Exchanges',
      subtitle: `${user?.listingsCount ?? 0} listings • manage handoffs`,
      onPress: () => navigation.navigate('MyItems'),
    },
    {
      key: 'favorites',
      icon: '💚',
      iconBg: '#E0F2FE',
      title: 'Saved Items & Watchlist',
      subtitle: `${favoritesCount} saved ${favoritesCount === 1 ? 'item' : 'items'}`,
      onPress: () => navigation.navigate('Favorites'),
    },
    {
      key: 'requests',
      icon: '📬',
      iconBg: '#FEF3C7',
      title: 'My Exchange Requests',
      subtitle: `${user?.pendingRequests ?? 0} pending requests`,
      onPress: () => navigation.navigate('Requests'),
    },
    ...(user?.role === 'admin'
      ? [
          {
            key: 'admin',
            icon: '🛡️',
            iconBg: '#FEE2E2',
            title: 'Admin Moderation Center',
            subtitle: 'Review reported listings and campus safety',
            onPress: () => navigation.navigate('AdminModeration'),
          },
        ]
      : []),
    {
      key: 'invite',
      icon: '👥',
      iconBg: '#EDE9FE',
      title: 'Invite a Campus Friend',
      subtitle: 'Pick a contact and send a ReUse Radar invite',
      onPress: handleOpenContacts,
    },
    {
      key: 'notifications',
      icon: '🔔',
      iconBg: '#F1F5F9',
      title: 'Notification Settings',
      subtitle: 'Pickup alerts and message notifications',
      onPress: () => navigation.navigate('Notifications'),
    },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F0FDF4" />

      {/* Screen Top Bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarTitleRow}>
          <View style={styles.miniLogoBox}>
            <Text style={styles.miniLogoLetter}>R</Text>
          </View>
          <Text style={styles.topBarTitle}>ReUse Radar</Text>
        </View>

        <View style={styles.locationPill}>
          <View style={styles.locationDot} />
          <Text style={styles.locationText} numberOfLines={1}>
            {user?.addressName || 'Campus'}
          </Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Profile Identity Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarRow}>
            <View style={styles.avatarWrapper}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} resizeMode="cover" />
              ) : (
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarInitial}>{initial}</Text>
                </View>
              )}
              {isVerified ? (
                <View style={styles.verifiedCheckBadge}>
                  <Text style={styles.verifiedCheckText}>✓</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.userMeta}>
              <Text style={styles.userName} numberOfLines={1}>
                {user?.name || 'ReUse Radar Member'}
              </Text>
              <Text style={styles.userMetaLine} numberOfLines={1}>
                📞 {user?.phone || 'Add your phone number'}
              </Text>
              <Text style={styles.userMetaLine} numberOfLines={1}>
                🏫 {user?.department || user?.addressName || 'Campus Community'}
              </Text>
            </View>
          </View>

          {/* Campus Student Badge */}
          <View style={styles.campusBadge}>
            <Text style={styles.campusBadgeText} numberOfLines={1}>
              {isVerified ? '🎓 Verified Student' : '🎓 Student'} •{' '}
              {user?.collegeName || 'Campus Community'}
              {user?.enrollmentNumber ? ` • #${user.enrollmentNumber}` : ''}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.editProfileBtn}
            onPress={() => navigation.navigate('EditProfile')}
            activeOpacity={0.85}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="create-outline" size={16} color="#064E3B" />
              <Text style={styles.editProfileBtnText}>Edit Profile</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Circular Impact Dashboard Metrics */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Your Circular Impact</Text>
          <Text style={styles.sectionHint}>Live stats</Text>
        </View>

        <View style={styles.dashboardGrid}>
          <View style={[styles.dashboardCard, styles.dashboardCardGreen]}>
            <Text style={styles.dashboardIcon}>🎁</Text>
            <Text style={styles.dashboardValue}>{itemsShared}</Text>
            <Text style={styles.dashboardLabel}>Items Shared</Text>
            <Text style={styles.dashboardCaption}>Donated to neighbors</Text>
          </View>

          <View style={[styles.dashboardCard, styles.dashboardCardBlue]}>
            <Text style={styles.dashboardIcon}>🤝</Text>
            <Text style={styles.dashboardValue}>{itemsReceived}</Text>
            <Text style={styles.dashboardLabel}>Items Received</Text>
            <Text style={styles.dashboardCaption}>Claimed & reused</Text>
          </View>

          <View style={[styles.dashboardCard, styles.dashboardCardAmber]}>
            <Text style={styles.dashboardIcon}>⭐</Text>
            <Text style={styles.dashboardValue}>{karmaPoints}</Text>
            <Text style={styles.dashboardLabel}>Karma Points</Text>
            <Text style={styles.dashboardCaption}>{level.name}</Text>
          </View>

          <View style={[styles.dashboardCard, styles.dashboardCardLime]}>
            <Text style={styles.dashboardIcon}>🍃</Text>
            <Text style={styles.dashboardValue}>~{Math.round(co2SavedKg)} kg</Text>
            <Text style={styles.dashboardLabel}>CO₂e Diverted</Text>
            <Text style={styles.dashboardCaption}>Estimated emissions saved</Text>
          </View>
        </View>

        {/* Eco Level Progress Bar */}
        <View style={styles.levelCard}>
          <View style={styles.levelTextRow}>
            <Text style={styles.levelName}>🌱 {level.name}</Text>
            <Text style={styles.levelPoints}>
              {karmaPoints} pts{level.nextName ? ` • ${level.pointsToNext} to next` : ' • Max level'}
            </Text>
          </View>
          <View style={styles.levelTrack}>
            <View style={[styles.levelFill, { width: `${Math.round(level.progress * 100)}%` }]} />
          </View>
        </View>

        {/* Green Campus Impact Card with Circular Progress Gauges */}
        <View style={styles.impactCard}>
          <Text style={styles.impactKicker}>GREEN CAMPUS IMPACT</Text>
          <Text style={styles.impactTitle}>Your sustainability footprint</Text>

          <View style={styles.impactGaugesRow}>
            <View style={styles.impactGauge}>
              <CircularProgress
                progress={moneySaved / 5000}
                size={78}
                value={`₹${moneySaved}`}
                label="Saved"
                color="#BEF264"
              />
              <Text style={styles.impactGaugeLabel}>Money Saved</Text>
            </View>

            <View style={styles.impactGauge}>
              <CircularProgress
                progress={co2SavedKg / 50}
                size={78}
                value={`${co2SavedKg}`}
                label="kg CO₂"
                color="#6EE7B7"
              />
              <Text style={styles.impactGaugeLabel}>CO₂ Reduced</Text>
            </View>

            <View style={styles.impactGauge}>
              <CircularProgress
                progress={treesSaved / 5}
                size={78}
                value={`${treesSaved}`}
                label="Trees"
                color="#A7F3D0"
              />
              <Text style={styles.impactGaugeLabel}>Trees Saved</Text>
            </View>
          </View>

          <Text style={styles.impactNote}>
            {impact.totalReused} item{impact.totalReused === 1 ? '' : 's'} kept in circulation •
            ₹450 saved per claimed item • 2.5 kg CO₂e per reuse
          </Text>

          <View style={styles.impactActionsRow}>
            <TouchableOpacity
              style={styles.certificateBtn}
              onPress={() => setCertificateVisible(true)}
              activeOpacity={0.88}
            >
              <Text style={styles.certificateBtnText}>🏅 View Eco Certificate</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.shareCertBtn}
              onPress={handleShareCertificate}
              activeOpacity={0.88}
            >
              <Text style={styles.shareCertBtnText}>↗ Share</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* My Listed Items by Type: Free Giveaway, Sell, Exchange/Borrow */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>My Listings</Text>
          <TouchableOpacity onPress={() => navigation.navigate('MyItems', { initialTab: 'listings' })}>
            <Text style={styles.sectionActionLink}>Manage All →</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.myTabsRow}
        >
          {[
            { key: 'all', label: `All (${myItems.length})` },
            {
              key: 'donation',
              label: `🎁 Free Giveaway (${myItems.filter((i) => (i.listingType || 'donation') === 'donation').length})`,
            },
            {
              key: 'sell',
              label: `💰 Sell (${myItems.filter((i) => i.listingType === 'sell').length})`,
            },
            {
              key: 'borrow',
              label: `🔄 Exchange / Borrow (${myItems.filter((i) => i.listingType === 'borrow').length})`,
            },
          ].map((tab) => {
            const active = myItemsTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.myTabChip, active && styles.myTabChipActive]}
                onPress={() => setMyItemsTab(tab.key)}
                activeOpacity={0.85}
              >
                <Text style={[styles.myTabChipText, active && styles.myTabChipTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {(() => {
          const filtered =
            myItemsTab === 'all'
              ? myItems
              : myItems.filter((i) => (i.listingType || 'donation') === myItemsTab);
          if (filtered.length === 0) {
            return (
              <View style={styles.myItemsEmptyCard}>
                <Text style={styles.myItemsEmptyText}>
                  No items in this section yet.
                </Text>
                <TouchableOpacity
                  style={styles.myItemsAddBtn}
                  onPress={() => navigation.navigate('AddItem')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.myItemsAddBtnText}>+ Add Listing</Text>
                </TouchableOpacity>
              </View>
            );
          }
          return (
            <View style={styles.myItemsList}>
              {filtered.slice(0, 6).map((item) => {
                const imgUri =
                  item.images && item.images.length > 0
                    ? resolveImageUri(item.images[0])
                    : null;
                const typeLabel =
                  item.listingType === 'sell'
                    ? `₹${item.price || 0}`
                    : item.listingType === 'borrow'
                    ? '🔄 Borrow'
                    : '🎁 Free';
                return (
                  <TouchableOpacity
                    key={item._id}
                    style={styles.myItemRowCard}
                    onPress={() => navigation.navigate('ItemDetails', { item })}
                    activeOpacity={0.85}
                  >
                    {imgUri ? (
                      <Image source={{ uri: imgUri }} style={styles.myItemThumb} />
                    ) : (
                      <View style={[styles.myItemThumb, styles.myItemThumbPlaceholder]}>
                        <Text style={{ fontSize: 18 }}>📦</Text>
                      </View>
                    )}
                    <View style={styles.myItemInfo}>
                      <Text style={styles.myItemTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <View style={styles.myItemMetaRow}>
                        <View style={styles.myItemTypePill}>
                          <Text style={styles.myItemTypeText}>{typeLabel}</Text>
                        </View>
                        <Text style={styles.myItemStatus}>
                          • {item.status === 'completed' ? 'Completed' : 'Active'}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.myItemEditBtn}
                      onPress={() => navigation.navigate('AddItem', { itemToEdit: item })}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.myItemEditText}>Edit</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })()}

        {/* Account Activity Menu List */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Your Activity</Text>
        </View>

        <View style={styles.actionList}>
          {actionItems.map((item, index) => (
            <View key={item.key}>
              <TouchableOpacity
                style={styles.actionRow}
                onPress={item.onPress}
                activeOpacity={0.8}
              >
                <View style={[styles.actionIconCircle, { backgroundColor: item.iconBg }]}>
                  <Text style={styles.actionIcon}>{item.icon}</Text>
                </View>
                <View style={styles.actionTextBlock}>
                  <Text style={styles.actionTitle}>{item.title}</Text>
                  <Text style={styles.actionSubtitle} numberOfLines={1}>
                    {item.subtitle}
                  </Text>
                </View>
                <Text style={styles.actionChevron}>›</Text>
              </TouchableOpacity>
              {index < actionItems.length - 1 ? <View style={styles.actionDivider} /> : null}
            </View>
          ))}
        </View>

        {/* Logout Action */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Text style={styles.logoutBtnText}>🚪 Logout of ReUse Radar</Text>
        </TouchableOpacity>

        <Text style={styles.appFooterText}>
          ReUse Radar • Circular Community Platform
        </Text>

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* Official Green Campus Award Certificate Modal */}
      <Modal
        visible={certificateVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setCertificateVisible(false)}
      >
        <View style={styles.certOverlay}>
          <View style={styles.certCard}>
            <View style={styles.certInnerBorder}>
              <Text style={styles.certKicker}>REUSE RADAR • CIRCULAR CAMPUS</Text>
              <Text style={styles.certTitle}>Green Campus Award</Text>
              <View style={styles.certDivider} />
              <Text style={styles.certPresentedTo}>PROUDLY PRESENTED TO</Text>
              <Text style={styles.certName} numberOfLines={1}>
                {user?.name || 'ReUse Radar Student'}
              </Text>
              <Text style={styles.certCollege} numberOfLines={2}>
                {user?.collegeName || 'Campus Community'}
                {user?.department ? ` • ${user.department}` : ''}
              </Text>

              <Text style={styles.certBody}>
                in recognition of outstanding contributions to the campus circular
                economy — diverting reusable items from waste and reducing carbon
                emissions for a greener campus.
              </Text>

              <View style={styles.certStatsRow}>
                <View style={styles.certStatBox}>
                  <Text style={styles.certStatValue}>{co2SavedKg} kg</Text>
                  <Text style={styles.certStatLabel}>CO₂ REDUCED</Text>
                </View>
                <View style={styles.certStatBox}>
                  <Text style={styles.certStatValue}>₹{moneySaved}</Text>
                  <Text style={styles.certStatLabel}>MONEY SAVED</Text>
                </View>
                <View style={styles.certStatBox}>
                  <Text style={styles.certStatValue}>{treesSaved}</Text>
                  <Text style={styles.certStatLabel}>TREES SAVED</Text>
                </View>
              </View>

              <View style={styles.certFooterRow}>
                <View>
                  <Text style={styles.certSeal}>🌱</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.certDate}>{certificateDate}</Text>
                  <Text style={styles.certSignature}>Campus Sustainability Office</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={styles.certShareBtn}
              onPress={handleShareCertificate}
              activeOpacity={0.88}
            >
              <Text style={styles.certShareBtnText}>↗ Share Certificate</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.certSaveBtn}
              onPress={handleSaveCertificateFile}
              activeOpacity={0.88}
            >
              <Text style={styles.certSaveBtnText}>💾 Save Certificate File</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.certCloseBtn}
              onPress={() => setCertificateVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.certCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Classmate Contacts Picker Modal */}
      <Modal
        visible={contactsVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setContactsVisible(false)}
      >
        <View style={styles.contactsOverlay}>
          <View style={styles.contactsCard}>
            <View style={styles.contactsHeaderRow}>
              <Text style={styles.contactsTitle}>Invite a Classmate</Text>
              <TouchableOpacity
                style={styles.contactsCloseBtn}
                onPress={() => setContactsVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.contactsCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.contactsSub}>
              Choose a contact to send a ReUse Radar invitation by SMS or share sheet.
            </Text>

            <TextInput
              style={styles.contactsSearch}
              value={contactSearch}
              onChangeText={setContactSearch}
              placeholder="Search contacts…"
              placeholderTextColor="#94A3B8"
              autoCorrect={false}
            />

            {contactsLoading ? (
              <View style={styles.contactsLoadingBox}>
                <Text style={styles.contactsLoadingText}>Reading contacts…</Text>
              </View>
            ) : contactsError ? (
              <Text style={styles.contactsErrorText}>{contactsError}</Text>
            ) : filteredContacts.length === 0 ? (
              <Text style={styles.contactsErrorText}>No contacts match “{contactSearch}”.</Text>
            ) : (
              <ScrollView style={styles.contactsList} showsVerticalScrollIndicator={false}>
                {filteredContacts.slice(0, 100).map((contact) => {
                  const firstNumber = contact.phoneNumbers?.[0]?.number || '';
                  return (
                    <View key={contact.id || `${contact.name}-${firstNumber}`} style={styles.contactRow}>
                      <View style={styles.contactAvatar}>
                        <Text style={styles.contactAvatarText}>
                          {String(contact.name || '?').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.contactInfo}>
                        <Text style={styles.contactName} numberOfLines={1}>
                          {contact.name}
                        </Text>
                        <Text style={styles.contactPhone} numberOfLines={1}>
                          {firstNumber || 'No number'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.contactInviteBtn}
                        onPress={() => handleInviteContact(contact)}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.contactInviteText}>Invite</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            )}
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
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F4EA',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    gap: 4,
    maxWidth: 150,
  },
  locationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#059669',
  },
  locationText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#064E3B',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 30,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    marginBottom: 16,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: '#059669',
    backgroundColor: '#D1FAE5',
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#D1FAE5',
    borderWidth: 2,
    borderColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 30,
    fontWeight: '900',
    color: '#064E3B',
  },
  verifiedCheckBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  verifiedCheckText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '900',
  },
  userMeta: {
    flex: 1,
  },
  userName: {
    fontSize: 19,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 3,
  },
  userMetaLine: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 1,
  },
  campusBadge: {
    marginTop: 14,
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#86EFAC',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  campusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#065F46',
  },
  editProfileBtn: {
    marginTop: 12,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editProfileBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#BEF264',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionHint: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  dashboardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  dashboardCard: {
    width: '47.5%',
    flexGrow: 1,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
  },
  dashboardCardGreen: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  dashboardCardBlue: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  dashboardCardAmber: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  dashboardCardLime: {
    backgroundColor: '#F7FEE7',
    borderColor: '#D9F99D',
  },
  dashboardIcon: {
    fontSize: 20,
    marginBottom: 6,
  },
  dashboardValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#064E3B',
  },
  dashboardLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  dashboardCaption: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  levelCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 18,
  },
  levelTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  levelName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#064E3B',
  },
  levelPoints: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  levelTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  levelFill: {
    height: '100%',
    backgroundColor: '#059669',
    borderRadius: 4,
  },
  impactCard: {
    backgroundColor: '#064E3B',
    borderRadius: 22,
    padding: 18,
    marginBottom: 18,
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 5,
  },
  impactKicker: {
    fontSize: 9,
    fontWeight: '900',
    color: '#BEF264',
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  impactTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.4,
    marginBottom: 14,
  },
  impactGaugesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  impactGauge: {
    alignItems: 'center',
    flex: 1,
  },
  impactGaugeLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D1FAE5',
    marginTop: 8,
    textAlign: 'center',
  },
  impactNote: {
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: '600',
    color: 'rgba(209, 250, 229, 0.8)',
    marginBottom: 14,
  },
  impactActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  certificateBtn: {
    flex: 1.4,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#BEF264',
    alignItems: 'center',
    justifyContent: 'center',
  },
  certificateBtnText: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#14532D',
  },
  shareCertBtn: {
    flex: 0.7,
    height: 44,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(190, 242, 100, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareCertBtnText: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#BEF264',
  },
  certOverlay: {
    flex: 1,
    backgroundColor: 'rgba(6, 78, 59, 0.72)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  certCard: {
    backgroundColor: '#FFFDF5',
    borderRadius: 22,
    padding: 12,
    borderWidth: 2,
    borderColor: '#065F46',
  },
  certInnerBorder: {
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 20,
    alignItems: 'center',
  },
  certKicker: {
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 1.6,
    color: '#059669',
    marginBottom: 6,
  },
  certTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#064E3B',
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  certDivider: {
    width: 56,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#BEF264',
    marginVertical: 12,
  },
  certPresentedTo: {
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 1.4,
    color: '#94A3B8',
    marginBottom: 4,
  },
  certName: {
    fontSize: 21,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 2,
  },
  certCollege: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#059669',
    textAlign: 'center',
    marginBottom: 12,
  },
  certBody: {
    fontSize: 11,
    lineHeight: 16,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 16,
  },
  certStatsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  certStatBox: {
    flex: 1,
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingVertical: 9,
    alignItems: 'center',
  },
  certStatValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#064E3B',
  },
  certStatLabel: {
    fontSize: 7.5,
    fontWeight: '900',
    letterSpacing: 0.6,
    color: '#059669',
    marginTop: 3,
  },
  certFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    width: '100%',
  },
  certSeal: {
    fontSize: 30,
  },
  certDate: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  certSignature: {
    fontSize: 9,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 2,
  },
  certShareBtn: {
    height: 46,
    borderRadius: 14,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  certShareBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#BEF264',
  },
  certCloseBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 2,
  },
  certCloseBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  certSaveBtn: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  certSaveBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#064E3B',
  },
  contactsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(6, 78, 59, 0.6)',
    justifyContent: 'flex-end',
  },
  contactsCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 24,
    maxHeight: '82%',
  },
  contactsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  contactsTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#0F172A',
  },
  contactsCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactsCloseText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#64748B',
  },
  contactsSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 6,
    marginBottom: 12,
    lineHeight: 17,
  },
  contactsSearch: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 44,
    fontSize: 13,
    color: '#0F172A',
    marginBottom: 10,
  },
  contactsLoadingBox: {
    paddingVertical: 28,
    alignItems: 'center',
  },
  contactsLoadingText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  contactsErrorText: {
    fontSize: 12,
    color: '#B45309',
    fontWeight: '600',
    paddingVertical: 18,
    textAlign: 'center',
  },
  contactsList: {
    maxHeight: 420,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  contactAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactAvatarText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#064E3B',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  contactPhone: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  contactInviteBtn: {
    backgroundColor: '#064E3B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  contactInviteText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#BEF264',
  },
  actionList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
  },
  actionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIcon: {
    fontSize: 18,
  },
  actionTextBlock: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  actionSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  actionChevron: {
    fontSize: 20,
    fontWeight: '600',
    color: '#CBD5E1',
  },
  actionDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  logoutBtn: {
    backgroundColor: '#FEE2E2',
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: 12,
  },
  logoutBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#DC2626',
  },
  appFooterText: {
    textAlign: 'center',
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  sectionActionLink: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
  },
  myTabsRow: {
    gap: 8,
    paddingBottom: 10,
  },
  myTabChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  myTabChipActive: {
    backgroundColor: '#064E3B',
    borderColor: '#064E3B',
  },
  myTabChipText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#475569',
  },
  myTabChipTextActive: {
    color: '#BEF264',
  },
  myItemsEmptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    alignItems: 'center',
    marginBottom: 18,
    gap: 10,
  },
  myItemsEmptyText: {
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '600',
  },
  myItemsAddBtn: {
    backgroundColor: '#064E3B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  myItemsAddBtnText: {
    color: '#BEF264',
    fontSize: 12,
    fontWeight: '800',
  },
  myItemsList: {
    gap: 8,
    marginBottom: 18,
  },
  myItemRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    gap: 10,
  },
  myItemThumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  myItemThumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  myItemInfo: {
    flex: 1,
  },
  myItemTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  myItemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  myItemTypePill: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  myItemTypeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#065F46',
  },
  myItemStatus: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  myItemEditBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  myItemEditText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#064E3B',
  },
});

export default ProfileScreen;
