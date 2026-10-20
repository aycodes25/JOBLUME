// Expo's default config detects the npm workspace root, watches it and resolves hoisted packages (SDK 52+).
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
