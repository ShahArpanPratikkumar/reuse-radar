// =============================================================================
// REUSE RADAR - SPLASH SCREEN (SplashScreen.jsx)
// Purpose: Displayed while the application restores the user session from AsyncStorage.
// Features:
// 1. Pure presentation component with zero manual navigation side-effects.
// 2. Animated intro sequence (bouncing badge, fade-in tagline, sliding illustration).
// 3. Routing is controlled upstream by RootNavigator checking AuthContext.isLoading.
// =============================================================================

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  StatusBar,
} from 'react-native';

const { width, height } = Dimensions.get('window');

const SplashScreen = () => {
  // Mechanism 1: Animated Values for orchestrated startup transition
  const logoScale = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const illustrationY = useRef(new Animated.Value(60)).current;
  const illustrationOpacity = useRef(new Animated.Value(0)).current;

  // Mechanism 2: Sequential Animation Trigger
  useEffect(() => {
    Animated.sequence([
      // Step A: Logo badge pops in with spring tension
      Animated.spring(logoScale, {
        toValue: 1,
        tension: 60,
        friction: 7,
        useNativeDriver: true,
      }),
      // Step B: App title and branding text fade into visibility
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      // Step C: Sustainability illustration slides upward smoothly
      Animated.parallel([
        Animated.timing(illustrationY, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(illustrationOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#B7EFCD" />

      {/* Decorative semi-transparent background ambient circles */}
      <View style={styles.circleTopRight} />
      <View style={styles.circleBottomLeft} />

      {/* Top Branding Section: Animated Logo + Name */}
      <View style={styles.topSection}>
        <Animated.View style={[styles.logoBadge, { transform: [{ scale: logoScale }] }]}>
          <View style={styles.logoInner}>
            <Text style={styles.logoLetter}>R</Text>
          </View>
          <View style={styles.leafAccent}>
            <Text style={styles.leafEmoji}>🌿</Text>
          </View>
        </Animated.View>

        <Animated.View style={{ opacity: textOpacity }}>
          <Text style={styles.appName}>ReUse</Text>
          <Text style={styles.appNameBold}>Radar</Text>
          <Text style={styles.tagline}>Find • Reuse • Share</Text>
        </Animated.View>
      </View>

      {/* Center Illustration: Earth caretaker with circulating items */}
      <Animated.View
        style={[
          styles.illustrationContainer,
          {
            opacity: illustrationOpacity,
            transform: [{ translateY: illustrationY }],
          },
        ]}
      >
        <View style={styles.sceneWrapper}>
          <View style={styles.groundCircle} />

          <View style={styles.plantLeft}>
            <Text style={styles.plantEmoji}>🌱</Text>
          </View>

          <View style={styles.characterGroup}>
            <View style={styles.earthBubble}>
              <Text style={styles.earthEmoji}>🌍</Text>
              <View style={styles.heartBubble}>
                <Text style={styles.heartEmoji}>♻️</Text>
              </View>
            </View>
            <Text style={styles.characterEmoji}>🧑‍🌾</Text>
          </View>

          <View style={styles.plantRight}>
            <Text style={styles.plantEmoji}>🌿</Text>
          </View>

          {/* Floating Category Icons representing campus exchange items */}
          <View style={styles.floatBadge1}>
            <Text style={styles.floatBadgeText}>📚</Text>
          </View>
          <View style={styles.floatBadge2}>
            <Text style={styles.floatBadgeText}>👕</Text>
          </View>
          <View style={styles.floatBadge3}>
            <Text style={styles.floatBadgeText}>💡</Text>
          </View>
        </View>
      </Animated.View>

      {/* Bottom pagination / loading indicator dots */}
      <View style={styles.dotsRow}>
        <View style={[styles.dot, styles.dotActive]} />
        <View style={styles.dot} />
        <View style={styles.dot} />
      </View>
    </View>
  );
};

// Styling definitions for Splash Screen
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#B7EFCD', // Soft pastel mint green
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 40,
    overflow: 'hidden',
  },
  circleTopRight: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  circleBottomLeft: {
    position: 'absolute',
    bottom: -80,
    left: -80,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  topSection: {
    alignItems: 'center',
    gap: 10,
  },
  logoBadge: {
    width: 90,
    height: 90,
    marginBottom: 16,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoInner: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 10,
    transform: [{ rotate: '-6deg' }],
  },
  logoLetter: {
    fontSize: 44,
    fontWeight: '900',
    color: '#FFFFFF',
    transform: [{ rotate: '6deg' }],
    letterSpacing: -2,
  },
  leafAccent: {
    position: 'absolute',
    top: -6,
    right: -6,
  },
  leafEmoji: {
    fontSize: 20,
  },
  appName: {
    fontSize: 36,
    fontWeight: '300',
    color: '#064E3B',
    textAlign: 'center',
    letterSpacing: 2,
    lineHeight: 40,
  },
  appNameBold: {
    fontSize: 42,
    fontWeight: '900',
    color: '#064E3B',
    textAlign: 'center',
    letterSpacing: 1,
    marginTop: -6,
    lineHeight: 46,
  },
  tagline: {
    fontSize: 13,
    color: '#065F46',
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '500',
    letterSpacing: 0.3,
    fontStyle: 'italic',
  },
  illustrationContainer: {
    width: width,
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  sceneWrapper: {
    width: width * 0.85,
    height: 220,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  groundCircle: {
    position: 'absolute',
    bottom: 0,
    width: 260,
    height: 90,
    borderRadius: 130,
    backgroundColor: 'rgba(5,150,105,0.15)',
  },
  characterGroup: {
    alignItems: 'center',
    marginBottom: 10,
  },
  earthBubble: {
    position: 'relative',
    marginBottom: -10,
  },
  earthEmoji: {
    fontSize: 70,
  },
  heartBubble: {
    position: 'absolute',
    top: -8,
    right: -12,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  heartEmoji: {
    fontSize: 18,
  },
  characterEmoji: {
    fontSize: 72,
  },
  plantLeft: {
    position: 'absolute',
    left: 10,
    bottom: 20,
  },
  plantRight: {
    position: 'absolute',
    right: 10,
    bottom: 20,
  },
  plantEmoji: {
    fontSize: 40,
  },
  floatBadge1: {
    position: 'absolute',
    top: 20,
    left: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  floatBadge2: {
    position: 'absolute',
    top: 10,
    right: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  floatBadge3: {
    position: 'absolute',
    top: 70,
    right: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  floatBadgeText: {
    fontSize: 20,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(6,78,59,0.25)',
  },
  dotActive: {
    width: 24,
    backgroundColor: '#059669',
    borderRadius: 4,
  },
});

export default SplashScreen;
