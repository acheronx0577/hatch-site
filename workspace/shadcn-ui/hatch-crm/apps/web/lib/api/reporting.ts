import { apiFetch } from './api';

export interface MetricsPoint {
  date: string;
  valueNum: number | null;
  valueJson: Record<string, unknown> | null;
}

const buildQuery = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
};

export async function getMetricsSeries(
  key: string,
  params: { from?: string; to?: string } = {}
): Promise<MetricsPoint[]> {
  const query = buildQuery({ key, ...params, granularity: 'daily' });
  return apiFetch<MetricsPoint[]>(`reporting/metrics${query}`);
}

export async function recomputeMetrics(
  keys?: string[],
  params: { from?: string; to?: string } = {}
): Promise<void> {
  await apiFetch('reporting/recompute', {
    method: 'POST',
    body: JSON.stringify({
      ...(keys && keys.length > 0 ? { keys } : {}),
      ...params
    })
  });
}
