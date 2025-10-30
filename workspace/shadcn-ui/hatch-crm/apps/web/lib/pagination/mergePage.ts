export function mergePage<T extends Record<string, any>>(
  prev: T[],
  next: T[],
  key: keyof T = 'id'
): T[] {
  if (next.length === 0) {
    return prev;
  }

  const merged = [...prev];
  const seen = new Set(prev.map((item) => item[key]));

  for (const item of next) {
    const k = item[key];
    if (!seen.has(k)) {
      seen.add(k);
      merged.push(item);
    }
  }

  return merged;
}
