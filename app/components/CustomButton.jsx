import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
} from 'react-native';
import { COLORS } from '../constants/colors';

/**
 * CustomButton — Reusable button component for ReUse Radar
 * @param {string} title - Text displayed on button
 * @param {function} onPress - Callback when tapped
 * @param {'primary' | 'secondary' | 'outline' | 'danger' | 'ghost'} variant - Visual appearance
 * @param {'sm' | 'md' | 'lg'} size - Button height and padding
 * @param {boolean} disabled - Disable interaction
 * @param {boolean} loading - Display loading spinner
 * @param {React.ReactNode} icon - Optional left icon / emoji
 * @param {object} style - Custom container styles
 * @param {object} textStyle - Custom text styles
 */
export const CustomButton = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  style,
  textStyle,
  activeOpacity = 0.8,
}) => {
  const getContainerStyle = () => {
    const list = [styles.baseButton, styles[`size_${size}`]];

    switch (variant) {
      case 'secondary':
        list.push(styles.btnSecondary);
        break;
      case 'outline':
        list.push(styles.btnOutline);
        break;
      case 'danger':
        list.push(styles.btnDanger);
        break;
      case 'ghost':
        list.push(styles.btnGhost);
        break;
      case 'primary':
      default:
        list.push(styles.btnPrimary);
        break;
    }

    if (disabled || loading) {
      list.push(styles.btnDisabled);
    }

    if (style) {
      list.push(style);
    }

    return list;
  };

  const getTextStyle = () => {
    const list = [styles.baseText, styles[`textSize_${size}`]];

    switch (variant) {
      case 'secondary':
        list.push(styles.textSecondary);
        break;
      case 'outline':
        list.push(styles.textOutline);
        break;
      case 'danger':
        list.push(styles.textDanger);
        break;
      case 'ghost':
        list.push(styles.textGhost);
        break;
      case 'primary':
      default:
        list.push(styles.textPrimary);
        break;
    }

    if (disabled) {
      list.push(styles.textDisabled);
    }

    if (textStyle) {
      list.push(textStyle);
    }

    return list;
  };

  const getSpinnerColor = () => {
    if (variant === 'outline' || variant === 'secondary' || variant === 'ghost') {
      return COLORS.primary;
    }
    return '#FFFFFF';
  };

  return (
    <TouchableOpacity
      style={getContainerStyle()}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={activeOpacity}
    >
      {loading ? (
        <ActivityIndicator size="small" color={getSpinnerColor()} />
      ) : (
        <View style={styles.contentRow}>
          {icon ? <View style={styles.iconContainer}>{icon}</View> : null}
          <Text style={getTextStyle()}>{title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  baseButton: {
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    marginRight: 8,
  },

  // Sizes
  size_sm: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  size_md: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
  },
  size_lg: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
  },

  // Variants
  btnPrimary: {
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  btnSecondary: {
    backgroundColor: COLORS.primaryLight,
  },
  btnOutline: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  btnDanger: {
    backgroundColor: COLORS.danger,
  },
  btnGhost: {
    backgroundColor: 'transparent',
  },
  btnDisabled: {
    opacity: 0.55,
    elevation: 0,
    shadowOpacity: 0,
  },

  // Text Base
  baseText: {
    fontWeight: '700',
    textAlign: 'center',
  },
  textSize_sm: {
    fontSize: 13,
  },
  textSize_md: {
    fontSize: 15,
  },
  textSize_lg: {
    fontSize: 16,
  },

  // Text Variants
  textPrimary: {
    color: '#FFFFFF',
  },
  textSecondary: {
    color: COLORS.primaryDark,
  },
  textOutline: {
    color: COLORS.primary,
  },
  textDanger: {
    color: '#FFFFFF',
  },
  textGhost: {
    color: COLORS.primary,
  },
  textDisabled: {
    color: '#94A3B8',
  },
});

export default CustomButton;
