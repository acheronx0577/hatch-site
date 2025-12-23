import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { AgentPerformanceAnalyticsService } from './agent-performance-analytics.service';

@ApiTags('agent-performance-analytics')
@ApiBearerAuth()
@Controller('agents')
@UseGuards(JwtAuthGuard)
export class AgentPerformanceAnalyticsController {
  constructor(private readonly analytics: AgentPerformanceAnalyticsService) {}

  @Get(':agentId/performance')
  performance(@Param('agentId') agentId: string, @Query('range') range?: string) {
    return this.analytics.getPerformance(agentId, range);
  }

  @Get(':agentId/pipeline')
  pipeline(@Param('agentId') agentId: string) {
    return this.analytics.getPipeline(agentId);
  }

  @Get(':agentId/ranking')
  ranking(@Param('agentId') agentId: string, @Query('range') range?: string) {
    return this.analytics.getRanking(agentId, range);
  }
}

