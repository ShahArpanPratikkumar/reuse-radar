// =============================================================================
// REUSE RADAR - WELCOME SCREEN (WelcomeScreen.jsx)
// Purpose: Primary introductory onboarding screen shown before Login or Sign Up.
// Features:
// 1. Animated sequence (spring logo scaling, translateY scene animation, fade-in CTAs).
// 2. Visual storytelling scene illustrating peer-to-peer campus reuse.
// 3. Clear call-to-actions navigating to Login and Register screens.
// =============================================================================

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  StatusBar,
} from 'react-native';

// Get device screen dimensions
const { width, height } = Dimensions.get('window');

const WelcomeScreen = ({ navigation }) => {
  // Mechanism 1: Animation Value References
  // logoScale: springs the brand badge into focus
  const logoScale = useRef(new Animated.Value(0.6)).current;
  // contentOpacity: smoothly fades in the descriptive text
  const contentOpacity = useRef(new Animated.Value(0)).current;
  // illustrationY: slides the circular exchange illustration into position
  const illustrationY = useRef(new Animated.Value(-30)).current;
  // btnOpacity: fades in the action buttons at the end of the sequence
  const btnOpacity = useRef(new Animated.Value(0)).current;

  // Mechanism 2: Choreographed Animation Sequence
  useEffect(() => {
    Animated.sequence([
      // Step 1: Pop logo and slide in illustration simultaneously
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
        Animated.timing(illustrationY, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
      // Step 2: Fade in title and description
      Animated.timing(contentOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      // Step 3: Fade in Login & Sign Up buttons
      Animated.timing(btnOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F0FDF4" />

      {/* Animated Top Brand Logo Badge */}
      <Animated.View style={[styles.topLogoRow, { transform: [{ scale: logoScale }] }]}>
        <View style={styles.miniLogoBox}>
          <Text style={styles.miniLogoLetter}>R</Text>
        </View>
        <Text style={styles.miniLogoText}>ReUse Radar</Text>
      </Animated.View>

      {/* Animated Graphical Scene: Two students sharing items */}
      <Animated.View
        style={[
          styles.illustrationArea,
          { transform: [{ translateY: illustrationY }] },
        ]}
      >
        <View style={styles.illustrationBg} />

        <View style={styles.scene}>
          {/* Left Student: Giving an item */}
          <View style={styles.personLeft}>
            <Text style={styles.personEmoji}>🙋‍♂️</Text>
            <View style={styles.giveTag}>
              <Text style={styles.giveTagText}>Give</Text>
            </View>
          </View>

          {/* Center Graphic: Reusable item and exchange arrows */}
          <View style={styles.exchangeCenter}>
            <Text style={styles.itemEmoji}>📦</Text>
            <View style={styles.arrowsRow}>
              <Text style={styles.arrowLeft}>←</Text>
              <Text style={styles.arrowRight}>→</Text>
            </View>
            <Text style={styles.itemEmoji2}>♻️</Text>
          </View>

          {/* Right Student: Reusing the item */}
          <View style={styles.personRight}>
            <Text style={styles.personEmoji}>🙋‍♀️</Text>
            <View style={styles.getTag}>
              <Text style={styles.getTagText}>Reuse</Text>
            </View>
          </View>
        </View>

        {/* Eco-friendly plant decorations */}
        <View style={styles.decorRow}>
          <Text style={styles.decorEmoji}>🌱</Text>
          <Text style={styles.decorEmoji}>🌿</Text>
          <Text style={styles.decorEmoji}>🪴</Text>
        </View>
      </Animated.View>

      {/* Animated Descriptive Text Content */}
      <Animated.View style={[styles.textBlock, { opacity: contentOpacity }]}>
        <Text style={styles.helloText}>Hello! 👋</Text>
        <Text style={styles.welcomeHeading}>
          Welcome to{'\n'}
          <Text style={styles.welcomeHeadingGreen}>ReUse Radar</Text>
        </Text>
        <Text style={styles.descText}>
          Join our campus community and give your{'\n'}
          unused items a second life instead of{'\n'}
          throwing them away.
        </Text>
        <Text style={styles.ctaSubText}>
          🌍{' '}
          <Text style={styles.ctaSubGreen}>Let's build a greener campus together!</Text>
        </Text>
      </Animated.View>

      {/* Animated Call-to-Action Buttons */}
      <Animated.View style={[styles.btnContainer, { opacity: btnOpacity }]}>
        {/* Primary Action: Login */}
        <TouchableOpacity
          style={styles.loginBtn}
          onPress={() => navigation.navigate('Login')}
          activeOpacity={0.85}
        >
          <Text style={styles.loginBtnText}>Login</Text>
        </TouchableOpacity>

        {/* Secondary Action: Sign up */}
        <TouchableOpacity
          style={styles.signupBtn}
          onPress={() => navigation.navigate('Register')}
          activeOpacity={0.85}
        >
          <Text style={styles.signupBtnText}>Sign up</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

// Layout and visual style definitions
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: 36,
    paddingHorizontal: 24,
  },
  topLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  miniLogoBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-6deg' }],
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  miniLogoLetter: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    transform: [{ rotate: '6deg' }],
  },
  miniLogoText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#064E3B',
    letterSpacing: 0.5,
  },
  illustrationArea: {
    width: width - 48,
    alignItems: 'center',
    marginVertical: 10,
  },
  illustrationBg: {
    position: 'absolute',
    bottom: 10,
    width: width * 0.75,
    height: 100,
    borderRadius: 60,
    backgroundColor: 'rgba(5,150,105,0.08)',
  },
  scene: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 10,
    paddingBottom: 10,
    height: 140,
  },
  personLeft: {
    alignItems: 'center',
  },
  personRight: {
    alignItems: 'center',
  },
  personEmoji: {
    fontSize: 60,
  },
  giveTag: {
    backgroundColor: '#DCFCE7',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  giveTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  getTag: {
    backgroundColor: '#D1FAE5',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#6EE7B7',
  },
  getTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },
  exchangeCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  itemEmoji: {
    fontSize: 28,
  },
  itemEmoji2: {
    fontSize: 28,
  },
  arrowsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  arrowLeft: {
    fontSize: 18,
    color: '#059669',
    fontWeight: '900',
  },
  arrowRight: {
    fontSize: 18,
    color: '#059669',
    fontWeight: '900',
  },
  decorRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
  },
  decorEmoji: {
    fontSize: 24,
  },
  textBlock: {
    alignItems: 'center',
    marginVertical: 10,
  },
  helloText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  welcomeHeading: {
    fontSize: 20,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 10,
  },
  welcomeHeadingGreen: {
    color: '#059669',
    fontWeight: '800',
  },
  descText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  ctaSubText: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 2,
  },
  ctaSubGreen: {
    color: '#059669',
    fontWeight: '700',
  },
  btnContainer: {
    width: '100%',
    gap: 12,
    marginTop: 10,
  },
  loginBtn: {
    width: '100%',
    height: 54,
    backgroundColor: '#059669',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  loginBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  signupBtn: {
    width: '100%',
    height: 54,
    backgroundColor: 'transparent',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#059669',
  },
  signupBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#059669',
    letterSpacing: 0.5,
  },
  guestBtn: {
    marginTop: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  guestBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#059669',
  },
});

export default WelcomeScreen;
