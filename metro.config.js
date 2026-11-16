// metro.config.js
// This config ensures we use the custom index.js entry point
// and do NOT activate expo-router's file-based routing.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
