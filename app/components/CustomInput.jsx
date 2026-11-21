import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { COLORS } from '../constants/colors';

/**
 * CustomInput — Reusable text input component for ReUse Radar
 * @param {string} label - Input label above text box
 * @param {string} placeholder - Placeholder text
 * @param {string} value - Current text value
 * @param {function} onChangeText - Value update callback
 * @param {boolean} secureTextEntry - Obscure password text
 * @param {string} error - Error message displayed below input
 * @param {string | React.ReactNode} icon - Left icon / emoji
 * @param {string} keyboardType - Keyboard type (email-address, numeric, etc.)
 * @param {string} autoCapitalize - Auto capitalize mode
 * @param {boolean} multiline - Multi-line text input
 * @param {number} numberOfLines - Initial number of lines
 * @param {object} containerStyle - Outer container style
 * @param {object} inputStyle - Input element style
 */
export const CustomInput = ({
  label,
  placeholder,
  value,
  onChangeText,
  secureTextEntry = false,
  error,
  icon,
  keyboardType = 'default',
  autoCapitalize = 'none',
  multiline = false,
  numberOfLines = 1,
  containerStyle,
  inputStyle,
  editable = true,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isPassword = secureTextEntry;

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View
        style={[
          styles.inputContainer,
          multiline && styles.multilineContainer,
          isFocused && styles.inputFocused,
          error && styles.inputError,
          !editable && styles.inputDisabled,
        ]}
      >
        {icon ? (
          <View style={styles.iconBox}>
            {typeof icon === 'string' ? (
              <Text style={styles.iconText}>{icon}</Text>
            ) : (
              icon
            )}
          </View>
        ) : null}

        <TextInput
          style={[
            styles.input,
            multiline && styles.multilineInput,
            inputStyle,
          ]}
          placeholder={placeholder}
          placeholderTextColor="#94A3B8"
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={isPassword && !showPassword}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          multiline={multiline}
          numberOfLines={numberOfLines}
          editable={editable}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />

        {isPassword ? (
          <TouchableOpacity
            style={styles.eyeBtn}
            onPress={() => setShowPassword(!showPassword)}
            activeOpacity={0.7}
          >
            <Text style={styles.eyeText}>{showPassword ? '👁️' : '🔒'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
    width: '100%',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  multilineContainer: {
    alignItems: 'flex-start',
    paddingVertical: 10,
    minHeight: 100,
  },
  inputFocused: {
    borderColor: COLORS.primary,
    backgroundColor: '#FAFCF8',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  inputError: {
    borderColor: COLORS.error,
  },
  inputDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  iconBox: {
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 18,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: COLORS.textPrimary,
    paddingVertical: 12,
  },
  multilineInput: {
    textAlignVertical: 'top',
    minHeight: 80,
    paddingTop: 4,
  },
  eyeBtn: {
    padding: 6,
    marginLeft: 6,
  },
  eyeText: {
    fontSize: 18,
  },
  errorText: {
    fontSize: 12,
    color: COLORS.error,
    marginTop: 4,
    marginLeft: 4,
  },
});

export default CustomInput;
