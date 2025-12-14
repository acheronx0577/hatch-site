import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { AgentPerformanceService } from './agent-performance.service'
import { JwtAuthGuard } from '@/auth/jwt-auth.guard'
import { RolesGuard } from '@/auth/roles.guard'

@Controller('organizations/:orgId/agent-performance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AgentPerformanceController {
  constructor(private readonly service: AgentPerformanceService) {}

  @Get()
  async list(
    @Param('orgId') orgId: string,
    @Query('agentProfileId') agentProfileId?: string,
  ) {
    return this.service.listSnapshots(orgId, agentProfileId)
  }

  @Post('generate')
  async generate(@Param('orgId') orgId: string) {
    await this.service.generateSnapshots(orgId)
    return { ok: true }
  }

  @Get('latest')
  async latest(@Param('orgId') orgId: string) {
    return this.service.latestByOrg(orgId)
  }
}
