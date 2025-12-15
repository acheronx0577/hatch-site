import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { AgentLifecycleStage, AgentRiskLevel, UserRole, WorkflowTaskTrigger } from '@hatch/db';

import { PrismaService } from '../prisma/prisma.service';
import { OnboardingService } from '../onboarding/onboarding.service';
import { UpsertAgentProfileDto } from './dto/upsert-agent-profile.dto';
import { UpdateAgentComplianceDto } from './dto/update-agent-compliance.dto';
import { InviteAgentDto } from './dto/invite-agent.dto';
import { UpdateAgentProfileAdminDto } from './dto/update-agent-profile-admin.dto';
import sgMail from '@sendgrid/mail';

@Injectable()
export class AgentProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => OnboardingService))
    private readonly onboarding: OnboardingService
  ) {}

  private get sendgridConfigured(): boolean {
    return Boolean(process.env.SENDGRID_API_KEY);
  }

  private async assertUserInOrg(userId: string, orgId: string) {
    const member = await this.prisma.userOrgMembership.findUnique({
      where: { userId_orgId: { userId, orgId } }
    });
    if (!member) {
      throw new ForbiddenException('User is not part of this organization');
    }
    return member;
  }

  private async assertBrokerInOrg(userId: string, orgId: string) {
    const permissionsDisabled =
      (process.env.DISABLE_PERMISSIONS_GUARD ?? 'true').toLowerCase() === 'true' &&
      process.env.NODE_ENV !== 'production';
    if (permissionsDisabled) {
      return;
    }
    await this.assertUserInOrg(userId, orgId);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!user || user.role !== UserRole.BROKER) {
      throw new ForbiddenException('Only brokers can manage agent profiles');
    }
  }

  async inviteAgent(orgId: string, brokerUserId: string, dto: InviteAgentDto) {
    await this.assertBrokerInOrg(brokerUserId, orgId);

    const domain =
      process.env.COGNITO_DOMAIN ??
      process.env.VITE_COGNITO_DOMAIN ??
      process.env.NEXT_PUBLIC_COGNITO_DOMAIN ??
      null;
    const clientId =
      process.env.COGNITO_CLIENT_ID ??
      process.env.VITE_COGNITO_CLIENT_ID ??
      process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ??
      null;
    const redirectUri =
      process.env.COGNITO_REDIRECT_URI ??
      process.env.VITE_COGNITO_REDIRECT_URI ??
      process.env.NEXT_PUBLIC_COGNITO_REDIRECT_URI ??
      'http://localhost:5173';

    if (!domain || !clientId) {
      throw new BadRequestException(
        `Cognito configuration missing: domain=${Boolean(domain)}, clientId=${Boolean(clientId)}`
      );
    }

    const inviteLink = `${domain}/login?client_id=${clientId}&response_type=code&scope=email+openid+phone&redirect_uri=${encodeURIComponent(
      redirectUri
    )}`;

    if (!this.sendgridConfigured) {
      return {
        sent: false,
        reason: 'SENDGRID_API_KEY missing; skipping email send',
        inviteLink
      };
    }

    sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

    const fromDomain = process.env.EMAIL_SENDER_DOMAIN ?? 'hatch.test';
    const fromEmail = `invites@${fromDomain}`;

    const body = `
      <p>Hello ${dto.name},</p>
      <p>You have been invited to join Hatch as an agent. Click the link below to sign up and connect your account:</p>
      <p><a href="${inviteLink}">Join Hatch</a></p>
      <p>If you have a license, please have it ready:</p>
      <ul>
        <li>License number: ${dto.licenseNumber ?? '—'}</li>
        <li>License state: ${dto.licenseState ?? '—'}</li>
        <li>License expiry: ${dto.licenseExpiresAt ?? '—'}</li>
      </ul>
      <p>See you inside.</p>
    `;

    try {
      await sgMail.send({
        to: dto.email,
        from: { email: fromEmail, name: 'Hatch Invites' },
        subject: 'You’re invited to join Hatch',
        html: body
      });
      return { sent: true, inviteLink };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'SendGrid error';
      throw new BadRequestException(`Failed to send invite email: ${message}`);
    }
  }

  async upsertAgentProfile(orgId: string, brokerUserId: string, dto: UpsertAgentProfileDto) {
    await this.assertBrokerInOrg(brokerUserId, orgId);
    await this.assertUserInOrg(dto.userId, orgId);

    const tagsString = dto.tags?.length ? dto.tags.join(',') : undefined;
    const licenseExpiresAt = dto.licenseExpiresAt ? new Date(dto.licenseExpiresAt) : undefined;

    const data = {
      licenseNumber: dto.licenseNumber ?? undefined,
      licenseState: dto.licenseState ?? undefined,
      licenseExpiresAt,
      isCommercial: dto.isCommercial ?? undefined,
      isResidential: dto.isResidential ?? undefined,
      title: dto.title ?? undefined,
      bio: dto.bio ?? undefined,
      tags: tagsString
    };

    const profile = await this.prisma.agentProfile.upsert({
      where: { organizationId_userId: { organizationId: orgId, userId: dto.userId } },
      update: data,
      create: {
        organizationId: orgId,
        userId: dto.userId,
        ...data
      }
    });

    return profile;
  }

  async updateAgentCompliance(orgId: string, brokerUserId: string, agentProfileId: string, dto: UpdateAgentComplianceDto) {
    await this.assertBrokerInOrg(brokerUserId, orgId);
    const profile = await this.prisma.agentProfile.findUnique({ where: { id: agentProfileId } });
    if (!profile || profile.organizationId !== orgId) {
      throw new NotFoundException('Agent profile not found');
    }

    const updated = await this.prisma.agentProfile.update({
      where: { id: agentProfileId },
      data: {
        isCompliant: dto.isCompliant ?? undefined,
        requiresAction: dto.requiresAction ?? undefined,
        riskLevel: dto.riskLevel ? (dto.riskLevel as AgentRiskLevel) : undefined,
        riskScore: dto.riskScore ?? undefined,
        riskFlags: dto.riskFlags ? (dto.riskFlags as any) : undefined,
        ceCycleStartAt: dto.ceCycleStartAt ? new Date(dto.ceCycleStartAt) : undefined,
        ceCycleEndAt: dto.ceCycleEndAt ? new Date(dto.ceCycleEndAt) : undefined,
        ceHoursRequired: dto.ceHoursRequired ?? undefined,
        ceHoursCompleted: dto.ceHoursCompleted ?? undefined
      }
    });

    const ceIncomplete =
      (updated.ceHoursRequired ?? 0) > 0 &&
      (updated.ceHoursCompleted ?? 0) < (updated.ceHoursRequired ?? 0);
    if (ceIncomplete) {
      await this.onboarding.generateOffboardingTasksForAgent(
        orgId,
        updated.id,
        WorkflowTaskTrigger.CE_INCOMPLETE,
        `CE:${updated.id}`,
        brokerUserId
      );
    }

    const expiredMembership = await this.prisma.agentMembership.findFirst({
      where: { agentProfileId: updated.id, status: 'EXPIRED' }
    });
    if (expiredMembership) {
      await this.onboarding.generateOffboardingTasksForAgent(
        orgId,
        updated.id,
        WorkflowTaskTrigger.MEMBERSHIP_EXPIRED,
        `MEMBERSHIP:${expiredMembership.id}`,
        brokerUserId
      );
    }

    return updated;
  }

  async updateAgentProfileAdmin(orgId: string, brokerUserId: string, agentProfileId: string, dto: UpdateAgentProfileAdminDto) {
    await this.assertBrokerInOrg(brokerUserId, orgId);

    const profile = await this.prisma.agentProfile.findUnique({ where: { id: agentProfileId } });
    if (!profile || profile.organizationId !== orgId) {
      throw new NotFoundException('Agent profile not found');
    }

    const normalizeNullableId = (value: string | null | undefined) => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    };

    const nextLifecycleStage = dto.lifecycleStage
      ? (dto.lifecycleStage.toUpperCase() as AgentLifecycleStage)
      : undefined;

    if (dto.lifecycleStage) {
      const allowed = new Set(Object.values(AgentLifecycleStage));
      if (!allowed.has(nextLifecycleStage!)) {
        throw new BadRequestException('Invalid lifecycleStage');
      }
    }

    const sanitizedTags =
      dto.tags
        ?.map((tag) => tag.trim())
        .filter((tag) => tag.length > 0) ?? [];
    const tagsString = dto.tags !== undefined ? (sanitizedTags.length ? sanitizedTags.join(',') : null) : undefined;

    const updated = await this.prisma.agentProfile.update({
      where: { id: agentProfileId },
      data: {
        lifecycleStage: nextLifecycleStage,
        officeId: normalizeNullableId(dto.officeId),
        teamId: normalizeNullableId(dto.teamId),
        tags: tagsString
      }
    });

    if (nextLifecycleStage && nextLifecycleStage !== profile.lifecycleStage) {
      if (nextLifecycleStage === AgentLifecycleStage.ONBOARDING) {
        await this.onboarding.generateOnboardingTasksForAgent(
          orgId,
          updated.id,
          WorkflowTaskTrigger.MANUAL,
          `MANUAL:${updated.id}`,
          brokerUserId
        );
      } else if (nextLifecycleStage === AgentLifecycleStage.OFFBOARDING) {
        await this.onboarding.generateOffboardingTasksForAgent(
          orgId,
          updated.id,
          WorkflowTaskTrigger.MANUAL,
          `MANUAL:${updated.id}`,
          brokerUserId
        );
      }
    }

    return updated;
  }

  async listAgentProfilesForOrg(orgId: string, brokerUserId: string) {
    await this.assertBrokerInOrg(brokerUserId, orgId);
    return this.prisma.agentProfile.findMany({
      where: { organizationId: orgId },
      orderBy: { updatedAt: 'desc' },
      include: {
        user: true,
        memberships: true,
        trainingProgress: true,
        ceRecords: true
      }
    });
  }

  async getAgentProfile(orgId: string, requesterUserId: string, agentProfileId: string) {
    const profile = await this.prisma.agentProfile.findUnique({
      where: { id: agentProfileId },
      include: {
        user: true,
        memberships: true,
        trainingProgress: { include: { module: true } },
        ceRecords: true
      }
    });
    if (!profile || profile.organizationId !== orgId) {
      throw new NotFoundException('Agent profile not found');
    }

    if (profile.userId === requesterUserId) {
      await this.assertUserInOrg(requesterUserId, orgId);
      return profile;
    }

    await this.assertUserInOrg(requesterUserId, orgId);
    const requester = await this.prisma.user.findUnique({ where: { id: requesterUserId }, select: { role: true } });
    if (requester?.role !== UserRole.BROKER) {
      throw new ForbiddenException('Not authorized to view this profile');
    }
    return profile;
  }
}
