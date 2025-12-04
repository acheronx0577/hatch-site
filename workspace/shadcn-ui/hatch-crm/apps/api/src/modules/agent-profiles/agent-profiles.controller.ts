import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { RolesGuard } from '@/auth/roles.guard';
import { AgentProfilesService } from './agent-profiles.service';
import { UpsertAgentProfileDto } from './dto/upsert-agent-profile.dto';
import { UpdateAgentComplianceDto } from './dto/update-agent-compliance.dto';
import { InviteAgentDto } from './dto/invite-agent.dto';

interface AuthedRequest { user?: { userId?: string } }

@ApiTags('agent-profiles')
@ApiBearerAuth()
@Controller('organizations/:orgId/agents')
export class AgentProfilesController {
  constructor(private readonly svc: AgentProfilesService) {}

  @Post('profile')
  @UseGuards(JwtAuthGuard, RolesGuard('broker'))
  upsert(@Param('orgId') orgId: string, @Req() req: AuthedRequest, @Body() dto: UpsertAgentProfileDto) {
    const userId = req.user?.userId;
    if (!userId) throw new Error('Missing user context');
    return this.svc.upsertAgentProfile(orgId, userId, dto);
  }

  @Post('invite')
  @UseGuards(JwtAuthGuard, RolesGuard('broker'))
  invite(@Param('orgId') orgId: string, @Req() req: AuthedRequest, @Body() dto: InviteAgentDto) {
    const userId = req.user?.userId;
    if (!userId) throw new Error('Missing user context');
    return this.svc.inviteAgent(orgId, userId, dto);
  }

  @Patch('profile/:agentProfileId/compliance')
  @UseGuards(JwtAuthGuard, RolesGuard('broker'))
  updateCompliance(
    @Param('orgId') orgId: string,
    @Param('agentProfileId') agentProfileId: string,
    @Req() req: AuthedRequest,
    @Body() dto: UpdateAgentComplianceDto
  ) {
    const userId = req.user?.userId;
    if (!userId) throw new Error('Missing user context');
    return this.svc.updateAgentCompliance(orgId, userId, agentProfileId, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard('broker'))
  list(@Param('orgId') orgId: string, @Req() req: AuthedRequest) {
    const userId = req.user?.userId;
    if (!userId) throw new Error('Missing user context');
    return this.svc.listAgentProfilesForOrg(orgId, userId);
  }

  @Get('profile/:agentProfileId')
  @UseGuards(JwtAuthGuard)
  get(@Param('orgId') orgId: string, @Param('agentProfileId') agentProfileId: string, @Req() req: AuthedRequest) {
    const userId = req.user?.userId;
    if (!userId) throw new Error('Missing user context');
    return this.svc.getAgentProfile(orgId, userId, agentProfileId);
  }
}
