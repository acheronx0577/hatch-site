import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const HTTP_METHOD_DECORATORS = ['Get', 'Post', 'Patch', 'Put', 'Delete'];

function normalisePath(base: string, subPath: string | undefined): string {
  const basePath = base ?? '';
  const child = subPath ?? '';
  const combined = `${basePath}/${child}`.replace(/\/{2,}/g, '/');
  return combined.startsWith('/') ? combined : `/${combined}`;
}

function stripQuotes(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/^['"`]/, '').replace(/['"`]$/, '');
}

function extractRoutes(source: string): string[] {
  const routes: string[] = [];
  const lines = source.split('\n');
  let currentBasePath = '';

  for (const line of lines) {
    const controllerMatch = line.match(/@Controller\(([^)]*)\)/);
    if (controllerMatch) {
      const [, raw] = controllerMatch;
      currentBasePath = stripQuotes(raw?.split(',')[0]?.trim() ?? '');
      continue;
    }

    for (const decorator of HTTP_METHOD_DECORATORS) {
      const regex = new RegExp(`@${decorator}\\(([^)]*)\\)`);
      const match = line.match(regex);
      if (match) {
        const [, rawPath] = match;
        const finalPath = normalisePath(currentBasePath, stripQuotes(rawPath?.split(',')[0]?.trim()));
        routes.push(`${decorator.toUpperCase()} ${finalPath}`);
        break;
      }
    }
  }

  return routes;
}

function main() {
  const repoRoot = join(__dirname, '..');
  const fileListRaw = execSync('git ls-files "apps/**/*.ts" "packages/**/*.ts"', {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: '/bin/bash'
  });

  const files = fileListRaw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const routes = new Set<string>();

  for (const file of files) {
    if (!file.endsWith('.controller.ts')) continue;
    const contents = readFileSync(join(repoRoot, file), 'utf8');
    extractRoutes(contents).forEach((route) => routes.add(route));
  }

  const sorted = Array.from(routes).sort();
  const outputLines = [
    '# API_INVENTORY',
    `Generated: ${new Date().toISOString()}`,
    '```',
    ...sorted,
    '```'
  ];

  const outputPath = join(repoRoot, 'docs', 'API_INVENTORY.md');
  writeFileSync(outputPath, outputLines.join('\n'));
  // eslint-disable-next-line no-console
  console.log(`Wrote ${outputPath}`);
}

main();
