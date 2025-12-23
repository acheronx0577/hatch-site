"use client";

import { Menu, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useContextualHelp } from '@/components/help/ContextualHelp';

import { useSidebar } from './sidebar-context';

export function Topbar() {
  const { toggleMobile } = useSidebar();
  const { openPageHelp } = useContextualHelp();

  return (
    <header className="sticky top-0 z-20 px-4 pt-4 md:px-8 md:pt-6">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 rounded-3xl border border-white/15 bg-[var(--hatch-gradient)]/90 px-4 py-3 text-white shadow-[0_24px_60px_rgba(31,95,255,0.25)] backdrop-blur-[12px]">
        <div className="flex flex-1 items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-white hover:bg-white/20 md:hidden"
            onClick={toggleMobile}
            aria-label="Toggle navigation"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/30 bg-white/20 text-lg font-semibold leading-none text-white shadow-inner">
              H
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-white/80">Hatch CRM</p>
              <p className="text-xl font-semibold leading-tight text-white">Revenue Pipeline OS</p>
            </div>
          </div>
        </div>
        <div className={cn('flex items-center gap-2', 'flex-1 justify-end')}>
          <Button
            variant="ghost"
            size="sm"
            className="hidden items-center gap-2 text-white/80 hover:bg-white/20 hover:text-white lg:inline-flex"
          >
            <Search className="h-4 w-4" />
            Quick Search
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="hidden text-white/80 hover:bg-white/20 hover:text-white md:inline-flex"
            onClick={openPageHelp}
          >
            Ask Hatch
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="bg-white text-slate-900 hover:bg-white/90"
          >
            Upgrade
          </Button>
        </div>
      </div>
    </header>
  );
}
