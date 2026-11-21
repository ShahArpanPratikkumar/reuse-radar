// =============================================================================
// REUSE RADAR - REQUEST ITEM SCREEN (RequestItemScreen.jsx)
// Purpose: Allows students to post campus wishlist requests for items they urgently need.
// Features:
// 1. Posts desired item requests to the Wishlist collection via wishlistService.
// 2. Selectable categories and urgency indicators ('High' vs 'Medium').
// 3. Automated matching system: When a seller/donor lists a matching item,
//    the requester receives an automatic push notification.
// 4. Keyboard-safe layout using SafeAreaView and KeyboardAvoidingView.
// =============================================================================

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Import wishlist service for interacting with /api/wishlist endpoints
import { wishlistService } from '../services/wishlistService';
// Import global category constants
import { CATEGORIES } from '../utils/constants';

// Mechanism 1: Urgency level presets
// High: Needed within 48 hours; Medium: Can wait a week
const URGENCY_OPTIONS = [
  { key: 'High', label: 'High', hint: 'Needed within 48 hrs' },
  { key: 'Medium', label: 'Medium', hint: 'Can wait a week' },
];

const RequestItemScreen = ({ navigation, route }) => {
  // Form input state hooks
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(route.params?.category || 'Books'); // Default to 'Books' or route parameter
  const [urgency, setUrgency] = useState('Medium');
  const [description, setDescription] = useState('');
  // Submission network loading state
  const [submitting, setSubmitting] = useState(false);

  // Mechanism 2: Request Submission Handler
  const handleSubmit = async () => {
    // Validate required title field
    if (!title.trim()) {
      Alert.alert('Missing Field', 'Tell your campus mates what you need.');
      return;
    }
    // Validate required description field
    if (!description.trim()) {
      Alert.alert('Missing Field', 'Add a short note so givers know what will help.');
      return;
    }

    setSubmitting(true);
    try {
      // Send wishlist creation payload to backend
      const res = await wishlistService.createWishlist({
        title: title.trim(),
        category,
        urgency,
        description: description.trim(),
      });

      if (res && res.success) {
        // Show success alert and provide navigation option to Explore request feed
        Alert.alert(
          '📣 Request Posted!',
          'Your campus request is live. We will notify you the moment a matching item is posted.',
          [
            {
              text: 'See Campus Requests',
              onPress: () => navigation.navigate('Explore', { openRequestsFeed: true }),
            },
          ]
        );
        // Reset form inputs after successful submission
        setTitle('');
        setDescription('');
      }
    } catch (err) {
      Alert.alert('Request Failed', err.message || 'Could not post your request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    // SafeAreaView handles device notches and home indicators
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F0FDF4" />

      {/* Screen Header Bar with Back navigation */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerTextBlock}>
          <Text style={styles.headerTitle}>Request an Item</Text>
          <Text style={styles.headerSubtitle}>Post what you urgently need on campus</Text>
        </View>
      </View>

      {/* Keyboard-friendly scrollable container */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Informational Banner explaining the peer-to-peer matching mechanism */}
          <View style={styles.introCard}>
            <Text style={styles.introIcon}>📣</Text>
            <Text style={styles.introText}>
              Your college mates will see this in the Campus Requests feed. If a matching
              item is listed later, you get an instant notification.
            </Text>
          </View>

          {/* Item Title Input */}
          <Text style={styles.inputLabel}>WHAT DO YOU NEED? *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Engineering Mathematics textbook"
            placeholderTextColor="#94A3B8"
            value={title}
            onChangeText={setTitle}
            maxLength={100}
          />

          {/* Horizontal Category Selector Chips */}
          <Text style={styles.inputLabel}>CATEGORY</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
            {CATEGORIES.filter((c) => c !== 'All').map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.chip, category === cat && styles.chipActive]}
                onPress={() => setCategory(cat)}
                activeOpacity={0.8}
              >
                <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Urgency Level Selector */}
          <Text style={styles.inputLabel}>HOW URGENT IS IT?</Text>
          <View style={styles.urgencyRow}>
            {URGENCY_OPTIONS.map((option) => {
              const active = urgency === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.urgencyCard, active && styles.urgencyCardActive]}
                  onPress={() => setUrgency(option.key)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.urgencyTitle, active && styles.urgencyTitleActive]}>
                    {option.key === 'High' ? '🔥 High' : '🕒 Medium'}
                  </Text>
                  <Text style={[styles.urgencyHint, active && styles.urgencyHintActive]}>
                    {option.hint}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Multiline Description & Specific Needs */}
          <Text style={styles.inputLabel}>DESCRIPTION *</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="What exactly do you need, why, and when? Mention size, edition or your hostel block."
            placeholderTextColor="#94A3B8"
            multiline
            numberOfLines={5}
            value={description}
            onChangeText={setDescription}
            maxLength={500}
          />

          {/* Post Submission Button */}
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#BEF264" />
            ) : (
              <Text style={styles.submitBtnText}>📣 Post Campus Request</Text>
            )}
          </TouchableOpacity>

          <View style={{ height: 30 }} />
        </ScrollView>
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
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
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
    fontSize: 17,
    fontWeight: '800',
    color: '#064E3B',
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  introCard: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#ECFDF5',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    padding: 14,
    marginBottom: 6,
  },
  introIcon: {
    fontSize: 18,
  },
  introText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 17,
    fontWeight: '600',
    color: '#065F46',
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
    marginTop: 16,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
    color: '#0F172A',
  },
  textArea: {
    height: 110,
    textAlignVertical: 'top',
  },
  chipScroll: {
    flexDirection: 'row',
  },
  chip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: '#064E3B',
    borderColor: '#064E3B',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  urgencyRow: {
    flexDirection: 'row',
    gap: 10,
  },
  urgencyCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 12,
  },
  urgencyCardActive: {
    backgroundColor: '#064E3B',
    borderColor: '#064E3B',
  },
  urgencyTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  urgencyTitleActive: {
    color: '#BEF264',
  },
  urgencyHint: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 3,
  },
  urgencyHintActive: {
    color: '#D1FAE5',
  },
  submitBtn: {
    height: 52,
    borderRadius: 16,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#BEF264',
    letterSpacing: 0.3,
  },
});

export default RequestItemScreen;
