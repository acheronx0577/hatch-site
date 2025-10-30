import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

import type { Prisma } from '@hatch/db';

import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../common/dto/cursor-pagination-query.dto';
import { evaluateExpression } from './expression';
import { RuleQueryDto, RuleRecordDto } from './dto';

export interface ValidationViolation {
  field: string;
  message: string;
}

export interface AssignmentResult {
  ownerId?: string;
  teamId?: string;
}

type JsonValue = Prisma.JsonValue;

interface ValidationRuleDefinition {
  if?: string;
  then_required?: string[];
  message?: string;
}

type AssignmentType = 'static_owner' | 'static_team' | 'round_robin';

interface AssignmentRuleDefinition {
  when?: string;
  assign: {
    type: AssignmentType;
    ownerId?: string;
    teamId?: string;
    pool?: string[];
  };
}

interface RecordSnapshot {
  [key: string]: unknown;
}

const OBJECT_FIELD_ALLOWLIST: Record<string, string[]> = {
  accounts: [
    'id',
    'orgId',
    'ownerId',
    'name',
    'website',
    'industry',
    'annualRevenue',
    'phone',
    'billingAddress',
    'billingAddress.*',
    'shippingAddress',
    'shippingAddress.*',
    'createdAt',
    'updatedAt'
  ],
  opportunities: [
    'id',
    'orgId',
    'ownerId',
    'accountId',
    'name',
    'stage',
    'amount',
    'currency',
    'closeDate',
    'createdAt',
    'updatedAt'
  ],
  cases: [
    'id',
    'orgId',
    'ownerId',
    'subject',
    'status',
    'priority',
    'origin',
    'description',
    'accountId',
    'contactId',
    'createdAt',
    'updatedAt'
  ],
  re_offers: [
    'id',
    'tenantId',
    'listingId',
    'personId',
    'dealId',
    'status',
    'terms',
    'terms.*',
    'metadata',
    'metadata.*',
    'createdAt',
    'updatedAt'
  ],
  re_transactions: [
    'id',
    'tenantId',
    'personId',
    'listingId',
    'opportunityId',
    'stage',
    'milestoneChecklist',
    'milestoneChecklist.*',
    'commissionSnapshot',
    'commissionSnapshot.*',
    'forecastGci',
    'expectedNet',
    'createdAt',
    'updatedAt'
  ]
};

const SUPPORTED_OBJECTS = new Set(Object.keys(OBJECT_FIELD_ALLOWLIST));

const MUTATING_METHODS = new Set<AssignmentType>(['static_owner', 'static_team', 'round_robin']);

@Injectable()
export class RulesService {
  private readonly logger = new Logger(RulesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listValidation(orgId: string, query: RuleQueryDto) {
    if (query.object) {
      this.assertSupportedObject(query.object);
    }
    const take = Math.min(query.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const records = await this.prisma.validationRule.findMany({
      where: {
        orgId,
        ...(query.object ? { object: query.object } : {}),
        ...(query.q
          ? {
              name: {
                contains: query.q,
                mode: 'insensitive'
              }
            }
          : {})
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(query.cursor
        ? {
            skip: 1,
            cursor: { id: query.cursor }
          }
        : {})
    });

    let nextCursor: string | null = null;
    if (records.length > take) {
      const next = records.pop();
      nextCursor = next?.id ?? null;
    }

    return {
      items: records.map((record) => this.toRuleRecord(record)),
      nextCursor
    };
  }

  async listAssignment(orgId: string, query: RuleQueryDto) {
    if (query.object) {
      this.assertSupportedObject(query.object);
    }
    const take = Math.min(query.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const records = await this.prisma.assignmentRule.findMany({
      where: {
        orgId,
        ...(query.object ? { object: query.object } : {}),
        ...(query.q
          ? {
              name: {
                contains: query.q,
                mode: 'insensitive'
              }
            }
          : {})
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(query.cursor
        ? {
            skip: 1,
            cursor: { id: query.cursor }
          }
        : {})
    });

    let nextCursor: string | null = null;
    if (records.length > take) {
      const next = records.pop();
      nextCursor = next?.id ?? null;
    }

    return {
      items: records.map((record) => this.toRuleRecord(record)),
      nextCursor
    };
  }

  async createValidationRule(input: {
    orgId: string;
    object: string;
    name: string;
    active: boolean;
    dsl: Record<string, unknown>;
  }) {
    this.assertSupportedObject(input.object);
    const definition = this.normaliseValidationDefinition(input.object, input.dsl);
    const created = await this.prisma.validationRule.create({
      data: {
        orgId: input.orgId,
        object: input.object,
        name: input.name,
        active: input.active,
        dsl: definition as unknown as JsonValue
      }
    });
    return this.toRuleRecord(created);
  }

  async updateValidationRule(orgId: string, id: string, patch: Partial<{
    object: string;
    name: string;
    active: boolean;
    dsl: Record<string, unknown>;
  }>) {
    const existing = await this.prisma.validationRule.findUnique({
      where: { id }
    });
    if (!existing || existing.orgId !== orgId) {
      throw new BadRequestException('Validation rule not found');
    }

    const nextObject = patch.object ?? existing.object;
    this.assertSupportedObject(nextObject);

    let nextDsl: JsonValue | undefined;
    if (patch.dsl) {
      nextDsl = this.normaliseValidationDefinition(nextObject, patch.dsl) as JsonValue;
    }

    const updated = await this.prisma.validationRule.update({
      where: { id },
      data: {
        ...(patch.object ? { object: patch.object } : {}),
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
        ...(nextDsl ? { dsl: nextDsl } : {})
      }
    });
    return this.toRuleRecord(updated);
  }

  async deleteValidationRule(orgId: string, id: string) {
    const existing = await this.prisma.validationRule.findUnique({ where: { id } });
    if (!existing || existing.orgId !== orgId) {
      throw new BadRequestException('Validation rule not found');
    }
    await this.prisma.validationRule.delete({ where: { id } });
    return this.toRuleRecord(existing);
  }

  async createAssignmentRule(input: {
    orgId: string;
    object: string;
    name: string;
    active: boolean;
    dsl: Record<string, unknown>;
  }) {
    this.assertSupportedObject(input.object);
    const definition = this.normaliseAssignmentDefinition(input.object, input.dsl);
    const created = await this.prisma.assignmentRule.create({
      data: {
        orgId: input.orgId,
        object: input.object,
        name: input.name,
        active: input.active,
        dsl: definition as unknown as JsonValue
      }
    });
    return this.toRuleRecord(created);
  }

  async updateAssignmentRule(orgId: string, id: string, patch: Partial<{
    object: string;
    name: string;
    active: boolean;
    dsl: Record<string, unknown>;
  }>) {
    const existing = await this.prisma.assignmentRule.findUnique({
      where: { id }
    });
    if (!existing || existing.orgId !== orgId) {
      throw new BadRequestException('Assignment rule not found');
    }

    const nextObject = patch.object ?? existing.object;
    this.assertSupportedObject(nextObject);

    let nextDsl: JsonValue | undefined;
    if (patch.dsl) {
      nextDsl = this.normaliseAssignmentDefinition(nextObject, patch.dsl) as unknown as JsonValue;
    }

    const updated = await this.prisma.assignmentRule.update({
      where: { id },
      data: {
        ...(patch.object ? { object: patch.object } : {}),
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
        ...(nextDsl ? { dsl: nextDsl } : {})
      }
    });
    return this.toRuleRecord(updated);
  }

  async deleteAssignmentRule(orgId: string, id: string) {
    const existing = await this.prisma.assignmentRule.findUnique({ where: { id } });
    if (!existing || existing.orgId !== orgId) {
      throw new BadRequestException('Assignment rule not found');
    }
    await this.prisma.assignmentRule.delete({ where: { id } });
    return this.toRuleRecord(existing);
  }

  async evaluateValidation(
    orgId: string,
    object: string,
    before: RecordSnapshot | null,
    after: RecordSnapshot
  ): Promise<ValidationViolation[]> {
    this.assertSupportedObject(object);
    const rules = await this.prisma.validationRule.findMany({
      where: { orgId, object, active: true },
      orderBy: { createdAt: 'asc' }
    });

    const violations: ValidationViolation[] = [];

    for (const rule of rules) {
      const definition = this.normaliseValidationDefinition(object, rule.dsl as Record<string, unknown>);
      const context = { before, after };
      let condition = true;
      if (definition.if) {
        condition = evaluateExpression(definition.if, context, {
          onFieldReference: (path) => this.ensureAllowedField(object, path)
        });
      }

      if (!condition) {
        continue;
      }

      if (definition.then_required?.length) {
        for (const field of definition.then_required) {
          this.ensureAllowedField(object, field);
          const value = resolveFromSnapshot(after, field);
          if (!hasValue(value)) {
            violations.push({
              field,
              message: definition.message
                ? definition.message
                : `Rule "${rule.name}" requires "${field}" to be present`
            });
          }
        }
      }
    }

    return violations;
  }

  async evaluateAssignment(
    orgId: string,
    object: string,
    after: RecordSnapshot,
    before: RecordSnapshot | null
  ): Promise<AssignmentResult | null> {
    this.assertSupportedObject(object);
    const rules = await this.prisma.assignmentRule.findMany({
      where: { orgId, object, active: true },
      orderBy: { createdAt: 'asc' }
    });

    for (const rule of rules) {
      const definition = this.normaliseAssignmentDefinition(object, rule.dsl as Record<string, unknown>);
      const context = { before, after };

      let match = true;
      if (definition.when) {
        match = evaluateExpression(definition.when, context, {
          onFieldReference: (path) => this.ensureAllowedField(object, path)
        });
      }

      if (!match) {
        continue;
      }

      const resolved = this.resolveAssignment(definition.assign, after, rule.name);
      if (resolved) {
        return resolved;
      }
    }

    return null;
  }

  async loadCurrentSnapshot(
    object: string,
    identifier: { id?: string | null; orgId?: string | null; tenantId?: string | null }
  ): Promise<RecordSnapshot | null> {
    if (!identifier.id) {
      return null;
    }

    switch (object) {
      case 'accounts': {
        if (!identifier.orgId) return null;
        const record = await this.prisma.account.findFirst({
          where: {
            id: identifier.id,
            orgId: identifier.orgId,
            deletedAt: null
          }
        });
        return record ? cloneSnapshot(record) : null;
      }
      case 'opportunities': {
        if (!identifier.orgId) return null;
        const record = await this.prisma.opportunity.findFirst({
          where: {
            id: identifier.id,
            orgId: identifier.orgId,
            deletedAt: null
          }
        });
        return record ? cloneSnapshot(record) : null;
      }
      case 'cases': {
        if (!identifier.orgId) return null;
        const record = await this.prisma.case.findFirst({
          where: {
            id: identifier.id,
            orgId: identifier.orgId,
            deletedAt: null
          }
        });
        return record ? cloneSnapshot(record) : null;
      }
      case 're_offers': {
        const record = await this.prisma.offer.findUnique({
          where: { id: identifier.id }
        });
        if (!record) {
          return null;
        }
        if (identifier.tenantId && record.tenantId !== identifier.tenantId) {
          return null;
        }
        return cloneSnapshot(record);
      }
      case 're_transactions': {
        const record = await this.prisma.deal.findUnique({
          where: { id: identifier.id }
        });
        if (!record) {
          return null;
        }
        if (identifier.tenantId && record.tenantId !== identifier.tenantId) {
          return null;
        }
        return cloneSnapshot(record);
      }
      default:
        return null;
    }
  }

  private toRuleRecord(record: {
    id: string;
    orgId: string;
    object: string;
    name: string;
    active: boolean;
    dsl: JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }): RuleRecordDto {
    return {
      id: record.id,
      orgId: record.orgId,
      object: record.object as RuleRecordDto['object'],
      name: record.name,
      active: record.active,
      dsl: (record.dsl as Record<string, unknown>) ?? {},
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };
  }

  normaliseValidationDefinition(
    object: string,
    raw: Record<string, unknown>
  ): ValidationRuleDefinition {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new BadRequestException('Validation rule DSL must be an object');
    }

    const definition: ValidationRuleDefinition = {};
    const ifClause = raw['if'];
    if (ifClause !== undefined) {
      if (typeof ifClause !== 'string' || ifClause.trim().length === 0) {
        throw new BadRequestException('Validation rule "if" must be a non-empty string');
      }
      definition.if = ifClause.trim();
    }

    const thenRequired = raw['then_required'];
    if (thenRequired !== undefined) {
      if (!Array.isArray(thenRequired) || thenRequired.some((entry) => typeof entry !== 'string')) {
        throw new BadRequestException('Validation rule "then_required" must be an array of strings');
      }
      definition.then_required = Array.from(
        new Set(
          thenRequired
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0)
        )
      );
      for (const field of definition.then_required) {
        this.ensureAllowedField(object, field);
      }
    }

    const message = raw['message'];
    if (message !== undefined) {
      if (typeof message !== 'string') {
        throw new BadRequestException('Validation rule "message" must be a string');
      }
      definition.message = message.trim();
    }

    if (!definition.if && !definition.then_required) {
      throw new BadRequestException('Validation rule DSL must define at least "if" or "then_required"');
    }

    if (definition.if) {
      evaluateExpression(definition.if, { before: null, after: {} }, {
        onFieldReference: (path) => this.ensureAllowedField(object, path)
      });
    }

    return definition;
  }

  normaliseAssignmentDefinition(
    object: string,
    raw: Record<string, unknown>
  ): AssignmentRuleDefinition {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new BadRequestException('Assignment rule DSL must be an object');
    }

    const definition: AssignmentRuleDefinition = {
      assign: {
        type: 'static_owner'
      }
    };

    const whenClause = raw['when'];
    if (whenClause !== undefined) {
      if (typeof whenClause !== 'string' || whenClause.trim().length === 0) {
        throw new BadRequestException('Assignment rule "when" must be a non-empty string');
      }
      definition.when = whenClause.trim();
    }

    const assign = raw['assign'];
    if (!assign || typeof assign !== 'object' || Array.isArray(assign)) {
      throw new BadRequestException('Assignment rule "assign" must be an object');
    }

    const type = (assign as Record<string, unknown>)['type'];
    if (typeof type !== 'string' || !MUTATING_METHODS.has(type as AssignmentType)) {
      throw new BadRequestException(
        'Assignment rule "assign.type" must be one of static_owner, static_team, round_robin'
      );
    }

    const cleaned: AssignmentRuleDefinition['assign'] = { type: type as AssignmentType };

    switch (cleaned.type) {
      case 'static_owner': {
        const ownerId = (assign as Record<string, unknown>)['ownerId'];
        if (typeof ownerId !== 'string' || ownerId.trim().length === 0) {
          throw new BadRequestException('Assignment rule "assign.ownerId" must be a non-empty string');
        }
        cleaned.ownerId = ownerId.trim();
        break;
      }
      case 'static_team': {
        const teamId = (assign as Record<string, unknown>)['teamId'];
        if (typeof teamId !== 'string' || teamId.trim().length === 0) {
          throw new BadRequestException('Assignment rule "assign.teamId" must be a non-empty string');
        }
        cleaned.teamId = teamId.trim();
        break;
      }
      case 'round_robin': {
        const pool = (assign as Record<string, unknown>)['pool'];
        if (!Array.isArray(pool) || pool.length === 0 || pool.some((entry) => typeof entry !== 'string' || entry.trim().length === 0)) {
          throw new BadRequestException('Assignment rule "assign.pool" must be a non-empty array of strings');
        }
        cleaned.pool = pool.map((entry) => entry.trim());
        break;
      }
      default:
        throw new BadRequestException(`Unsupported assignment type "${cleaned.type}"`);
    }

    definition.assign = cleaned;

    if (definition.when) {
      evaluateExpression(definition.when, { before: null, after: {} }, {
        onFieldReference: (path) => this.ensureAllowedField(object, path)
      });
    }

    return definition;
  }

  ensureAllowedField(object: string, path: string) {
    const allowlist = OBJECT_FIELD_ALLOWLIST[object];
    if (!allowlist) {
      throw new BadRequestException(`Object "${object}" is not supported for rules`);
    }

    const trimmed = path.trim();
    if (trimmed.length === 0) {
      throw new BadRequestException('Field reference cannot be empty');
    }
    if (!/^[a-zA-Z0-9_.]+$/.test(trimmed)) {
      throw new BadRequestException(`Invalid field reference "${trimmed}"`);
    }

    for (const entry of allowlist) {
      if (entry === trimmed) {
        return;
      }
      if (entry.endsWith('.*')) {
        const prefix = entry.slice(0, -2);
        if (trimmed === prefix || trimmed.startsWith(`${prefix}.`)) {
          return;
        }
      }
    }

    throw new BadRequestException(`Field "${trimmed}" is not available on ${object}`);
  }

  private resolveAssignment(
    assign: AssignmentRuleDefinition['assign'],
    after: RecordSnapshot,
    ruleName: string
  ): AssignmentResult | null {
    switch (assign.type) {
      case 'static_owner':
        return { ownerId: assign.ownerId };
      case 'static_team':
        return { teamId: assign.teamId };
      case 'round_robin': {
        if (!assign.pool || assign.pool.length === 0) {
          this.logger.warn(`Assignment rule "${ruleName}" has an empty pool`);
          return null;
        }
        const basis =
          (typeof after.id === 'string' && after.id) ??
          (typeof after.name === 'string' && after.name) ??
          JSON.stringify(after);
        const hash = createHash('sha256').update(basis).digest();
        const index = hash.readUInt32BE(0) % assign.pool.length;
        return { ownerId: assign.pool[index]! };
      }
      default:
        return null;
    }
  }

  private assertSupportedObject(object: string) {
    if (!SUPPORTED_OBJECTS.has(object)) {
      throw new BadRequestException(`Unsupported object "${object}" for rules`);
    }
  }
}

function cloneSnapshot(record: Record<string, unknown>): RecordSnapshot {
  return deepClone(record);
}

function deepClone<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => deepClone(entry)) as unknown as T;
  }
  if (value instanceof Date) {
    return new Date(value.getTime()) as unknown as T;
  }
  if (typeof value === 'object') {
    if ('toNumber' in (value as any) && typeof (value as any).toNumber === 'function') {
      try {
        return (value as any).toNumber();
      } catch {
        return (value as any).valueOf();
      }
    }
    if ('toJSON' in (value as any) && typeof (value as any).toJSON === 'function') {
      return (value as any).toJSON();
    }
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[key] = deepClone(entry);
    }
    return output as unknown as T;
  }
  return value;
}

function resolveFromSnapshot(snapshot: RecordSnapshot, path: string): unknown {
  const segments = path.split('.').map((segment) => segment.trim()).filter(Boolean);
  let current: any = snapshot;
  for (const segment of segments) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    if (Object.prototype.hasOwnProperty.call(current, segment)) {
      current = current[segment];
    } else if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isNaN(index) && index >= 0 && index < current.length) {
        current = current[index];
      } else {
        return undefined;
      }
    } else {
      return undefined;
    }
  }
  return current;
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }
  return true;
}
