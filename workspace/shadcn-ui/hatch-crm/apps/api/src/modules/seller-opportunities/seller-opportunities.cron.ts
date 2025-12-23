import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '../prisma/prisma.service';
import { SellerOpportunitiesService } from './seller-opportunities.service';

@Injectable()
export class SellerOpportunitiesCron {
  private readonly logger = new Logger(SellerOpportunitiesCron.name);
  private inFlight = false;

  private cronEnabled() {
    return (process.env.SELLER_OPPORTUNITIES_CRON_ENABLED ?? 'false').toLowerCase() === 'true';
  }

  private allowedOrgIds() {
    const raw = process.env.SELLER_OPPORTUNITIES_CRON_ORG_IDS;
    if (!raw) return null;
    const ids = raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    return ids.length ? new Set(ids) : null;
  }

  private maxOrgsPerRun() {
    const raw = process.env.SELLER_OPPORTUNITIES_CRON_MAX_ORGS_PER_RUN;
    const value = raw ? Number(raw) : 25;
    if (!Number.isFinite(value) || value <= 0) return 25;
    return Math.min(Math.floor(value), 500);
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly sellerOpps: SellerOpportunitiesService
  ) {}

  @Cron('15 */6 * * *', { timeZone: 'UTC' })
  async run() {
    if (!this.cronEnabled()) return;
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      const allowlist = this.allowedOrgIds();
      const maxOrgs = this.maxOrgsPerRun();
      const orgs = await this.prisma.orgListing.findMany({
        where: allowlist ? { organizationId: { in: Array.from(allowlist) } } : undefined,
        select: { organizationId: true },
        distinct: ['organizationId'],
        orderBy: { organizationId: 'asc' },
        take: maxOrgs
      });
      for (const entry of orgs) {
        try {
          await this.sellerOpps.runForOrg(entry.organizationId, null, { reason: 'cron' });
        } catch (error) {
          this.logger.warn(
            `Seller opportunities cron failed for org ${entry.organizationId}: ${error instanceof Error ? error.message : error}`
          );
        }
      }
    } finally {
      this.inFlight = false;
    }
  }
}
