import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AgentInviteStatus, OrgEventType, Prisma, UserRole } from '@hatch/db';
import { randomUUID } from 'crypto';
import { OrgEventsService } from '../org-events/org-events.service';
import { MailService } from '../mail/mail.service';
import { CognitoService } from '../auth/cognito.service';

import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';

const DEFAULT_AGENT_ALLOWED_PATHS = ['/broker/crm', '/broker/contracts', '/broker/transactions'] as const;
const DEFAULT_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: OrgEventsService,
    private readonly mail: MailService,
    private readonly cognito: CognitoService
  ) {}

  private isMissingSchemaError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2021' || error.code === 'P2022' || error.code === '42P01')
    );
  }

  async createOrganizationForBroker(userId: string, dto: CreateOrganizationDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.role !== UserRole.BROKER) {
      throw new ForbiddenException('Only brokers can create organizations');
    }

    const org = await this.prisma.organization.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        createdByUserId: userId
      }
    });

    await this.prisma.userOrgMembership.create({
      data: {
        userId: userId,
        orgId: org.id,
        isOrgAdmin: true
      }
    });

    try {
      await this.events.logOrgEvent({
        organizationId: org.id,
        actorId: userId,
        type: OrgEventType.ORG_CREATED,
        message: 'Organization created by broker',
        payload: { organizationId: org.id, name: org.name, createdByUserId: userId }
      });
    } catch {}

    return org;
  }

  async getOrganizationsForUser(userId: string) {
    const memberships = await this.prisma.userOrgMembership.findMany({
      where: { userId },
      include: { org: true }
    });
    return memberships.map((m) => m.org);
  }

  private async ensureBrokerInOrg(orgId: string, brokerUserId: string, requireAdmin = false) {
    const [user, org, membership] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: brokerUserId } }),
      this.prisma.organization.findUnique({ where: { id: orgId } }),
      this.prisma.userOrgMembership.findUnique({ where: { userId_orgId: { userId: brokerUserId, orgId } } })
    ]);
    if (!user) throw new NotFoundException('User not found');
    if (!org) throw new NotFoundException('Organization not found');
    if (user.role !== UserRole.BROKER) throw new ForbiddenException('Only brokers can manage invites');
    if (!membership) throw new ForbiddenException('User is not a member of this organization');
    if (requireAdmin && !membership.isOrgAdmin) throw new ForbiddenException('Admin rights required');
    return { user, org, membership };
  }

  private normalizeInviteExpiry(expiresAt?: string) {
    const fallback = new Date(Date.now() + DEFAULT_INVITE_TTL_MS);
    if (!expiresAt) return fallback;
    const parsed = new Date(expiresAt);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
  }

  async createAgentInvite(orgId: string, brokerUserId: string, dto: { email: string; expiresAt?: string }) {
    const { org, user: broker } = await this.ensureBrokerInOrg(orgId, brokerUserId);

    if (!dto.email || !dto.email.includes('@')) {
      throw new BadRequestException('A valid email is required');
    }

    const email = dto.email.toLowerCase().trim();
    const expiresAt = this.normalizeInviteExpiry(dto.expiresAt);
    const now = new Date();

    const existingPending = await this.prisma.agentInvite.findFirst({
      where: {
        organizationId: orgId,
        email,
        status: AgentInviteStatus.PENDING
      },
      orderBy: { createdAt: 'desc' }
    });

    if (existingPending && existingPending.expiresAt.getTime() < now.getTime()) {
      await this.prisma.agentInvite.update({
        where: { id: existingPending.id },
        data: { status: AgentInviteStatus.EXPIRED }
      });
    }

    const token = randomUUID();

    const invite = existingPending && existingPending.expiresAt.getTime() >= now.getTime()
      ? await this.prisma.agentInvite.update({
          where: { id: existingPending.id },
          data: {
            token,
            invitedByUserId: brokerUserId,
            expiresAt,
            status: AgentInviteStatus.PENDING
          }
        })
      : await this.prisma.agentInvite.create({
          data: {
            organizationId: orgId,
            email,
            token,
            status: AgentInviteStatus.PENDING,
            invitedByUserId: brokerUserId,
            expiresAt
          }
        });

    // Generate Cognito signup URL with invite token embedded in state
    const signupUrl = this.cognito.generateSignupUrl(invite.token, invite.email, '/portal');

    // Send invite email
    const brokerName = broker.firstName && broker.lastName ? `${broker.firstName} ${broker.lastName}` : broker.email;
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: system-ui, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; }
          .button { display: inline-block; background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: 600; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          .org-name { font-weight: 600; color: #667eea; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">You've Been Invited!</h1>
          </div>
          <div class="content">
            <p>Hi there,</p>
            <p><strong>${brokerName}</strong> from <span class="org-name">${org.name}</span> has invited you to join their team on Hatch CRM.</p>
            <p>Hatch CRM is a powerful real estate CRM platform designed to help agents manage leads, properties, and clients all in one place.</p>
            <p>Click the button below to create your account and get started:</p>
            <div style="text-align: center;">
              <a href="${signupUrl}" class="button">Accept Invitation &amp; Sign Up</a>
            </div>
            <p style="font-size: 14px; color: #666;">This invitation will expire on ${expiresAt.toLocaleDateString()}.</p>
            <p style="font-size: 12px; color: #999; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
              If you didn't expect this invitation, you can safely ignore this email.
            </p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Hatch CRM. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      await this.mail.sendMail({
        to: invite.email,
        subject: `${broker.firstName || 'Someone'} invited you to join ${org.name} on Hatch CRM`,
        html: emailHtml
      });
      this.logger.log(`Invite email sent to ${invite.email} for org ${org.name}`);
    } catch (error) {
      this.logger.error(`Failed to send invite email to ${invite.email}`, error);
      // Don't fail the invite creation if email fails
    }

    // Log the event
    try {
      await this.events.logOrgEvent({
        organizationId: orgId,
        actorId: brokerUserId,
        type: OrgEventType.AGENT_INVITE_CREATED,
        message: `Agent invite created for ${invite.email}`,
        payload: { inviteId: invite.id, email: invite.email, invitedByUserId: brokerUserId, expiresAt }
      });
    } catch {}

    return { invite, signupUrl };
  }

  async getOrgInvites(orgId: string, brokerUserId: string) {
    await this.ensureBrokerInOrg(orgId, brokerUserId);
    const now = new Date();
    await this.prisma.agentInvite.updateMany({
      where: {
        organizationId: orgId,
        status: AgentInviteStatus.PENDING,
        expiresAt: { lt: now }
      },
      data: { status: AgentInviteStatus.EXPIRED }
    });
    return this.prisma.agentInvite.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async resendAgentInvite(orgId: string, brokerUserId: string, inviteId: string) {
    const { org, user: broker } = await this.ensureBrokerInOrg(orgId, brokerUserId);

    const invite = await this.prisma.agentInvite.findUnique({
      where: { id: inviteId }
    });
    if (!invite || invite.organizationId !== orgId) {
      throw new NotFoundException('Invite not found');
    }
    if (invite.status !== AgentInviteStatus.PENDING) {
      throw new BadRequestException('Only pending invites can be resent');
    }

    const next = await this.prisma.agentInvite.update({
      where: { id: invite.id },
      data: {
        token: randomUUID(),
        invitedByUserId: brokerUserId,
        expiresAt: new Date(Date.now() + DEFAULT_INVITE_TTL_MS)
      }
    });

    const signupUrl = this.cognito.generateSignupUrl(next.token, next.email, '/portal');

    const brokerName = broker.firstName && broker.lastName ? `${broker.firstName} ${broker.lastName}` : broker.email;
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: system-ui, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; }
          .button { display: inline-block; background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
          .org-name { color: #667eea; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>You're Invited!</h1>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p><strong>${brokerName}</strong> from <span class="org-name">${org.name}</span> is resending your invitation to join Hatch CRM.</p>
            <p>Click the button below to create your account and get started:</p>
            <div style="text-align: center;">
              <a href="${signupUrl}" class="button">Accept Invitation &amp; Sign Up</a>
            </div>
            <p style="font-size: 14px; color: #666;">This invitation will expire on ${next.expiresAt.toLocaleDateString()}.</p>
            <p style="font-size: 12px; color: #999; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
              If you didn't expect this invitation, you can safely ignore this email.
            </p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Hatch CRM. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      await this.mail.sendMail({
        to: next.email,
        subject: `${broker.firstName || 'Someone'} resent your invitation to join ${org.name} on Hatch CRM`,
        html: emailHtml
      });
      this.logger.log(`Invite email resent to ${next.email} for org ${org.name}`);
    } catch (error) {
      this.logger.error(`Failed to resend invite email to ${next.email}`, error);
    }

    try {
      await this.events.logOrgEvent({
        organizationId: orgId,
        actorId: brokerUserId,
        type: OrgEventType.AGENT_INVITE_CREATED,
        message: `Agent invite resent for ${next.email}`,
        payload: { inviteId: next.id, email: next.email, invitedByUserId: brokerUserId, expiresAt: next.expiresAt }
      });
    } catch {}

    return { invite: next, signupUrl };
  }

  async revokeAgentInvite(orgId: string, brokerUserId: string, inviteId: string) {
    await this.ensureBrokerInOrg(orgId, brokerUserId);

    const invite = await this.prisma.agentInvite.findUnique({ where: { id: inviteId } });
    if (!invite || invite.organizationId !== orgId) {
      throw new NotFoundException('Invite not found');
    }

    if (invite.status !== AgentInviteStatus.PENDING) {
      throw new BadRequestException('Only pending invites can be revoked');
    }

    const updated = await this.prisma.agentInvite.update({
      where: { id: invite.id },
      data: { status: AgentInviteStatus.REVOKED }
    });

    try {
      await this.events.logOrgEvent({
        organizationId: orgId,
        actorId: brokerUserId,
        type: OrgEventType.AGENT_INVITE_CREATED,
        message: `Agent invite revoked for ${updated.email}`,
        payload: { inviteId: updated.id, email: updated.email, invitedByUserId: brokerUserId }
      });
    } catch {}

    return updated;
  }

  private normalizeAllowedPaths(paths: unknown): string[] {
    if (!Array.isArray(paths)) return [];
    const normalized = paths
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value.startsWith('/broker/') && !value.startsWith('//') && !value.includes('..') && !value.includes('\\'));
    return Array.from(new Set(normalized));
  }

  private normalizeLandingPath(landingPath: unknown, allowedPaths: string[]): string {
    const candidate = typeof landingPath === 'string' ? landingPath.trim() : '';
    if (candidate && allowedPaths.includes(candidate)) {
      return candidate;
    }
    return allowedPaths[0] ?? DEFAULT_AGENT_ALLOWED_PATHS[0];
  }

  private async ensureUserInOrg(orgId: string, userId: string) {
    const [user, org, membership] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.organization.findUnique({ where: { id: orgId } }),
      this.prisma.userOrgMembership.findUnique({ where: { userId_orgId: { userId, orgId } } })
    ]);
    if (!user) throw new NotFoundException('User not found');
    if (!org) throw new NotFoundException('Organization not found');
    if (!membership) throw new ForbiddenException('User is not a member of this organization');
    return { user, org, membership };
  }

  async getAgentPortalConfig(orgId: string, userId: string) {
    await this.ensureUserInOrg(orgId, userId);

    let config: { allowedPaths: string[]; landingPath: string | null; createdAt: Date; updatedAt: Date } | null = null;
    try {
      config = await this.prisma.agentPortalConfig.findUnique({
        where: { organizationId: orgId }
      });
    } catch (error) {
      if (!this.isMissingSchemaError(error)) {
        throw error;
      }
      // Allow older DBs (or local dev) to function without this optional table.
      this.logger.warn(`AgentPortalConfig table missing; returning defaults for orgId=${orgId}`);
    }

    const allowedPaths =
      config && Array.isArray(config.allowedPaths) && config.allowedPaths.length > 0
        ? this.normalizeAllowedPaths(config.allowedPaths)
        : [...DEFAULT_AGENT_ALLOWED_PATHS];

    if (allowedPaths.length === 0) {
      allowedPaths.push(...DEFAULT_AGENT_ALLOWED_PATHS);
    }

    return {
      organizationId: orgId,
      allowedPaths,
      landingPath: config ? this.normalizeLandingPath(config.landingPath, allowedPaths) : allowedPaths[0],
      createdAt: config?.createdAt ?? null,
      updatedAt: config?.updatedAt ?? null,
      isDefault: !config
    };
  }

  async upsertAgentPortalConfig(
    orgId: string,
    brokerUserId: string,
    dto: { allowedPaths: string[]; landingPath?: string }
  ) {
    await this.ensureBrokerInOrg(orgId, brokerUserId);

    const allowedPaths = this.normalizeAllowedPaths(dto.allowedPaths);
    if (allowedPaths.length === 0) {
      throw new BadRequestException('At least one agent portal path must be enabled');
    }

    const landingPath = this.normalizeLandingPath(dto.landingPath, allowedPaths);

    let config: { organizationId: string; allowedPaths: string[]; landingPath: string | null; createdAt: Date; updatedAt: Date };
    try {
      config = await this.prisma.agentPortalConfig.upsert({
        where: { organizationId: orgId },
        create: {
          organizationId: orgId,
          allowedPaths,
          landingPath
        },
        update: {
          allowedPaths,
          landingPath
        }
      });
    } catch (error) {
      if (this.isMissingSchemaError(error)) {
        throw new ServiceUnavailableException(
          'Agent portal config storage is unavailable on this database. Apply migrations and try again.'
        );
      }
      throw error;
    }

    return {
      organizationId: config.organizationId,
      allowedPaths: config.allowedPaths,
      landingPath: this.normalizeLandingPath(config.landingPath, config.allowedPaths),
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
      isDefault: false
    };
  }
}
