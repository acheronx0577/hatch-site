export const missionControlOverviewQueryKey = (orgId: string) => ['mission-control', 'overview', orgId] as const;

export const missionControlAgentsQueryKey = (orgId: string) => ['mission-control', 'agents', orgId] as const;

export const missionControlComplianceQueryKey = (orgId: string) => ['mission-control', 'compliance', orgId] as const;

export const missionControlActivityQueryKey = (orgId: string) => ['mission-control', 'activity', orgId] as const;

export const brokerPropertiesQueryKey = (orgId: string) => ['broker', 'properties', orgId] as const;

export const pipelineBoardColumnsQueryKey = (tenantId: string, pipelineId?: string | null) =>
  ['pipeline-board', 'columns', tenantId, pipelineId ?? 'none'] as const;

