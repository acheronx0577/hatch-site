import { Injectable } from '@nestjs/common';

import { AuditAction, Prisma } from '@hatch/db';

import { PrismaService } from '../../modules/prisma/prisma.service';

export interface AuditLogInput {
  orgId: string;
  actorId?: string | null;
  object?: string | null;
  recordId?: string | null;
  action: AuditAction;
  diff?: Prisma.InputJsonValue | null;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditLogInput): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        orgId: entry.orgId,
        actorId: entry.actorId ?? null,
        object: entry.object ?? null,
        recordId: entry.recordId ?? null,
        action: entry.action,
        diff: entry.diff ?? undefined,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null
      }
    });
  }
}
