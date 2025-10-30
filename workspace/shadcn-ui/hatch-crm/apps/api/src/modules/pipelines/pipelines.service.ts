import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Pipeline, Prisma, Stage } from '@hatch/db';

import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_PIPELINES: Array<{
  name: string;
  type: string;
  stages: Array<{ name: string; slaMinutes?: number | null }>;
}> = [
  {
    name: 'Buyer',
    type: 'buyer',
    stages: [
      { name: 'New', slaMinutes: 60 },
      { name: 'Engaged', slaMinutes: 240 },
      { name: 'Qualified', slaMinutes: 720 },
      { name: 'Showing', slaMinutes: 1440 },
      { name: 'Offer' },
      { name: 'Under Contract' },
      { name: 'Closed' },
      { name: 'Nurture', slaMinutes: null }
    ]
  },
  {
    name: 'Seller',
    type: 'seller',
    stages: [
      { name: 'New', slaMinutes: 60 },
      { name: 'Discovery', slaMinutes: 240 },
      { name: 'Pre-List', slaMinutes: 720 },
      { name: 'Active Listing' },
      { name: 'Under Contract' },
      { name: 'Closed' },
      { name: 'Nurture', slaMinutes: null }
    ]
  }
];

type PipelineWithStages = Prisma.PipelineGetPayload<{
  include: { stages: { orderBy: { order: 'asc' } } };
}>;

@Injectable()
export class PipelinesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string): Promise<PipelineWithStages[]> {
    await this.ensureDefaultPipelines(tenantId);
    return this.prisma.pipeline.findMany({
      where: { tenantId },
      orderBy: { order: 'asc' },
      include: {
        stages: {
          orderBy: { order: 'asc' }
        }
      }
    });
  }

  async reorderStages(
    tenantId: string,
    pipelineId: string,
    stageIds: string[]
  ): Promise<PipelineWithStages> {
    const pipeline = await this.prisma.pipeline.findUnique({
      where: { id: pipelineId },
      include: { stages: true }
    });
    if (!pipeline || pipeline.tenantId !== tenantId) {
      throw new NotFoundException('Pipeline not found');
    }

    const stageIdSet = new Set(pipeline.stages.map((stage) => stage.id));
    if (stageIds.length !== pipeline.stages.length) {
      throw new BadRequestException('stageIds must include every stage in the pipeline');
    }
    for (const stageId of stageIds) {
      if (!stageIdSet.has(stageId)) {
        throw new BadRequestException(`Stage ${stageId} does not belong to this pipeline`);
      }
    }

    await this.prisma.$transaction(
      stageIds.map((stageId, index) =>
        this.prisma.stage.update({
          where: { id: stageId },
          data: { order: index }
        })
      )
    );

    return this.prisma.pipeline.findUniqueOrThrow({
      where: { id: pipelineId },
      include: {
        stages: {
          orderBy: { order: 'asc' }
        }
      }
    });
  }

  async updateStage(
    tenantId: string,
    stageId: string,
    dto: Partial<Pick<Stage, 'name' | 'order' | 'slaMinutes'>>
  ): Promise<Stage> {
    const stage = await this.prisma.stage.findUnique({
      where: { id: stageId },
      include: { pipeline: true }
    });
    if (!stage || stage.pipeline.tenantId !== tenantId) {
      throw new NotFoundException('Stage not found');
    }

    const data: Prisma.StageUpdateInput = {};
    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (dto.order !== undefined) {
      data.order = dto.order;
    }
    if (dto.slaMinutes !== undefined) {
      data.slaMinutes = dto.slaMinutes;
    }

    const updated = await this.prisma.stage.update({
      where: { id: stageId },
      data
    });

    return updated;
  }

  private async ensureDefaultPipelines(tenantId: string): Promise<void> {
    const existingPipelines = await this.prisma.pipeline.findMany({
      where: { tenantId },
      select: { id: true, name: true, order: true }
    });

    const existingNames = new Map(existingPipelines.map((pipeline) => [pipeline.name, pipeline]));
    let nextOrder =
      existingPipelines.length > 0
        ? Math.max(...existingPipelines.map((pipeline) => pipeline.order)) + 1
        : 0;

    const createOperations: Prisma.PrismaPromise<Pipeline>[] = [];
    for (const definition of DEFAULT_PIPELINES) {
      if (existingNames.has(definition.name)) continue;

      createOperations.push(
        this.prisma.pipeline.create({
          data: {
            tenantId,
            name: definition.name,
            type: definition.type,
            order: nextOrder++,
            stages: {
              create: definition.stages.map((stage, index) => ({
                name: stage.name,
                order: index,
                slaMinutes: stage.slaMinutes ?? null,
                tenantId
              }))
            }
          }
        })
      );
    }

    if (createOperations.length > 0) {
      await this.prisma.$transaction(createOperations);
    }
  }
}
