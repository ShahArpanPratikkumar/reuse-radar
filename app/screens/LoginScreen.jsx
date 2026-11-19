// =============================================================================
// REUSE RADAR - LOGIN SCREEN (LoginScreen.jsx)
// Purpose: Secure user authentication interface for existing community members.
// Features:
// 1. JWT Authentication via AuthContext (login method).
// 2. Dynamic error handling and session expiration alerts.
// 3. Auto-redirect upon authentication via RootNavigator state.
// 4. Keyboard-avoiding behavior tailored for iOS and Android form interaction.
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

// Import global authentication context to consume login actions & session states
import { AuthContext } from '../context/AuthContext';
// Import design system color palette
import { COLORS } from '../utils/constants';

const LoginScreen = ({ navigation }) => {
  // Mechanism 1: AuthContext Consumption
  // Access global login function and session flash messages (e.g. "Session expired, please login")
  const { login, sessionMessage, clearSessionMessage } = useContext(AuthContext);

  // Component state variables for email and password input fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Loading spinner state during async API authentication network request
  const [loading, setLoading] = useState(false);
  // User-facing validation or server error message display
  const [errorMsg, setErrorMsg] = useState('');

  // Mechanism 2: Login Submission Handler
  // Validates inputs, makes API request via AuthContext, and handles errors
  const handleLogin = async () => {
    // Reset previous error messages before initiating fresh attempt
    setErrorMsg('');

    // Client-side validation: ensure credentials are not empty strings or whitespace
    if (!email.trim() || !password.trim()) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      // Delegate authentication to AuthContext which talks to /api/auth/login
      // Saves JWT token & user profile in AsyncStorage
      await login(email.trim(), password);

      // Clear any session-expired warning messages once logged in
      clearSessionMessage?.();

      // Architecture Note:
      // When login succeeds, AuthContext sets 'isAuthenticated' state to true.
      // RootNavigator dynamically reacts and switches stack from AuthNavigator to MainNavigator.
      // No manual navigation.navigate('Home') call is required here.
    } catch (err) {
      // Display human-readable error returned from backend (e.g. "Invalid email or password")
      setErrorMsg(err.message || 'Login failed. Please check your credentials.');
    } finally {
      // Stop activity indicator whether request succeeded or failed
      setLoading(false);
    }
  };

  return (
    // KeyboardAvoidingView prevents the on-screen soft keyboard from covering form fields
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.keyboardView}
    >
      {/* Set status bar style to match the light green background theme */}
      <StatusBar barStyle="dark-content" backgroundColor="#F0FDF4" />

      {/* ScrollView allows viewing the entire form when small screens open the keyboard */}
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        {/* Top Back Navigation Button */}
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>

        {/* Brand Header: Logo, App Name, and Welcome Title */}
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoLetter}>R</Text>
          </View>
          <Text style={styles.appName}>ReUse Radar</Text>
          <Text style={styles.title}>Welcome Back 👋</Text>
          <Text style={styles.subtitle}>
            Sign in to discover zero-cost items and share circular resources with campus neighbors.
          </Text>
        </View>

        {/* Error or Session Alert Box */}
        {errorMsg || sessionMessage ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {errorMsg || sessionMessage}</Text>
          </View>
        ) : null}

        {/* Authentication Form Inputs */}
        <View style={styles.form}>
          {/* Email Input Field */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>College / Personal Email</Text>
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

          {/* Password Input Field with secureTextEntry for confidentiality */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor="#94A3B8"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          {/* Submit Action Button */}
          <TouchableOpacity
            style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#BEF264" />
            ) : (
              <Text style={styles.loginBtnText}>Sign In to Radar</Text>
            )}
          </TouchableOpacity>

          {/* Link to Registration Screen for New Users */}
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>New to ReUse Radar? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.signupLink}>Create Account</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

// UI Stylesheet definitions using theme constants
const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
    backgroundColor: '#F0FDF4', // Light mint eco-friendly background
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  backBtn: {
    position: 'absolute',
    top: 50,
    left: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    zIndex: 10,
  },
  backBtnText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#064E3B',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 40,
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-6deg' }],
    marginBottom: 12,
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  logoLetter: {
    fontSize: 34,
    fontWeight: '900',
    color: '#BEF264',
    transform: [{ rotate: '6deg' }],
  },
  appName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#064E3B',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
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
    marginBottom: 16,
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
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 13,
    color: '#0F172A',
  },
  loginBtn: {
    backgroundColor: '#064E3B',
    borderRadius: 16,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  loginBtnDisabled: {
    opacity: 0.6,
  },
  loginBtnText: {
    color: '#BEF264',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  footerText: {
    fontSize: 13,
    color: '#64748B',
  },
  signupLink: {
    fontSize: 13,
    fontWeight: '800',
    color: '#059669',
  },
});

export default LoginScreen;
