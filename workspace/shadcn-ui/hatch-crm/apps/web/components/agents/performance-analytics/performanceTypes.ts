export interface MonthlyPerformance {
  month: string;
  closings: number;
  volume: number;
  avgPrice: number;
  brokerageAvg: number;
  listings: number;
}

export interface WeeklyActivity {
  week: string;
  showings: number;
  openHouses: number;
  offers: number;
}

export interface PipelineStage {
  stage: string;
  count: number;
  value: number;
}

export interface AgentPerformanceData {
  agentId: string;
  agentName: string;
  brokerageName: string;
  monthlyPerformance: MonthlyPerformance[];
  weeklyActivity: WeeklyActivity[];
  pipeline: PipelineStage[];
  ranking: {
    rank: number;
    totalAgents: number;
    percentile: number;
  };
}

export type PerformanceRange = 'mtd' | 'qtd' | 'ytd';

