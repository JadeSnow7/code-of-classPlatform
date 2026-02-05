const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

// Expo web static export (npx expo export --platform web) defaults to serving assets from "/assets".
// When deploying under a subpath (e.g. https://example.com/wecom/app/), override Metro's publicPath
// so generated asset URIs are prefixed correctly (e.g. "/wecom/app/assets/...").
const webBasePath = (process.env.EXPO_PUBLIC_WEB_BASE_PATH || '').trim();
if (webBasePath && webBasePath !== '/') {
    const normalizedBasePath = '/' + webBasePath.replace(/^\/+/, '').replace(/\/+$/, '');
    config.transformer = config.transformer || {};
    config.transformer.publicPath = `${normalizedBasePath}/assets`;
}

module.exports = config;
