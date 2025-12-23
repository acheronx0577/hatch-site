'use client';

import Link from 'next/link';
import { Info } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export type AgentPerformanceBadgeModel = {
  modelVersion: string;
  overallScore: number;
  confidenceBand: 'HIGH' | 'MEDIUM' | 'DEVELOPING';
  topDrivers: Array<{
    label: string;
    direction: 'positive' | 'negative';
    metricSummary: string;
    deepLink?: string;
  }>;
  lastUpdated: string;
};

const bandTone: Record<AgentPerformanceBadgeModel['confidenceBand'], string> = {
  HIGH: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-100',
  DEVELOPING: 'bg-slate-50 text-slate-700 border-slate-200'
};

const bandLabel: Record<AgentPerformanceBadgeModel['confidenceBand'], string> = {
  HIGH: 'High',
  MEDIUM: 'Medium',
  DEVELOPING: 'Developing'
};

const performanceHelpCopy =
  'Agent performance indicator based on outcomes, responsiveness, momentum, workload, and risk.';

export function AgentPerformanceBadge({ performance }: { performance?: AgentPerformanceBadgeModel | null }) {
  const helpTooltip = (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="rounded-sm p-1 text-slate-400 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2"
          aria-label="About Agent Performance Indicator"
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="text-sm text-slate-700">{performanceHelpCopy}</p>
      </TooltipContent>
    </Tooltip>
  );

  if (!performance) {
    return (
      <TooltipProvider>
        <div className="flex items-center gap-1">
          <Badge className="border bg-slate-50 text-slate-600">
            API: — <span className="sr-only">(No snapshot)</span>
          </Badge>
          {helpTooltip}
        </div>
      </TooltipProvider>
    );
  }

  const score = Math.round((performance.overallScore ?? 0) * 100);
  const drivers = Array.isArray(performance.topDrivers) ? performance.topDrivers.slice(0, 2) : [];

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge className={`border ${bandTone[performance.confidenceBand]}`}>
              API: {score} ({bandLabel[performance.confidenceBand]})
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-600">
                {performance.modelVersion} · Updated {new Date(performance.lastUpdated).toLocaleDateString()}
              </p>
              {drivers.length === 0 ? (
                <p className="text-sm text-slate-700">No drivers yet.</p>
              ) : (
                <ul className="space-y-1 text-sm text-slate-700">
                  {drivers.map((driver) => (
                    <li key={driver.label}>
                      {driver.deepLink ? (
                        <Link href={driver.deepLink} className="font-medium text-brand-700 hover:underline">
                          {driver.label}
                        </Link>
                      ) : (
                        <span className="font-medium">{driver.label}</span>
                      )}
                      <span className="text-slate-500"> · {driver.metricSummary}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
        {helpTooltip}
      </div>
    </TooltipProvider>
  );
}
