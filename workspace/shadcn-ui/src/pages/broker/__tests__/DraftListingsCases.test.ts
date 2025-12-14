import { readFileSync } from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const filePath = path.resolve(__dirname, '..', 'DraftListings.tsx');

describe('DraftListings switch cases', () => {
  it('has no duplicate case labels in the standardName mapper', () => {
    const content = readFileSync(filePath, 'utf8');
    const marker = 'switch (standardName)';
    const start = content.indexOf(marker);
    expect(start).toBeGreaterThan(-1);
    const slice = content.slice(start);
    const openIndex = slice.indexOf('{');
    expect(openIndex).toBeGreaterThan(-1);
    let depth = 0;
    let end = -1;
    for (let i = openIndex; i < slice.length; i++) {
      const ch = slice[i];
      if (ch === '{') depth++;
      if (ch === '}') depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
    expect(end).toBeGreaterThan(openIndex);
    const body = slice.slice(openIndex, end);
    const cases = Array.from(body.matchAll(/case\s+'([^']+)'/g)).map((m) => m[1]);
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const c of cases) {
      if (seen.has(c)) duplicates.add(c);
      seen.add(c);
    }
    expect(Array.from(duplicates)).toEqual([]);
  });
});
