'use client';

import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api/api';

import type { AgentPerformanceData, PerformanceRange, PipelineStage } from './performanceTypes';

type PerformanceResponse = Omit<AgentPerformanceData, 'pipeline' | 'ranking'>;
type PipelineResponse = { pipeline: PipelineStage[] };
type RankingResponse = { ranking: AgentPerformanceData['ranking'] };

const EMPTY_RANKING: AgentPerformanceData['ranking'] = {
  rank: 0,
  totalAgents: 0,
  percentile: 0,
};

export function useAgentPerformance(agentId: string | undefined, range: PerformanceRange) {
  const [data, setData] = useState<AgentPerformanceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(
    async (signal?: AbortSignal) => {
      if (!agentId) {
        setData(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const performancePromise = apiFetch<PerformanceResponse>(`agents/${agentId}/performance?range=${range}`, {
          signal,
        });
        const pipelinePromise = apiFetch<PipelineResponse>(`agents/${agentId}/pipeline`, { signal });
        const rankingPromise = apiFetch<RankingResponse>(`agents/${agentId}/ranking?range=${range}`, { signal });

        const [performance, pipeline, ranking] = await Promise.all([
          performancePromise,
          pipelinePromise,
          rankingPromise,
        ]);

        setData({
          ...performance,
          pipeline: pipeline?.pipeline ?? [],
          ranking: ranking?.ranking ?? EMPTY_RANKING,
        });
      } catch (err) {
        if ((signal as AbortSignal | undefined)?.aborted) {
          return;
        }
        console.error('Failed to load agent performance analytics', err);
        setError(err instanceof Error ? err.message : 'Unable to load performance analytics right now.');
      } finally {
        if (!(signal as AbortSignal | undefined)?.aborted) {
          setLoading(false);
        }
      }
    },
    [agentId, range]
  );

  useEffect(() => {
    if (!agentId) {
      setData(null);
      return;
    }
    const controller = new AbortController();
    void fetchAll(controller.signal);
    return () => controller.abort();
  }, [agentId, fetchAll]);

  return { data, loading, error, refetch: fetchAll };
}

