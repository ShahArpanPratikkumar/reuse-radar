// =============================================================================
// REUSE RADAR - REGISTER SCREEN (RegisterScreen.jsx)
// Purpose: User onboarding and registration interface for students/community members.
// Features:
// 1. Full registration form: Name, Email, Password, Mobile Number, Campus Name.
// 2. Strict client-side validation (regex for 10-digit Indian phone numbers, min 6 char passwords).
// 3. Invokes AuthContext register() API to create user document in MongoDB.
// 4. Grants initial 50 karma points on registration.
// =============================================================================

import React, { useState, useContext } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  StatusBar,
} from 'react-native';

// Import global authentication context
import { AuthContext } from '../context/AuthContext';
import { COLORS } from '../utils/constants';

const RegisterScreen = ({ navigation }) => {
  // Mechanism 1: Access register function from AuthContext
  const { register } = useContext(AuthContext);

  // Form input state hooks
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [collegeName, setCollegeName] = useState('Ahmedabad Campus Community');

  // UI state hooks for loading and error alerts
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Mechanism 2: Registration Submission & Client-side Validation
  const handleRegister = async () => {
    // Clear previous error notifications
    setErrorMsg('');

    // Rule A: Required fields verification
    if (!name.trim() || !email.trim() || !password.trim()) {
      setErrorMsg('Name, email, and password are required.');
      return;
    }

    // Rule B: Password strength length check
    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    // Rule C: Password confirmation match check
    if (confirmPassword && password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    // Rule D: Valid Indian mobile number check (must start with 6,7,8,9 and have 10 digits)
    if (!phone.trim() || !/^[6-9]\d{9}$/.test(phone.trim())) {
      setErrorMsg('Please enter a valid 10-digit mobile number.');
      return;
    }

    setLoading(true);
    try {
      // Dispatch payload to backend endpoint POST /api/auth/register
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
        phone: phone.trim(),
        collegeName: collegeName.trim(),
      });

      // Architecture Note:
      // When registration succeeds, AuthContext sets token in AsyncStorage and isAuthenticated to true.
      // RootNavigator dynamically transitions to MainNavigator.
    } catch (err) {
      // Display backend error message (e.g. "Email already registered")
      setErrorMsg(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    // Prevent mobile keyboard from obscuring registration form fields
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.keyboardView}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#F0FDF4" />
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        {/* Back navigation button to return to Welcome or Login screen */}
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>

        {/* Community branding header */}
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoLetter}>R</Text>
          </View>
          <Text style={styles.appName}>ReUse Radar</Text>
          <Text style={styles.title}>Join Our Community 🌱</Text>
          <Text style={styles.subtitle}>
            Connect with campus neighbors and discover zero-cost reusable items around you.
          </Text>
        </View>

        {/* Validation or API error alert card */}
        {errorMsg ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {errorMsg}</Text>
          </View>
        ) : null}

        {/* Registration Input Form */}
        <View style={styles.form}>
          {/* Full Name Field */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Full Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Arpan Shah"
              placeholderTextColor="#94A3B8"
              value={name}
              onChangeText={setName}
            />
          </View>

          {/* Student Email Field */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>College / Personal Email *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. arpan@college.edu"
              placeholderTextColor="#94A3B8"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Password Field */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password (min 6 characters) *</Text>
            <TextInput
              style={styles.input}
              placeholder="Create a secure password"
              placeholderTextColor="#94A3B8"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          {/* Password Confirmation Field */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Confirm Password *</Text>
            <TextInput
              style={styles.input}
              placeholder="Re-enter your password"
              placeholderTextColor="#94A3B8"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
            />
          </View>

          {/* Mobile Number Field (digits only sanitization) */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Mobile Number *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 9876543210"
              placeholderTextColor="#94A3B8"
              value={phone}
              onChangeText={(text) => setPhone(text.replace(/[^0-9]/g, ''))} // Filter out non-numeric characters
              keyboardType="phone-pad"
              maxLength={10}
            />
          </View>

          {/* Campus Name Field */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Campus / College Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Ahmedabad University"
              placeholderTextColor="#94A3B8"
              value={collegeName}
              onChangeText={setCollegeName}
            />
          </View>

          {/* Registration Submit Action Button */}
          <TouchableOpacity
            style={[styles.registerBtn, loading && styles.registerBtnDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#BEF264" />
            ) : (
              <Text style={styles.registerBtnText}>Create Free Account</Text>
            )}
          </TouchableOpacity>

          {/* Switch to Login Screen for existing users */}
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.loginLink}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

// Styling definitions matching sustainability aesthetic
const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
    backgroundColor: '#F0FDF4',
  },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 36,
    justifyContent: 'center',
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
    marginBottom: 10,
  },
  backBtnText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#064E3B',
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoBadge: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-6deg' }],
    marginBottom: 8,
  },
  logoLetter: {
    fontSize: 28,
    fontWeight: '900',
    color: '#BEF264',
    transform: [{ rotate: '6deg' }],
  },
  appName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#064E3B',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: '90%',
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 12,
    padding: 10,
    marginBottom: 14,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '600',
  },
  form: {
    width: '100%',
  },
  inputGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 46,
    fontSize: 13,
    color: '#0F172A',
  },
  registerBtn: {
    backgroundColor: '#064E3B',
    borderRadius: 14,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  registerBtnDisabled: {
    opacity: 0.6,
  },
  registerBtnText: {
    color: '#BEF264',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 18,
  },
  footerText: {
    fontSize: 13,
    color: '#64748B',
  },
  loginLink: {
    fontSize: 13,
    fontWeight: '800',
    color: '#059669',
  },
});

export default RegisterScreen;
