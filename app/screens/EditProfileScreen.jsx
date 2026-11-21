// =============================================================================
// REUSE RADAR - EDIT PROFILE SCREEN (EditProfileScreen.jsx)
// Purpose: Allows students to edit their user profile, avatar photo, and campus credentials.
// Features:
// 1. Multipart avatar upload via Expo ImagePicker (camera or gallery selection).
// 2. Client-side input validation for phone numbers, name length, and campus limits.
// 3. College enrollment number entry for student identity verification badge.
// 4. Updates profile via AuthContext updateProfile() multipart FormData submission.
// =============================================================================

import React, { useState, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  Modal,
  ActivityIndicator,
  Alert,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';

// AuthContext provides current logged-in user profile and updateProfile handler
import { AuthContext } from '../context/AuthContext';
import { getImageBaseUrl } from '../services/apiConfig';

const IMAGE_BASE_URL = getImageBaseUrl();

// Helper: Resolve static avatar path to full URL
const resolveAvatarUri = (avatar) => {
  if (!avatar || typeof avatar !== 'string') return null;
  if (avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('data:')) {
    return avatar;
  }
  return `${IMAGE_BASE_URL}${avatar.startsWith('/') ? '' : '/'}${avatar}`;
};

const EditProfileScreen = ({ navigation }) => {
  const { user, updateProfile } = useContext(AuthContext);

  // Form input state variables initialized with user profile data
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [collegeName, setCollegeName] = useState(user?.collegeName || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [enrollmentNumber, setEnrollmentNumber] = useState(user?.enrollmentNumber || '');
  const [pickupLandmark, setPickupLandmark] = useState(user?.pickupLandmark || '');

  // Avatar asset and bottom action sheet states
  const [avatarAsset, setAvatarAsset] = useState(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorToast, setErrorToast] = useState('');

  // Mechanism 1: Display temporary error toast banner
  const showError = (message) => {
    setErrorToast(message);
    setTimeout(() => setErrorToast(''), 3500);
  };

  // Mechanism 2: Client-side Form Validation
  const validate = () => {
    const cleanName = name.trim();
    if (cleanName.length < 3) {
      return 'Full name must be at least 3 characters long.';
    }

    const cleanPhone = phone.trim();
    if (!cleanPhone) {
      return 'Please enter your phone number.';
    }
    if (!/^[+0-9()\-\s]+$/.test(cleanPhone)) {
      return 'Phone number can only contain digits, spaces, +, - and ().';
    }
    const digits = cleanPhone.replace(/[^0-9]/g, '');
    if (digits.length < 7 || digits.length > 15) {
      return 'Enter a valid phone number (7 to 15 digits).';
    }

    if (collegeName.trim().length > 80) {
      return 'College name is too long.';
    }

    return null;
  };

  // Mechanism 3: Camera / Gallery Image Picking using Expo ImagePicker
  const handlePickAvatar = async (source) => {
    setPickerVisible(false);
    try {
      // Request device hardware permissions
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permission.status !== 'granted') {
        Alert.alert(
          'Permission Needed',
          source === 'camera'
            ? 'Camera access is required to take your profile photo.'
            : 'Photo library access is required to choose your profile photo.'
        );
        return;
      }

      // Configure image picker options: square crop, high quality
      const options = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      };

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);

      if (!result.canceled && result.assets && result.assets[0]) {
        setAvatarAsset(result.assets[0]);
        setErrorToast('');
      }
    } catch (err) {
      showError(err.message || 'Could not open the image picker.');
    }
  };

  // Helper: Append avatar file asset to multipart FormData
  const appendAvatarToFormData = (formData, asset) => {
    if (!asset) return;
    if (Platform.OS === 'web' && asset.file) {
      formData.append('avatar', asset.file);
      return;
    }
    formData.append('avatar', {
      uri: asset.uri,
      name: asset.fileName || `avatar-${Date.now()}.jpg`,
      type: asset.mimeType || 'image/jpeg',
    });
  };

  // Mechanism 4: Save Profile Changes
  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      showError(validationError);
      return;
    }

    setSaving(true);
    setErrorToast('');

    try {
      const formData = new FormData();
      formData.append('name', name.trim());
      formData.append('phone', phone.trim());
      formData.append('collegeName', collegeName.trim());
      formData.append('department', department.trim());
      formData.append('enrollmentNumber', enrollmentNumber.trim());
      formData.append('pickupLandmark', pickupLandmark.trim());
      appendAvatarToFormData(formData, avatarAsset);

      // Invoke AuthContext updateProfile method to dispatch multipart PUT request
      await updateProfile(formData);
      Alert.alert('Profile Updated', 'Your profile details have been saved.');
      navigation.goBack();
    } catch (err) {
      showError(err.message || 'Could not update your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const previewAvatarUri = avatarAsset?.uri || resolveAvatarUri(user?.avatar);
  const initial = (name.trim() || user?.name || 'R').charAt(0).toUpperCase();

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
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Floating Error Toast Notification */}
      {errorToast ? (
        <View style={styles.toastBox}>
          <Text style={styles.toastText}>{errorToast}</Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Avatar Upload Section */}
          <View style={styles.avatarSection}>
            <TouchableOpacity
              style={styles.avatarWrapper}
              onPress={() => setPickerVisible(true)}
              activeOpacity={0.85}
            >
              {previewAvatarUri ? (
                <Image source={{ uri: previewAvatarUri }} style={styles.avatarImage} resizeMode="cover" />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitial}>{initial}</Text>
                </View>
              )}
              <View style={styles.cameraBadge}>
                <Text style={styles.cameraBadgeIcon}>📷</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setPickerVisible(true)} activeOpacity={0.7}>
              <Text style={styles.changePhotoText}>Change Profile Photo</Text>
            </TouchableOpacity>
            <Text style={styles.avatarHint}>
              Square crop • JPG / PNG / WebP up to 5 MB
            </Text>
          </View>

          {/* Full Name Input */}
          <Text style={styles.inputLabel}>FULL NAME *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Alex Rivera"
            placeholderTextColor="#94A3B8"
            maxLength={60}
            autoCapitalize="words"
          />

          {/* Phone Number Input */}
          <Text style={styles.inputLabel}>PHONE NUMBER *</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="e.g. +91 98765 43210"
            placeholderTextColor="#94A3B8"
            keyboardType="phone-pad"
            maxLength={20}
          />

          {/* College Name Input */}
          <Text style={styles.inputLabel}>COLLEGE / CAMPUS NAME</Text>
          <TextInput
            style={styles.input}
            value={collegeName}
            onChangeText={setCollegeName}
            placeholder="e.g. Ahmedabad University"
            placeholderTextColor="#94A3B8"
            maxLength={80}
          />

          {/* Department / Hostel Input */}
          <Text style={styles.inputLabel}>CAMPUS DEPARTMENT / HOSTEL BLOCK</Text>
          <TextInput
            style={styles.input}
            value={department}
            onChangeText={setDepartment}
            placeholder="e.g. Computer Science • Block C"
            placeholderTextColor="#94A3B8"
            maxLength={80}
          />

          {/* Student ID Verification Card */}
          <View style={styles.verifyCard}>
            <View style={styles.verifyHeaderRow}>
              <View style={styles.verifyIconBox}>
                <Text style={styles.verifyIcon}>🎓</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.verifyTitle}>Student Verification</Text>
                <Text style={styles.verifySubtitle}>
                  Add your enrollment details to unlock the Verified Student badge
                </Text>
              </View>
              <View
                style={[
                  styles.verifyStatusPill,
                  user?.isVerified ? styles.verifyStatusPillOn : styles.verifyStatusPillOff,
                ]}
              >
                <Text
                  style={[
                    styles.verifyStatusText,
                    user?.isVerified ? styles.verifyStatusTextOn : styles.verifyStatusTextOff,
                  ]}
                >
                  {user?.isVerified ? '✓ VERIFIED' : 'NOT VERIFIED'}
                </Text>
              </View>
            </View>

            <Text style={styles.inputLabel}>COLLEGE ENROLLMENT / ROLL NUMBER</Text>
            <TextInput
              style={styles.input}
              value={enrollmentNumber}
              onChangeText={setEnrollmentNumber}
              placeholder="e.g. AU2023CSE0142"
              placeholderTextColor="#94A3B8"
              autoCapitalize="characters"
              maxLength={30}
            />
          </View>

          {/* Preferred Pickup Landmark */}
          <Text style={styles.inputLabel}>PICKUP LANDMARK</Text>
          <TextInput
            style={styles.input}
            value={pickupLandmark}
            onChangeText={setPickupLandmark}
            placeholder="e.g. Near the central library gate"
            placeholderTextColor="#94A3B8"
            maxLength={120}
          />

          {/* Privacy Notice Banner */}
          <View style={styles.noteCard}>
            <Text style={styles.noteIcon}>🛡️</Text>
            <Text style={styles.noteText}>
              Your phone number and pickup landmark are only shared with members you
              approve for a handoff.
            </Text>
          </View>

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#BEF264" size="small" />
            ) : (
              <Text style={styles.saveBtnText}>Save Changes</Text>
            )}
          </TouchableOpacity>

          <View style={{ height: 30 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modal Action Sheet for Selecting Camera or Photo Library */}
      <Modal
        visible={pickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerVisible(false)}
      >
        <View style={styles.sheetOverlay}>
          <View style={styles.sheetCard}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Update Profile Photo</Text>

            <TouchableOpacity
              style={styles.sheetOption}
              onPress={() => handlePickAvatar('camera')}
              activeOpacity={0.8}
            >
              <Text style={styles.sheetOptionIcon}>📸</Text>
              <Text style={styles.sheetOptionText}>Take Photo (Camera)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetOption}
              onPress={() => handlePickAvatar('gallery')}
              activeOpacity={0.8}
            >
              <Text style={styles.sheetOptionIcon}>🖼️</Text>
              <Text style={styles.sheetOptionText}>Choose from Gallery</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetCancel}
              onPress={() => setPickerVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
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
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#064E3B',
  },
  toastBox: {
    position: 'absolute',
    top: 66,
    alignSelf: 'center',
    maxWidth: '90%',
    backgroundColor: '#DC2626',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    zIndex: 99,
  },
  toastText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 18,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 10,
  },
  avatarImage: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 3,
    borderColor: '#059669',
    backgroundColor: '#D1FAE5',
  },
  avatarPlaceholder: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#D1FAE5',
    borderWidth: 3,
    borderColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 40,
    fontWeight: '900',
    color: '#064E3B',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#064E3B',
    borderWidth: 3,
    borderColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadgeIcon: {
    fontSize: 14,
  },
  changePhotoText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#064E3B',
  },
  avatarHint: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 3,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#0F172A',
  },
  verifyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    padding: 14,
    marginTop: 18,
  },
  verifyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  verifyIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyIcon: {
    fontSize: 18,
  },
  verifyTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  verifySubtitle: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  verifyStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  verifyStatusPillOn: {
    backgroundColor: '#DCFCE7',
  },
  verifyStatusPillOff: {
    backgroundColor: '#F1F5F9',
  },
  verifyStatusText: {
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  verifyStatusTextOn: {
    color: '#166534',
  },
  verifyStatusTextOff: {
    color: '#64748B',
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    padding: 12,
    marginTop: 18,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  noteIcon: {
    fontSize: 15,
  },
  noteText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: '#065F46',
    fontWeight: '600',
  },
  saveBtn: {
    height: 52,
    borderRadius: 16,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  saveBtnDisabled: {
    backgroundColor: '#64748B',
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#BEF264',
    letterSpacing: 0.3,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 28,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 14,
    textAlign: 'center',
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F0FDF4',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  sheetOptionIcon: {
    fontSize: 18,
  },
  sheetOptionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#064E3B',
  },
  sheetCancel: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 2,
  },
  sheetCancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
});

export default EditProfileScreen;
