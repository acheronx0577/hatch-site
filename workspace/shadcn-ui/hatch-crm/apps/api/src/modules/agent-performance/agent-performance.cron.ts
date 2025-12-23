import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '@/modules/prisma/prisma.service';
import { AgentPerformanceService } from './agent-performance.service';

const AGENT_PERFORMANCE_CRON_SCHEDULE = '15 2 * * *';
const AGENT_PERFORMANCE_CRON_TIMEZONE = 'UTC';

@Injectable()
export class AgentPerformanceCron implements OnModuleInit {
  private readonly logger = new Logger(AgentPerformanceCron.name);
  private inFlight = false;

  private cronEnabled() {
    const raw = (process.env.AGENT_PERFORMANCE_CRON_ENABLED ?? '').trim().toLowerCase();
    return raw === 'true' || raw === '1' || raw === 'yes';
  }

  private allowedOrgIds() {
    const raw = process.env.AGENT_PERFORMANCE_CRON_ORG_IDS;
    if (!raw) return null;
    const ids = raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    return ids.length ? new Set(ids) : null;
  }

  private maxOrgsPerRun() {
    const raw = process.env.AGENT_PERFORMANCE_CRON_MAX_ORGS_PER_RUN;
    const value = raw ? Number(raw) : 200;
    if (!Number.isFinite(value) || value <= 0) return 200;
    return Math.min(Math.floor(value), 1000);
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentPerformance: AgentPerformanceService
  ) {}

  onModuleInit() {
    const enabled = this.cronEnabled();
    const allowlist = this.allowedOrgIds();
    this.logger.log(
      `Agent performance cron configured: schedule="${AGENT_PERFORMANCE_CRON_SCHEDULE}" timezone=${AGENT_PERFORMANCE_CRON_TIMEZONE} enabled=${enabled} allowlist=${
        allowlist ? allowlist.size : 'ALL'
      } maxOrgsPerRun=${this.maxOrgsPerRun()}`
    );
    if (enabled && !allowlist) {
      this.logger.warn(
        'Agent performance cron is enabled without an org allowlist; set AGENT_PERFORMANCE_CRON_ORG_IDS to limit scope during rollout.'
      );
    }
  }

  @Cron(AGENT_PERFORMANCE_CRON_SCHEDULE, { timeZone: AGENT_PERFORMANCE_CRON_TIMEZONE })
  async nightly() {
    if (!this.cronEnabled()) return;
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      const allowlist = this.allowedOrgIds();
      const maxOrgs = this.maxOrgsPerRun();

      const orgs = await this.prisma.agentProfile.findMany({
        where: allowlist ? { organizationId: { in: Array.from(allowlist) } } : undefined,
        select: { organizationId: true },
        distinct: ['organizationId'],
        orderBy: { organizationId: 'asc' },
        take: maxOrgs
      });

      for (const entry of orgs) {
        try {
          await this.agentPerformance.generateSnapshots(entry.organizationId);
        } catch (error) {
          this.logger.warn(
            `Agent performance cron failed for org ${entry.organizationId}: ${error instanceof Error ? error.message : error}`
          );
        }
      }
    } finally {
      this.inFlight = false;
    }
  }
}
