import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { resolveRequestContext } from '../common/request-context';
import { PipelinesService } from './pipelines.service';
import { ReorderStagesDto } from './dto/reorder-stages.dto';
import { UpdateStageDto } from './dto/update-stage.dto';

@Controller('v1/pipelines')
export class PipelinesController {
  constructor(private readonly pipelines: PipelinesService) {}

  @Get()
  async listPipelines(@Req() req: FastifyRequest) {
    const ctx = resolveRequestContext(req);
    return this.pipelines.list(ctx.tenantId);
  }

  @Post(':pipelineId/stages/reorder')
  async reorderStages(
    @Param('pipelineId') pipelineId: string,
    @Body() dto: ReorderStagesDto,
    @Req() req: FastifyRequest
  ) {
    if (!dto.stageIds?.length) {
      throw new BadRequestException('stageIds is required');
    }
    const ctx = resolveRequestContext(req);
    return this.pipelines.reorderStages(ctx.tenantId, pipelineId, dto.stageIds);
  }

  @Patch('stages/:stageId')
  async updateStage(
    @Param('stageId') stageId: string,
    @Body() dto: UpdateStageDto,
    @Req() req: FastifyRequest
  ) {
    const ctx = resolveRequestContext(req);
    return this.pipelines.updateStage(ctx.tenantId, stageId, dto);
  }
}

