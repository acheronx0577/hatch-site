import { Controller, Get, Post, Patch, Delete, Param, Req, Body, Res, Query, UseGuards } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { resolveRequestContext } from '../common/request-context';
import { PipelineBoardService } from './pipeline-board.service';

@Controller('pipelines/:pipelineId/board')
@UseGuards(JwtAuthGuard)
export class PipelineBoardController {
  constructor(private readonly board: PipelineBoardService) {}

  @Get('columns')
  async columns(
    @Param('pipelineId') pipelineId: string,
    @Req() req: FastifyRequest,
    @Query('filters') filters?: string
  ) {
    const ctx = resolveRequestContext(req);
    return this.board.getColumns(ctx.tenantId, pipelineId, filters);
  }

  @Get('stages/:stageId/cards')
  async cards(
    @Param('pipelineId') pipelineId: string,
    @Param('stageId') stageId: string,
    @Req() req: FastifyRequest,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('filters') filters?: string
  ) {
    const ctx = resolveRequestContext(req);
    return this.board.getStageCards(ctx.tenantId, pipelineId, stageId, {
      limit: limit ? Number(limit) : undefined,
      cursor: cursor ?? undefined,
      filters
    });
  }

  @Get('stages/:stageId/metrics')
  async metrics(
    @Param('pipelineId') pipelineId: string,
    @Param('stageId') stageId: string,
    @Req() req: FastifyRequest,
    @Query('filters') filters?: string
  ) {
    const ctx = resolveRequestContext(req);
    return this.board.getStageMetrics(ctx.tenantId, pipelineId, stageId, filters);
  }

  @Get('views')
  async listViews(@Param('pipelineId') pipelineId: string) {
    return this.board.listViews(pipelineId);
  }

  @Post('views')
  async createView(
    @Param('pipelineId') pipelineId: string,
    @Body() body: { name: string; filters?: unknown; isDefault?: boolean }
  ) {
    return this.board.createView(pipelineId, {
      name: body.name,
      filters: body.filters ?? {},
      isDefault: body.isDefault ?? false
    });
  }

  @Patch('views/:viewId')
  async updateView(
    @Param('pipelineId') pipelineId: string,
    @Param('viewId') viewId: string,
    @Body() body: { name?: string; filters?: unknown; isDefault?: boolean }
  ) {
    return this.board.updateView(pipelineId, viewId, body);
  }

  @Delete('views/:viewId')
  async deleteView(@Param('pipelineId') pipelineId: string, @Param('viewId') viewId: string) {
    await this.board.deleteView(pipelineId, viewId);
    return { success: true };
  }

  @Post('views/:viewId/default')
  async setDefault(@Param('pipelineId') pipelineId: string, @Param('viewId') viewId: string) {
    return this.board.setDefaultView(pipelineId, viewId);
  }

  @Get('stream')
  async stream(
    @Param('pipelineId') pipelineId: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply
  ) {
    resolveRequestContext(req); // ensure headers validated
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
    if (origin) {
      reply.raw.setHeader('Access-Control-Allow-Origin', origin);
      reply.raw.setHeader('Vary', 'Origin');
    }
    reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.write('\n');
    req.raw.on('close', () => {
      reply.raw.end();
    });
    return reply;
  }
}
