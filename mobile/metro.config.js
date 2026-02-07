const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '../src');

const config = getDefaultConfig(projectRoot);

// Watch the shared source directory for changes
config.watchFolders = [sharedRoot];

// Ensure Metro can resolve modules from both the mobile and shared directories
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(projectRoot, '..', 'node_modules'),
];

// Allow importing .js/.jsx files from shared code
config.resolver.sourceExts = [...(config.resolver.sourceExts || []), 'jsx'];

module.exports = withNativeWind(config, { input: './global.css' });
