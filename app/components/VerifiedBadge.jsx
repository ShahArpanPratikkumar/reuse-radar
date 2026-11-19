import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * VerifiedBadge — sleek "Verified Student" checkmark shown next to user names.
 * Renders nothing when the student is not verified.
 */
const VerifiedBadge = ({ verified = false, size = 14, showLabel = false }) => {
  if (!verified) return null;

  const circle = {
    width: size,
    height: size,
    borderRadius: size / 2,
  };

  return (
    <View style={styles.row}>
      <View style={[styles.circle, circle]}>
        <Text style={[styles.check, { fontSize: size * 0.62 }]}>✓</Text>
      </View>
      {showLabel ? <Text style={styles.label}>Verified Student</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  circle: {
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    color: '#FFFFFF',
    fontWeight: '900',
    lineHeight: undefined,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
});

export default VerifiedBadge;
