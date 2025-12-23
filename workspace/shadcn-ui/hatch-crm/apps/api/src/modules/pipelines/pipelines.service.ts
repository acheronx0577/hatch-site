import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { AuditAction, PipelineStatus, Prisma } from '@hatch/db';

import { PrismaService } from '@/shared/prisma.service';
import { AuditService } from '@/platform/audit/audit.service';
import { AnalyticsService } from '@/modules/analytics/analytics.service';
import { CreatePipelineDto } from './dto/create-pipeline.dto';
import { UpdatePipelineDto } from './dto/update-pipeline.dto';
import { StageDto } from './dto/stage.dto';
import { FieldSetDto } from './dto/fieldset.dto';
import { AutomationDto } from './dto/automation.dto';
import { PublishDto } from './dto/publish.dto';
import { MigrationDto } from './dto/migrate.dto';
import {
  compileJsonSchemaOrThrow,
  validateAutomationPayload,
  validateUniqueStageNamesAndOrder
} from './pipelines.validation';

@Injectable()
export class PipelinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly analytics: AnalyticsService,
    @InjectQueue('pipeline-migrations') private readonly queue: Queue
  ) {}

  list(brokerageId: string) {
    const scopedId = brokerageId?.trim();
    const where: Prisma.PipelineWhereInput =
      scopedId && scopedId.length > 0
        ? {
            OR: [{ brokerageId: scopedId }, { tenantId: scopedId }]
          }
        : {};
    return this.prisma.pipeline.findMany({
      where,
      orderBy: [{ isDefault: 'desc' }, { order: 'asc' }, { publishedAt: 'desc' }, { createdAt: 'asc' }],
      include: {
        stages: true,
        fieldSets: true,
        automations: true
      }
    });
  }

  async createDraft(dto: CreatePipelineDto) {
    const tenantId = dto.brokerageId;
    const draft = await this.prisma.pipeline.create({
      data: {
        tenantId,
        brokerageId: dto.brokerageId,
        name: dto.name,
        type: dto.useCase ?? 'CUSTOM',
        useCase: dto.useCase,
        status: PipelineStatus.DRAFT,
        isDefault: Boolean(dto.isDefault)
      }
    });
    await this.audit.log({
      orgId: draft.brokerageId ?? 'unknown',
      recordId: draft.id,
      object: 'pipeline',
      action: AuditAction.CREATE,
      diff: {
        after: {
          id: draft.id,
          name: draft.name,
          status: draft.status,
          version: draft.version
        }
      }
    });
    return draft;
  }

  async updateDraft(id: string, dto: UpdatePipelineDto) {
    const current = await this.prisma.pipeline.findUnique({ where: { id } });
    if (!current) {
      throw new BadRequestException('Pipeline not found');
    }
    if (current.status !== PipelineStatus.DRAFT) {
      throw new BadRequestException('Active/archived pipelines are immutable');
    }

    const updated = await this.prisma.pipeline.update({
      where: { id },
      data: {
        name: dto.name ?? current.name,
        useCase: dto.useCase ?? current.useCase
      }
    });
    await this.audit.log({
      orgId: updated.brokerageId ?? current.brokerageId ?? 'unknown',
      recordId: updated.id,
      object: 'pipeline',
      action: AuditAction.UPDATE,
      diff: {
        before: {
          name: current.name,
          useCase: current.useCase
        },
        after: {
          name: updated.name,
          useCase: updated.useCase
        }
      }
    });
    return updated;
  }

  async upsertStages(pipelineId: string, stages: StageDto[]) {
    const pipeline = await this.prisma.pipeline.findUnique({ where: { id: pipelineId } });
    if (!pipeline) {
      throw new BadRequestException('Pipeline not found');
    }
    if (pipeline.status !== PipelineStatus.DRAFT) {
      throw new BadRequestException('Active/archived pipelines are immutable');
    }

    validateUniqueStageNamesAndOrder(stages);

    await this.prisma.$transaction([
      this.prisma.stage.deleteMany({ where: { pipelineId } }),
      ...stages.map((stage) =>
        this.prisma.stage.create({
          data: {
            tenantId: pipeline.tenantId,
            pipelineId,
            name: stage.name,
            order: stage.order,
            probWin: stage.probWin ?? null,
            exitReasons: stage.exitReasons ? (stage.exitReasons as Prisma.JsonValue) : Prisma.JsonNull,
            slaHours: stage.slaHours ?? null
          }
        })
      )
    ]);

    await this.audit.log({
      orgId: pipeline.brokerageId ?? 'unknown',
      recordId: pipeline.id,
      object: 'pipeline_stage',
      action: AuditAction.UPDATE,
      diff: {
        count: stages.length,
        pipelineId
      }
    });
    return this.prisma.stage.findMany({ where: { pipelineId }, orderBy: { order: 'asc' } });
  }

  async upsertFieldSets(pipelineId: string, sets: FieldSetDto[]) {
    const pipeline = await this.prisma.pipeline.findUnique({ where: { id: pipelineId } });
    if (!pipeline) {
      throw new BadRequestException('Pipeline not found');
    }
    if (pipeline.status !== PipelineStatus.DRAFT) {
      throw new BadRequestException('Active/archived pipelines are immutable');
    }

    for (const fieldSet of sets) {
      compileJsonSchemaOrThrow(fieldSet.schema, `FieldSet:${fieldSet.target}`);
    }

    await this.prisma.$transaction([
      this.prisma.fieldSet.deleteMany({ where: { pipelineId } }),
      ...sets.map((fieldSet) =>
        this.prisma.fieldSet.create({
          data: {
            tenantId: pipeline.tenantId,
            pipelineId,
            target: fieldSet.target,
            schema: fieldSet.schema as any,
            uiSchema: (fieldSet.uiSchema ?? null) as any,
            visibility: (fieldSet.visibility ?? null) as any
          }
        })
      )
    ]);

    await this.audit.log({
      orgId: pipeline.brokerageId ?? 'unknown',
      recordId: pipeline.id,
      object: 'pipeline_fieldset',
      action: AuditAction.UPDATE,
      diff: {
        pipelineId,
        count: sets.length
      }
    });
    return this.prisma.fieldSet.findMany({ where: { pipelineId } });
  }

  async upsertAutomations(pipelineId: string, autos: AutomationDto[]) {
    const pipeline = await this.prisma.pipeline.findUnique({ where: { id: pipelineId } });
    if (!pipeline) {
      throw new BadRequestException('Pipeline not found');
    }
    if (pipeline.status !== PipelineStatus.DRAFT) {
      throw new BadRequestException('Active/archived pipelines are immutable');
    }

    autos.forEach((automation) => validateAutomationPayload(automation));

    await this.prisma.$transaction([
      this.prisma.pipelineAutomation.deleteMany({ where: { pipelineId } }),
      ...autos.map((automation) =>
        this.prisma.pipelineAutomation.create({
          data: {
            tenantId: pipeline.tenantId,
            pipelineId,
            trigger: automation.trigger as any,
            actions: automation.actions as any,
            isEnabled: automation.isEnabled ?? true
          }
        })
      )
    ]);

    await this.audit.log({
      orgId: pipeline.brokerageId ?? 'unknown',
      recordId: pipeline.id,
      object: 'pipeline_automation',
      action: AuditAction.UPDATE,
      diff: {
        pipelineId,
        count: autos.length
      }
    });
    return this.prisma.pipelineAutomation.findMany({ where: { pipelineId } });
  }

  async publish(id: string, dto: PublishDto) {
    const draft = await this.prisma.pipeline.findUnique({
      where: { id },
      include: { stages: true, fieldSets: true, automations: true }
    });
    if (!draft) {
      throw new BadRequestException('Pipeline not found');
    }
    if (draft.status !== PipelineStatus.DRAFT) {
      throw new BadRequestException('Only drafts can be published');
    }
    if (draft.stages.length === 0) {
      throw new BadRequestException('Cannot publish without stages');
    }

    const scopedId = draft.brokerageId ?? draft.tenantId;
    const maxVersion = await this.prisma.pipeline.aggregate({
      where: { tenantId: draft.tenantId, name: draft.name },
      _max: { version: true }
    });

    const nextVersion = (maxVersion._max.version ?? 0) + 1;

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.pipeline.updateMany({
        where: {
          tenantId: draft.tenantId,
          name: draft.name,
          status: PipelineStatus.ACTIVE
        },
        data: { status: PipelineStatus.ARCHIVED }
      });

      return tx.pipeline.update({
        where: { id },
        data: {
          status: PipelineStatus.ACTIVE,
          version: nextVersion,
          brokerageId: scopedId,
          isDefault: Boolean(dto.setDefault)
        }
      });
    });

    await this.audit.log({
      orgId: scopedId ?? 'unknown',
      recordId: draft.id,
      object: 'pipeline',
      action: AuditAction.UPDATE,
      diff: {
        before: {
          status: draft.status,
          version: draft.version,
          isDefault: draft.isDefault
        },
        after: {
          status: PipelineStatus.ACTIVE,
          version: nextVersion,
          isDefault: Boolean(dto.setDefault)
        }
      }
    });

    this.analytics.emit('pipeline.published', {
      brokerageId: scopedId ?? null,
      pipelineId: id,
      version: nextVersion
    });

    return result;
  }

  async enqueueMigration(pipelineId: string, dto: MigrationDto) {
    const pipeline = await this.prisma.pipeline.findUnique({ where: { id: pipelineId } });
    if (!pipeline || pipeline.status !== PipelineStatus.ACTIVE) {
      throw new BadRequestException('Pipeline must be active to migrate leads');
    }

    await this.queue.add(
      'migrate-leads',
      {
        pipelineId,
        mappings: dto.mappings,
        previewOnly: Boolean(dto.previewOnly)
      },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 3600, count: 100 },
        removeOnFail: { age: 24 * 3600, count: 100 }
      }
    );
    await this.audit.log({
      orgId: pipeline.brokerageId ?? 'unknown',
      recordId: pipeline.id,
      object: 'pipeline_migration',
      action: AuditAction.UPDATE,
      diff: {
        mappings: dto.mappings,
        previewOnly: Boolean(dto.previewOnly)
      }
    });
    return { enqueued: true };
  }
}
