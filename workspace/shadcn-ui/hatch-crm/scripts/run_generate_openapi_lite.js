process.env.TS_NODE_PROJECT = process.env.TS_NODE_PROJECT || 'tsconfig.docs.json';
process.env.TS_NODE_PREFER_TS_EXTS = process.env.TS_NODE_PREFER_TS_EXTS || '1';
if (!process.env.TS_NODE_COMPILER_OPTIONS) {
  process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ allowImportingTsExtensions: true });
}

require('ts-node/register/transpile-only');
require('tsconfig-paths/register');

const path = require('node:path');
const Module = require('module');
const nodePath = [path.resolve(__dirname, '../apps/api/node_modules'), process.env.NODE_PATH]
  .filter(Boolean)
  .join(path.delimiter);
process.env.NODE_PATH = nodePath;
Module._initPaths();

process.chdir(path.resolve(__dirname, '..'));

require(path.resolve(__dirname, 'generate-openapi-lite.ts'));
