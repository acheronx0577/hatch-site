import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { AgentInviteStatus, OrgEventType, UserRole } from '@hatch/db';
import { randomUUID } from 'crypto';
import { OrgEventsService } from '../org-events/org-events.service';
import { MailService } from '../mail/mail.service';
import { CognitoService } from '../auth/cognito.service';

import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: OrgEventsService,
    private readonly mail: MailService,
    private readonly cognito: CognitoService
  ) {}

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

  async createAgentInvite(orgId: string, brokerUserId: string, dto: { email: string; expiresAt?: string }) {
    const { org, user: broker } = await this.ensureBrokerInOrg(orgId, brokerUserId);

    if (!dto.email || !dto.email.includes('@')) {
      throw new BadRequestException('A valid email is required');
    }

    const token = randomUUID();
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invite = await this.prisma.agentInvite.create({
      data: {
        organizationId: orgId,
        email: dto.email.toLowerCase(),
        token,
        status: AgentInviteStatus.PENDING,
        invitedByUserId: brokerUserId,
        expiresAt
      }
    });

    // Generate Cognito signup URL with invite token embedded in state
    const signupUrl = this.cognito.generateSignupUrl(token, dto.email);

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
        to: dto.email,
        subject: `${broker.firstName || 'Someone'} invited you to join ${org.name} on Hatch CRM`,
        html: emailHtml
      });
      this.logger.log(`Invite email sent to ${dto.email} for org ${org.name}`);
    } catch (error) {
      this.logger.error(`Failed to send invite email to ${dto.email}`, error);
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

    return invite;
  }

  async getOrgInvites(orgId: string, brokerUserId: string) {
    await this.ensureBrokerInOrg(orgId, brokerUserId);
    return this.prisma.agentInvite.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' }
    });
  }
}
