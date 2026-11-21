import React from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { COLORS } from '../utils/constants';

const SearchBar = ({
  value,
  onChangeText,
  placeholder = 'Search books, cycles, electronics...',
  onClear,
  onSubmitEditing,
}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.searchIcon}>🔍</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textMuted}
        returnKeyType="search"
        onSubmitEditing={onSubmitEditing}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {value ? (
        <TouchableOpacity style={styles.clearButton} onPress={onClear} activeOpacity={0.7}>
          <Text style={styles.clearButtonText}>✕</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    height: 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: COLORS.textPrimary,
    paddingVertical: 8,
  },
  clearButton: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: COLORS.borderLight,
  },
  clearButtonText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: 'bold',
  },
});

export default SearchBar;
