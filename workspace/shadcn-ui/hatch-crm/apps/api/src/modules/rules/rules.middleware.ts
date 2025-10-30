import { BadRequestException, Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { RulesService, type AssignmentResult } from './rules.service';
import { FlsService } from '../../platform/security/fls.service';

type MutatingMethod = 'POST' | 'PATCH' | 'PUT';

const MUTATING_METHODS: MutatingMethod[] = ['POST', 'PATCH', 'PUT'];

interface PlatformContext {
  orgId?: string;
  tenantId?: string;
  userId?: string;
  assignmentOverride?: AssignmentResult | null;
}

@Injectable()
export class RulesMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RulesMiddleware.name);

  constructor(
    private readonly rules: RulesService,
    private readonly fls: FlsService
  ) {}

  async use(
    req: FastifyRequest & { platformContext?: PlatformContext },
    _res: FastifyReply,
    next: (err?: unknown) => void,
    object?: string
  ) {
    if (!object) {
      return next();
    }

    const method = (req.method ?? '').toUpperCase() as MutatingMethod;
    if (!MUTATING_METHODS.includes(method)) {
      return next();
    }

    const payload = this.cloneBody(req.body);
    if (!payload || typeof payload !== 'object') {
      return next();
    }

    const platform = this.ensurePlatformContext(req);
    const orgId = platform.orgId ?? this.header(req, 'x-org-id') ?? process.env.DEFAULT_ORG_ID ?? null;
    const tenantId = platform.tenantId ?? this.header(req, 'x-tenant-id') ?? process.env.DEFAULT_TENANT_ID ?? null;
    const userId = platform.userId ?? this.header(req, 'x-user-id') ?? process.env.DEFAULT_USER_ID ?? null;

    if (orgId && !platform.orgId) {
      platform.orgId = orgId;
    }
    if (tenantId && !platform.tenantId) {
      platform.tenantId = tenantId;
    }
    if (userId && !platform.userId) {
      platform.userId = userId;
    }

    if (!orgId) {
      return next();
    }

    try {
      const identifier = {
        id: this.extractRecordId(req),
        orgId,
        tenantId
      };

      const before = await this.rules.loadCurrentSnapshot(object, identifier);
      const mergedAfter = before ? { ...before, ...payload } : { ...payload };

      const violations = await this.rules.evaluateValidation(orgId, object, before, mergedAfter);

      if (violations.length > 0) {
        throw new BadRequestException({
          message: 'Validation rules violated',
          violations
        });
      }

      const assignment = await this.rules.evaluateAssignment(orgId, object, mergedAfter, before);

      if (assignment) {
        await this.applyAssignmentIfPermitted(req, object, assignment, {
          orgId,
          userId
        });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  }

  private async applyAssignmentIfPermitted(
    req: FastifyRequest & { platformContext?: PlatformContext },
    object: string,
    assignment: AssignmentResult,
    ctx: { orgId: string | null; userId: string | null }
  ) {
    if (!assignment.ownerId && !assignment.teamId) {
      return;
    }

    if (!ctx.orgId || !ctx.userId) {
      this.logger.debug(`Skipping assignment for ${object}; missing org or user context`);
      return;
    }

    const writable = await this.fls.writableSet(
      { orgId: ctx.orgId, userId: ctx.userId },
      object,
      assignment.ownerId ? { ownerId: assignment.ownerId } : undefined
    );

    const effective: AssignmentResult = {};

    if (assignment.ownerId) {
      if (writable.has('ownerId')) {
        effective.ownerId = assignment.ownerId;
      } else {
        this.logger.debug({
          event: 'assignment_blocked',
          object,
          field: 'ownerId',
          reason: 'FLS denied write access',
          ruleOwner: assignment.ownerId
        });
        // TODO(telemetry): capture assignment suppression for admin insights
      }
    }

    if (assignment.teamId) {
      effective.teamId = assignment.teamId;
    }

    if (effective.ownerId || effective.teamId) {
      this.ensurePlatformContext(req).assignmentOverride = effective;
    }
  }

  private ensurePlatformContext(
    req: FastifyRequest & { platformContext?: PlatformContext }
  ): PlatformContext {
    if (!req.platformContext) {
      req.platformContext = {};
    }
    return req.platformContext;
  }

  private header(req: FastifyRequest, key: string): string | null {
    const value = req.headers?.[key];
    if (Array.isArray(value)) {
      return value[0] ?? null;
    }
    if (typeof value === 'string') {
      return value;
    }
    return null;
  }

  private extractRecordId(req: FastifyRequest): string | null {
    const params = req.params as Record<string, unknown> | undefined;
    if (!params) {
      return null;
    }
    if (typeof params === 'string') {
      return params;
    }
    const direct = params['id'];
    if (typeof direct === 'string') {
      return direct;
    }
    return null;
  }

  private cloneBody(body: unknown): Record<string, unknown> | null {
    if (!body || typeof body !== 'object') {
      return null;
    }
    return JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
  }
}
