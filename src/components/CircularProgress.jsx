import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const SEGMENTS = 24;

/**
 * CircularProgress — dependency-free circular gauge built from tick segments.
 * Used by the Green Impact Card to visualise each sustainability metric.
 */
const CircularProgress = ({
  progress = 0,
  size = 78,
  color = '#BEF264',
  trackColor = 'rgba(255, 255, 255, 0.16)',
  value,
  label,
}) => {
  const clamped = Math.min(Math.max(Number(progress) || 0, 0), 1);
  const filled = Math.round(clamped * SEGMENTS);
  const tickWidth = Math.max(2, Math.round(size * 0.055));
  const tickHeight = Math.max(5, Math.round(size * 0.1));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {Array.from({ length: SEGMENTS }).map((_, index) => (
        <View
          key={`seg-${index}`}
          pointerEvents="none"
          style={[
            styles.segmentLayer,
            {
              width: size,
              height: size,
              transform: [{ rotate: `${(index * 360) / SEGMENTS}deg` }],
            },
          ]}
        >
          <View
            style={{
              width: tickWidth,
              height: tickHeight,
              borderRadius: tickWidth,
              backgroundColor: index < filled ? color : trackColor,
              marginTop: Math.round(size * 0.02),
            }}
          />
        </View>
      ))}

      <View style={styles.center}>
        <Text style={[styles.value, { color: color, fontSize: Math.round(size * 0.24) }]}>
          {value}
        </Text>
        {label ? <Text style={styles.label}>{label}</Text> : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  segmentLayer: {
    position: 'absolute',
    alignItems: 'center',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  value: {
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  label: {
    fontSize: 8,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.72)',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: 1,
  },
});

export default CircularProgress;
