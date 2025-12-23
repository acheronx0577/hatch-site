import { Body, Controller, ForbiddenException, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { RolesGuard } from '@/auth/roles.guard';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { CreateAgentInviteDto } from './dto/create-agent-invite.dto';
import { UpdateAgentPortalConfigDto } from './dto/update-agent-portal-config.dto';
import { OrganizationsService } from './organizations.service';

interface AuthedRequest {
  user?: { userId?: string; orgId?: string };
}

@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard('broker'))
  async create(@Req() req: AuthedRequest, @Body() dto: CreateOrganizationDto) {
    const userId = req.user?.userId;
    if (!userId) {
      // JwtAuthGuard enforces auth; this is a type guard
      throw new Error('Missing user context');
    }
    return this.orgs.createOrganizationForBroker(userId, dto);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  async my(@Req() req: AuthedRequest) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new Error('Missing user context');
    }
    return this.orgs.getOrganizationsForUser(userId);
  }

  @Post(':orgId/invites')
  @UseGuards(JwtAuthGuard, RolesGuard('broker'))
  async createInvite(
    @Param('orgId') orgId: string,
    @Req() req: AuthedRequest,
    @Body() dto: CreateAgentInviteDto
  ) {
    const userId = req.user?.userId;
    if (!userId) throw new Error('Missing user context');
    const { invite, signupUrl } = await this.orgs.createAgentInvite(orgId, userId, dto);
    return {
      id: invite.id,
      email: invite.email,
      status: invite.status,
      organizationId: invite.organizationId,
      invitedByUserId: invite.invitedByUserId,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
      signupUrl,
      // Returning token here is acceptable for broker to integrate email sending.
      token: invite.token
    };
  }

  @Get(':orgId/invites')
  @UseGuards(JwtAuthGuard, RolesGuard('broker'))
  async listInvites(@Param('orgId') orgId: string, @Req() req: AuthedRequest) {
    const userId = req.user?.userId;
    if (!userId) throw new Error('Missing user context');
    const invites = await this.orgs.getOrgInvites(orgId, userId);
    return invites.map((i) => ({
      id: i.id,
      email: i.email,
      status: i.status,
      organizationId: i.organizationId,
      invitedByUserId: i.invitedByUserId,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt
    }));
  }

  @Post(':orgId/invites/:inviteId/resend')
  @UseGuards(JwtAuthGuard, RolesGuard('broker'))
  async resendInvite(
    @Param('orgId') orgId: string,
    @Param('inviteId') inviteId: string,
    @Req() req: AuthedRequest
  ) {
    const userId = req.user?.userId;
    if (!userId) throw new Error('Missing user context');
    const { invite, signupUrl } = await this.orgs.resendAgentInvite(orgId, userId, inviteId);
    return {
      id: invite.id,
      email: invite.email,
      status: invite.status,
      organizationId: invite.organizationId,
      invitedByUserId: invite.invitedByUserId,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
      signupUrl,
      token: invite.token
    };
  }

  @Post(':orgId/invites/:inviteId/revoke')
  @UseGuards(JwtAuthGuard, RolesGuard('broker'))
  async revokeInvite(
    @Param('orgId') orgId: string,
    @Param('inviteId') inviteId: string,
    @Req() req: AuthedRequest
  ) {
    const userId = req.user?.userId;
    if (!userId) throw new Error('Missing user context');
    const invite = await this.orgs.revokeAgentInvite(orgId, userId, inviteId);
    return {
      id: invite.id,
      email: invite.email,
      status: invite.status,
      organizationId: invite.organizationId,
      invitedByUserId: invite.invitedByUserId,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt
    };
  }

  @Get(':orgId/agent-portal-config')
  @UseGuards(JwtAuthGuard, RolesGuard('broker', 'agent', 'team_lead'))
  async getAgentPortalConfig(@Param('orgId') orgId: string, @Req() req: AuthedRequest) {
    const userId = req.user?.userId;
    if (!userId) throw new Error('Missing user context');
    const tokenOrgId = req.user?.orgId;
    if (tokenOrgId && tokenOrgId !== orgId) {
      throw new ForbiddenException('Organization mismatch');
    }
    return this.orgs.getAgentPortalConfig(orgId, userId);
  }

  @Put(':orgId/agent-portal-config')
  @UseGuards(JwtAuthGuard, RolesGuard('broker'))
  async upsertAgentPortalConfig(
    @Param('orgId') orgId: string,
    @Req() req: AuthedRequest,
    @Body() dto: UpdateAgentPortalConfigDto
  ) {
    const userId = req.user?.userId;
    if (!userId) throw new Error('Missing user context');
    const tokenOrgId = req.user?.orgId;
    if (tokenOrgId && tokenOrgId !== orgId) {
      throw new ForbiddenException('Organization mismatch');
    }
    return this.orgs.upsertAgentPortalConfig(orgId, userId, dto);
  }
}
