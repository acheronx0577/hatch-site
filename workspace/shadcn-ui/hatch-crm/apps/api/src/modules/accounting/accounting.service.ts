import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

import { PrismaService } from '@/modules/prisma/prisma.service';

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

  private isMissingSchemaError(error: unknown) {
    return (
      error instanceof Error &&
      (error as any).code &&
      ['P2021', 'P2022', '42P01'].includes((error as any).code)
    );
  }

  async getSyncStatus(orgId: string) {
    let config = null;
    try {
      const rows = (await this.prisma.$queryRaw<
        Array<{
          id: string;
          organizationId: string;
          provider: string;
          realmId: string;
          connectedAt: Date | null;
          lastSyncAt: Date | null;
          createdAt: Date;
          updatedAt: Date;
        }>
      >`
        SELECT "id","organizationId","provider","realmId","connectedAt","lastSyncAt","createdAt","updatedAt"
        FROM "AccountingIntegrationConfig"
        WHERE "organizationId" = ${orgId}
        LIMIT 1
      `) as any[];
      config = rows?.[0] ?? null;
    } catch (error) {
      if (!this.isMissingSchemaError(error)) {
        throw error;
      }
    }

    // Fallback to QuickBooks connection row if config was not created yet.
    if (!config) {
      try {
        const qbConn = (await this.prisma.$queryRaw<
          Array<{ id: string; realmId: string; createdAt: Date; updatedAt: Date }>
        >`
          SELECT "id","realmId","createdAt","updatedAt"
          FROM "QuickBooksConnection"
          WHERE "orgId" = ${orgId}
          LIMIT 1
        `) as any[];
        if (qbConn?.length) {
          const first = qbConn[0];
          config = {
            id: first.id,
            organizationId: orgId,
            provider: 'QUICKBOOKS' as any,
            realmId: first.realmId,
            connectedAt: first.createdAt,
            lastSyncAt: null,
            createdAt: first.createdAt,
            updatedAt: first.updatedAt
          } as any;
        }
      } catch (error) {
        if (!this.isMissingSchemaError(error)) {
          throw error;
        }
      }
    }

    return {
      config: config ?? null,
      transactions: [],
      rentalLeases: []
    };
  }

  async connect(orgId: string, provider: string, realmId: string) {
    const now = new Date();
    let config = null;
    try {
      config = await this.prisma.accountingIntegrationConfig.upsert({
        where: { organizationId: orgId },
        create: {
          id: crypto.randomUUID(),
          organizationId: orgId,
          provider: provider as any,
          realmId,
          connectedAt: now,
          lastSyncAt: null,
          createdAt: now,
          updatedAt: now
        },
        update: {
          provider: provider as any,
          realmId,
          connectedAt: now,
          updatedAt: now
        }
      });
    } catch (error) {
      if (!this.isMissingSchemaError(error)) {
        throw error;
      }
    }

    await this.prisma.quickBooksConnection.upsert({
      where: { orgId },
      create: {
        id: crypto.randomUUID(),
        orgId,
        realmId,
        tokensJson: '{}' // placeholder until OAuth callback saves real tokens
      },
      update: {
        realmId
      }
    });

    return config ?? { organizationId: orgId, provider, realmId, connectedAt: now };
  }
}
