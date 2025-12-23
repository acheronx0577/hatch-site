import React from 'react';

import { cn } from '@/lib/utils';

interface MissionControlHeroProps {
  brokerName?: string | null;
  activeAgents?: number;
  liveListings?: number;
  riskLevel?: 'calm' | 'watching' | 'elevated';
}

const riskLabel: Record<NonNullable<MissionControlHeroProps['riskLevel']>, string> = {
  calm: 'Calm',
  watching: 'Watching',
  elevated: 'Needs attention'
};

const riskClass: Record<NonNullable<MissionControlHeroProps['riskLevel']>, string> = {
  calm: 'bg-emerald-50/60 text-emerald-800 border-emerald-100',
  watching: 'bg-amber-50/70 text-amber-900 border-amber-100',
  elevated: 'bg-rose-50/70 text-rose-900 border-rose-100'
};

export const MissionControlHero: React.FC<MissionControlHeroProps> = ({
  brokerName = 'your brokerage',
  activeAgents = 0,
  liveListings = 0,
  riskLevel = 'calm'
}) => {
  return (
    <section
      className={cn(
        'hatch-hero relative overflow-hidden rounded-[32px] border border-white/20',
        // Hatch CRM-style gradient (match CRM hero)
        'bg-gradient-to-r from-[#1F5FFF] via-[#3D86FF] to-[#00C6A2]',
        'px-6 py-5 md:px-8 md:py-7 text-white shadow-[0_18px_48px_rgba(15,23,42,0.28)]'
      )}
    >
      <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-10 bottom-0 h-40 w-40 rounded-full bg-cyan-300/40 blur-3xl" />

      <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="max-w-xl space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100/80">
            Mission control
          </p>

          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-white">
            See your brokerage at a glance.
          </h1>

          <p className="text-sm md:text-base text-sky-50/90">
            Live view of agents, listings, deals, and risk — without the noise.
          </p>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full bg-white/10 px-3 py-1 backdrop-blur text-sky-50">
              {activeAgents} agents
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1 backdrop-blur text-sky-50">
              {liveListings} listings
            </span>
            <span className={cn('rounded-full border border-white/40 bg-white/10 px-3 py-1 backdrop-blur text-sky-50')}>
              Status: {riskLabel[riskLevel]}
            </span>
          </div>
        </div>

        <div className="mt-4 flex items-end gap-4 md:mt-0">
          <div className="rounded-2xl bg-white/12 px-4 py-3 backdrop-blur-md border border-white/20">
            <p className="text-[11px] uppercase tracking-wide text-sky-100/80">Next up</p>
            <p className="text-sm font-medium text-white">Review agents needing attention.</p>
            <p className="text-[11px] text-sky-50/85">Hatch surfaces what matters most today.</p>
          </div>
        </div>
      </div>
    </section>
  );
};
