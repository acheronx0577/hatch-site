const { createRequire } = require('node:module');

process.env.TS_NODE_PROJECT = process.env.TS_NODE_PROJECT || 'apps/api/tsconfig.docs.json';
process.env.TS_NODE_PREFER_TS_EXTS = process.env.TS_NODE_PREFER_TS_EXTS || 'true';
if (!process.env.TS_NODE_COMPILER_OPTIONS) {
  process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ allowImportingTsExtensions: true });
}

const requireModule = createRequire(__filename);
requireModule('ts-node/register/transpile-only');
requireModule('tsconfig-paths/register');
