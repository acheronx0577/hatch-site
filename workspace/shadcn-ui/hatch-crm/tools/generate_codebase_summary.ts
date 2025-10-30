import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

function main() {
  const repoRoot = join(__dirname, '..');
  const treeRaw = execSync('git ls-files', {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  const files = treeRaw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const byExtension = new Map<string, number>();
  const topLevel = new Set<string>();

  for (const file of files) {
    const segments = file.split('/');
    if (segments.length > 0) {
      topLevel.add(segments[0]);
    }

    const last = segments[segments.length - 1] ?? '';
    const ext = last.includes('.') ? last.split('.').pop() ?? '' : '';
    const key = ext.length ? `.${ext}` : '(no extension)';
    byExtension.set(key, (byExtension.get(key) ?? 0) + 1);
  }

  const summaryLines = [
    '# CODEBASE_SUMMARY',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## File counts by extension',
    ...Array.from(byExtension.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([ext, count]) => `- ${ext}: ${count}`),
    '',
    '## Top-level paths',
    ...Array.from(topLevel)
      .sort()
      .map((dir) => `- ${dir}/`)
  ];

  const outputPath = join(repoRoot, 'docs', 'CODEBASE_SUMMARY.md');
  writeFileSync(outputPath, summaryLines.join('\n'));
  // eslint-disable-next-line no-console
  console.log(`Wrote ${outputPath}`);
}

main();
