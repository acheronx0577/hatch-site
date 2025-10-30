process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ allowImportingTsExtensions: true });

require('ts-node/register/transpile-only');
require('tsconfig-paths/register');

require('./seed_rules_fixtures.ts');
