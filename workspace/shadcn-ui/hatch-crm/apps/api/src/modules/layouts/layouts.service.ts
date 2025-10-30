import { Injectable, NotFoundException } from '@nestjs/common';

import { Prisma, type FieldLayout } from '@hatch/db';
import { FIELD_MAP, type FieldDef } from '@hatch/shared/layout';

import type { RequestContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { FlsService } from '../../platform/security/fls.service';
import type { LayoutManifestDto, ResolveLayoutQueryDto, UpsertLayoutDto } from './dto';

const DEFAULT_PROFILE_KEYS = new Set(['admin', 'manager', 'agent', 'viewer']);

@Injectable()
export class LayoutsService {
  constructor(private readonly prisma: PrismaService, private readonly fls: FlsService) {}

  async upsert(ctx: RequestContext, dto: UpsertLayoutDto): Promise<LayoutManifestDto> {
    this.ensureOrgContext(ctx);
    if (dto.profile && !DEFAULT_PROFILE_KEYS.has(dto.profile)) {
      throw new NotFoundException('Unsupported profile key');
    }
    const recordTypeId = dto.recordTypeId ?? null;
    if (recordTypeId) {
      const recordType = await this.prisma.recordType.findFirst({
        where: { id: recordTypeId, orgId: ctx.orgId }
      });
      if (!recordType) {
        throw new NotFoundException('Record type not found for this organisation');
      }
    }

    const normalized = this.normalizeFields(dto.object, dto.fields);

    await this.prisma.objectLayout.upsert({
      where: {
        orgId_object_kind_recordTypeId_profile: {
          orgId: ctx.orgId,
          object: dto.object,
          kind: dto.kind,
          recordTypeId,
          profile: dto.profile ?? null
        }
      },
      update: {
        active: true,
        fields: {
          deleteMany: {},
          create: normalized.map((field, index) => ({
            field: field.field,
            label: field.label ?? null,
            visible: field.visible,
            order: index,
            width: field.width ?? null
          }))
        }
      },
      create: {
        orgId: ctx.orgId,
        object: dto.object,
        kind: dto.kind,
        recordTypeId,
        profile: dto.profile ?? null,
        active: true,
        fields: {
          create: normalized.map((field, index) => ({
            field: field.field,
            label: field.label ?? null,
            visible: field.visible,
            order: index,
            width: field.width ?? null
          }))
        }
      }
    });

    return this.resolve(ctx, {
      object: dto.object,
      kind: dto.kind,
      recordTypeId: recordTypeId ?? undefined,
      profile: dto.profile ?? undefined
    });
  }

  async resolve(ctx: RequestContext, q: ResolveLayoutQueryDto): Promise<LayoutManifestDto> {
    this.ensureOrgContext(ctx);
    const layouts = await this.findLayoutCandidates(ctx.orgId, q);
    const chosen = layouts.find((layout) => layout !== null) ?? null;

    const baseline = this.fieldsForObject(q.object);
    const samplePayload = Object.fromEntries(baseline.map((f) => [f.field, true]));
    const allowedSet = await this.fls.readableSet(
      { orgId: ctx.orgId, userId: ctx.userId },
      q.object,
      samplePayload
    );

    const resolvedFields = this.mergeFields(chosen?.fields ?? [], baseline, allowedSet);

    return {
      object: q.object,
      kind: q.kind,
      fields: resolvedFields
    };
  }

  private async findLayoutCandidates(
    orgId: string,
    q: ResolveLayoutQueryDto
  ): Promise<(Prisma.ObjectLayoutGetPayload<{ include: { fields: true } }> | null)[]> {
    const combos: Array<{ recordTypeId: string | null; profile: string | null }> = [];
    const recordTypeId = q.recordTypeId ?? null;
    const profile = q.profile ?? null;

    combos.push({ recordTypeId, profile });
    combos.push({ recordTypeId, profile: null });
    combos.push({ recordTypeId: null, profile });
    combos.push({ recordTypeId: null, profile: null });

    const seen = new Set<string>();
    const results: Array<Prisma.ObjectLayoutGetPayload<{ include: { fields: true } }> | null> = [];

    for (const combo of combos) {
      const key = `${combo.recordTypeId ?? 'null'}:${combo.profile ?? 'null'}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const layout = await this.prisma.objectLayout.findFirst({
        where: {
          orgId,
          object: q.object,
          kind: q.kind,
          active: true,
          recordTypeId: combo.recordTypeId,
          profile: combo.profile
        },
        include: { fields: { orderBy: { order: 'asc' } } }
      });
      results.push(layout);
      if (layout) {
        break;
      }
    }

    return results;
  }

  private mergeFields(stored: FieldLayout[], baseline: FieldDef[], allowed: Set<string>) {
    const allowedSet = allowed.size > 0 ? allowed : new Set(baseline.map((f) => f.field));
    const visibleStored = stored
      .filter((f) => f.visible)
      .filter((f) => allowedSet.has(f.field))
      .sort((a, b) => a.order - b.order)
      .map((f) => ({
        field: f.field,
        label: f.label ?? baseline.find((b) => b.field === f.field)?.label,
        order: f.order,
        width: f.width ?? undefined
      }));

    const existing = new Set(visibleStored.map((f) => f.field));
    const maxOrder =
      visibleStored.length === 0 ? -1 : Math.max(...visibleStored.map((f) => f.order ?? 0));
    const appended = baseline
      .filter((f) => allowedSet.has(f.field) && !existing.has(f.field))
      .map((f, index) => ({
        field: f.field,
        label: f.label,
        order: maxOrder + 1 + index,
        width: f.width
      }));

    return [...visibleStored, ...appended].map((f, index) => ({
      field: f.field,
      label: f.label,
      order: index,
      width: f.width
    }));
  }

  private normalizeFields(
    object: string,
    fields: UpsertLayoutDto['fields']
  ): Array<{ field: string; label?: string; visible: boolean; width?: number }> {
    const baseline = this.fieldsForObject(object);
    const validFields = new Map(baseline.map((item) => [item.field, item]));
    const dedup = new Map<string, { field: string; label?: string; visible: boolean; width?: number }>();

    fields
      .map((field, index) => ({
        field: field.field,
        label: field.label ?? validFields.get(field.field)?.label,
        visible: field.visible ?? true,
        order: field.order ?? index,
        width: field.width
      }))
      .sort((a, b) => a.order - b.order)
      .forEach((field) => {
        if (!validFields.has(field.field)) {
          return;
        }
        dedup.set(field.field, {
          field: field.field,
          label: field.label ?? validFields.get(field.field)?.label,
          visible: field.visible,
          width: field.width
        });
      });

    if (dedup.size === 0) {
      baseline.forEach((field) => {
        dedup.set(field.field, {
          field: field.field,
          label: field.label,
          visible: true,
          width: field.width
        });
      });
    }

    return Array.from(dedup.values());
  }

  private fieldsForObject(object: string): FieldDef[] {
    return FIELD_MAP[object] ?? [];
  }

  private ensureOrgContext(ctx: RequestContext): asserts ctx is RequestContext & { orgId: string } {
    if (!ctx.orgId) {
      throw new NotFoundException('Organisation context not found');
    }
  }
}
