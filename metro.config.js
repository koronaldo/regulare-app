const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite usa um worker + wa-sqlite (.wasm) para funcionar na web;
// o Metro precisa tratar .wasm como asset para conseguir resolvê-lo.
config.resolver.assetExts.push('wasm');

module.exports = config;
