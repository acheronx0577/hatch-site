import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  NotFoundException
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { TokensService } from './tokens.service';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { RegisterConsumerDto } from './dto/register-consumer.dto';
import { LoginDto } from './dto/login.dto';
import { CognitoCallbackDto } from '../../modules/auth/dto/cognito-callback.dto';
import { CognitoService } from '../../modules/auth/cognito.service';
import { UserRole, AgentInviteStatus } from '@hatch/db';
import * as bcrypt from 'bcryptjs';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const ACCESS_TOKEN_COOKIE = 'access_token';
const REFRESH_TOKEN_COOKIE = 'refresh_token';

interface OidcRequest extends FastifyRequest {
  user?: {
    userId?: string;
    email?: string;
    name?: string;
  };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly tokens: TokensService,
    private readonly prisma: PrismaService,
    private readonly cognito: CognitoService
  ) {}

  private async ensureTenantForOrg(orgId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const tenant = await this.prisma.tenant.findFirst({ where: { organizationId: orgId } });
    if (tenant) {
      return tenant;
    }

    const derived = (org.name ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const slugBase = org.slug ?? (derived || 'org');
    const slug = `${slugBase}-${org.id.substring(0, 6)}`;

    return this.prisma.tenant.create({
      data: {
        organizationId: org.id,
        name: org.name,
        slug
      }
    });
  }

  private async acceptAgentInvite(
    invite: {
      id: string;
      organizationId: string;
      email: string;
      status: AgentInviteStatus;
      expiresAt?: Date | null;
      acceptedByUserId?: string | null;
    },
    normalizedEmail: string
  ) {
    if (invite.email.toLowerCase() !== normalizedEmail) {
      throw new BadRequestException('Authenticated email does not match invite email');
    }

    if (invite.status === AgentInviteStatus.REVOKED) {
      throw new BadRequestException('Invite has been revoked');
    }

    const now = new Date();
    if (invite.status === AgentInviteStatus.PENDING && invite.expiresAt && now > invite.expiresAt) {
      await this.prisma.agentInvite.update({
        where: { id: invite.id },
        data: { status: AgentInviteStatus.EXPIRED }
      });
      throw new BadRequestException('Invite has expired');
    }

    if (invite.status === AgentInviteStatus.EXPIRED) {
      throw new BadRequestException('Invite has expired');
    }

    let user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, role: true, tenantId: true, organizationId: true }
    });

    if (user) {
      const membership = await this.prisma.userOrgMembership.findUnique({
        where: { userId_orgId: { userId: user.id, orgId: invite.organizationId } }
      });

      if (!membership) {
        await this.prisma.userOrgMembership.create({
          data: {
            userId: user.id,
            orgId: invite.organizationId,
            isOrgAdmin: false
          }
        });
      }
    } else {
      const tenant = await this.ensureTenantForOrg(invite.organizationId);

      user = await this.prisma.user.create({
        data: {
          email: normalizedEmail,
          organizationId: invite.organizationId,
          tenantId: tenant.id,
          role: UserRole.AGENT,
          // No password hash - using Cognito auth only
          firstName: normalizedEmail.split('@')[0],
          lastName: ''
        },
        select: { id: true, email: true, role: true, tenantId: true, organizationId: true }
      });

      await this.prisma.userOrgMembership.create({
        data: {
          userId: user.id,
          orgId: invite.organizationId,
          isOrgAdmin: false
        }
      });

      await this.prisma.agentProfile.upsert({
        where: { organizationId_userId: { organizationId: invite.organizationId, userId: user.id } },
        update: {},
        create: {
          userId: user.id,
          organizationId: invite.organizationId
        }
      });
    }

    if (invite.status === AgentInviteStatus.PENDING) {
      await this.prisma.agentInvite.update({
        where: { id: invite.id },
        data: { status: AgentInviteStatus.ACCEPTED, acceptedByUserId: user.id }
      });
    } else if (invite.status === AgentInviteStatus.ACCEPTED && !invite.acceptedByUserId) {
      await this.prisma.agentInvite.update({
        where: { id: invite.id },
        data: { acceptedByUserId: user.id }
      });
    }

    return user;
  }

  private resolveCookieSecure(req: FastifyRequest): boolean {
    const override = (process.env.COOKIE_SECURE ?? '').trim().toLowerCase();
    if (override === 'true') return true;
    if (override === 'false') return false;

    const forwardedProto = req.headers['x-forwarded-proto'];
    const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
    if (typeof proto === 'string' && proto.length > 0) {
      return proto.split(',')[0].trim() === 'https';
    }

    const forwardedSsl = req.headers['x-forwarded-ssl'];
    const ssl = Array.isArray(forwardedSsl) ? forwardedSsl[0] : forwardedSsl;
    if (typeof ssl === 'string' && ssl.length > 0) {
      return ssl.toLowerCase() === 'on';
    }

    const anyReq = req as unknown as { protocol?: string };
    if (typeof anyReq.protocol === 'string') {
      return anyReq.protocol === 'https';
    }

    return Boolean((req.raw as any)?.socket?.encrypted);
  }

  private cookieOptions(req: FastifyRequest, maxAgeMs: number) {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.resolveCookieSecure(req),
      maxAge: maxAgeMs,
      path: '/'
    };
  }

  private isEmailLike(value: string): boolean {
    return value.includes('@');
  }

  private placeholderEmailForCognitoSub(cognitoSub: string): string {
    const domain = (process.env.COGNITO_PLACEHOLDER_EMAIL_DOMAIN ?? 'cognito.local').trim() || 'cognito.local';
    return `cognito+${cognitoSub}@${domain}`.toLowerCase();
  }

  private isCognitoAutoProvisionEnabled(): boolean {
    const configured = (process.env.COGNITO_AUTO_PROVISION ?? '').trim();
    if (configured) {
      return configured.toLowerCase() === 'true';
    }
    return process.env.NODE_ENV !== 'production';
  }

  private resolveCognitoAutoProvisionRole(): UserRole {
    const configured = (process.env.COGNITO_AUTO_PROVISION_ROLE ?? '').trim().toUpperCase();
    const roleFromEnv = (UserRole as Record<string, UserRole>)[configured];
    if (roleFromEnv) {
      return roleFromEnv;
    }
    // In local/dev we usually want a fully-featured account; prod should stay conservative.
    return process.env.NODE_ENV === 'production' ? UserRole.AGENT : UserRole.BROKER;
  }

  private normalizeRedirectTarget(value?: string | null) {
    if (!value) return '/portal';
    const trimmed = value.trim();
    if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
      return '/portal';
    }
    return trimmed;
  }

  @Get('login')
  login(@Query('redirect') redirectTo: string | undefined, @Res() reply: FastifyReply) {
    const normalized = this.normalizeRedirectTarget(redirectTo);
    if (!this.cognito.isConfigured()) {
      throw new BadRequestException('Cognito is not configured. Set COGNITO_DOMAIN, COGNITO_CLIENT_ID, and COGNITO_CALLBACK_URL.');
    }

    const url = this.cognito.generateLoginUrl(normalized);
    return reply.redirect(url, 302);
  }

  @Get('callback')
  @UseGuards(AuthGuard('oidc'))
  callback(@Req() req: OidcRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const userId = req.user?.userId;
    const email = req.user?.email;

    const accessToken = this.tokens.issueAccess({
      sub: userId,
      email
    });
    const refreshToken = this.tokens.issueRefresh({ sub: userId });

    reply.setCookie(REFRESH_TOKEN_COOKIE, refreshToken, this.cookieOptions(req, THIRTY_DAYS_MS));

    return {
      accessToken
    };
  }

  @Get('cognito/login')
  cognitoLogin(@Query('redirect') redirectTo: string | undefined, @Res() reply: FastifyReply) {
    const normalized = this.normalizeRedirectTarget(redirectTo);
    if (!this.cognito.isConfigured()) {
      throw new BadRequestException(
        'Cognito is not configured. Set COGNITO_DOMAIN, COGNITO_CLIENT_ID, and COGNITO_CALLBACK_URL.'
      );
    }
    const url = this.cognito.generateLoginUrl(normalized);
    return reply.redirect(url, 302);
  }

  @Post('refresh')
  async refresh(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const refreshToken = (req as any)?.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new UnauthorizedException('Missing refresh token');
    }

    let payload: any;
    try {
      payload = this.tokens.verifyRefresh(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const userId = typeof payload?.sub === 'string' ? payload.sub : null;
    if (!userId) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, tenantId: true, organizationId: true }
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const accessToken = this.tokens.issueAccess({
      sub: user.id,
      email: user.email,
      role: user.role,
      roles: [user.role.toLowerCase()],
      tenantId: user.tenantId,
      orgId: user.organizationId
    });

    reply.setCookie(ACCESS_TOKEN_COOKIE, accessToken, this.cookieOptions(req, FIFTEEN_MINUTES_MS));

    return { accessToken };
  }

  @Post('logout')
  logout(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const clearOptions = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.resolveCookieSecure(req),
      path: '/'
    };

    reply.clearCookie(ACCESS_TOKEN_COOKIE, clearOptions);
    reply.clearCookie(REFRESH_TOKEN_COOKIE, clearOptions);

    return { success: true };
  }

  @Post('register-consumer')
  async registerConsumer(@Body() dto: RegisterConsumerDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) {
      throw new BadRequestException('Email already in use');
    }

    const orgId = process.env.DEFAULT_ORG_ID ?? 'org-hatch';
    const tenantId = process.env.DEFAULT_TENANT_ID ?? 'tenant-hatch';

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        organizationId: orgId,
        tenantId: tenantId,
        role: UserRole.CONSUMER,
        passwordHash
      }
    });

    const accessToken = this.tokens.issueAccess({
      sub: user.id,
      email: user.email,
      role: user.role,
      roles: [user.role.toLowerCase()],
      tenantId: user.tenantId,
      orgId: user.organizationId
    });
    const refreshToken = this.tokens.issueRefresh({ sub: user.id });

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, role: user.role }
    };
  }

  @Post('login')
  async loginPassword(@Body() dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const accessToken = this.tokens.issueAccess({
      sub: user.id,
      email: user.email,
      role: user.role,
      roles: [user.role.toLowerCase()],
      tenantId: user.tenantId,
      orgId: user.organizationId
    });
    const refreshToken = this.tokens.issueRefresh({ sub: user.id });
    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, role: user.role }
    };
  }

  /**
   * Cognito callback handler for agent invite flow
   * Receives code and state from Cognito, extracts invite token from state,
   * creates user account and ties them to the inviting organization
   *
   * SECURITY TODOs for Production:
   * - Add rate limiting (e.g., @nestjs/throttler) to prevent abuse
   * - Implement CSRF protection via state parameter validation
   * - Add logging for failed attempts and suspicious activity
   * - Implement proper redirect to frontend with tokens in secure cookies
   * - Add IP-based rate limiting for invite acceptance
   * - Consider adding honeypot fields to detect bots
   */
  @Get('cognito/callback')
  async cognitoCallback(@Req() req: FastifyRequest, @Query() query: CognitoCallbackDto, @Res() reply: FastifyReply) {
    const { code, state, idToken, email, cognitoSub } = query;

    const decodedState = state ? this.cognito.decodeState(state) : {};
    const inviteToken = decodedState.inviteToken;
    const redirectTo = this.normalizeRedirectTarget(decodedState.redirectTo);

    // Exchange authorization code for tokens (if we have code instead of idToken)
    let userInfo: { sub: string; email: string } | null = null;
    if (idToken) {
      userInfo = await this.cognito.verifyToken(idToken);
    } else if (code) {
      const tokens = await this.cognito.exchangeCodeForTokens(code);
      if (!tokens) {
        throw new BadRequestException(
          'Cognito code exchange failed. Verify COGNITO_CLIENT_SECRET and COGNITO_CALLBACK_URL are set correctly.'
        );
      }
      if (tokens?.idToken) {
        userInfo = await this.cognito.verifyToken(tokens.idToken);
      } else {
        throw new BadRequestException('Cognito code exchange returned no ID token. Ensure COGNITO_SCOPES includes openid.');
      }
    }

    // Fallback to query params if token verification didn't work
    if (!userInfo && email && cognitoSub) {
      userInfo = { sub: cognitoSub, email };
    }

    if (!userInfo) {
      throw new BadRequestException('Could not extract user info from Cognito response');
    }

    const normalizedEmail = userInfo.email.toLowerCase();
    const placeholderEmail = this.placeholderEmailForCognitoSub(userInfo.sub);

    let user:
      | {
          id: string;
          email: string;
          role: UserRole;
          tenantId: string;
          organizationId: string;
        }
      | null = null;

    if (inviteToken) {
      const invite = await this.prisma.agentInvite.findUnique({
        where: { token: inviteToken },
        select: {
          id: true,
          organizationId: true,
          email: true,
          status: true,
          expiresAt: true,
          acceptedByUserId: true
        }
      });

      if (!invite) {
        throw new NotFoundException('Invite not found');
      }
      user = await this.acceptAgentInvite(invite, normalizedEmail);
    } else {
      const candidates = [normalizedEmail];
      if (placeholderEmail !== normalizedEmail) {
        candidates.push(placeholderEmail);
      }

      for (const emailCandidate of candidates) {
        user = await this.prisma.user.findUnique({
          where: { email: emailCandidate },
          select: { id: true, email: true, role: true, tenantId: true, organizationId: true }
        });
        if (user) {
          break;
        }
      }

      if (!user) {
        const pendingInvites = this.isEmailLike(normalizedEmail)
          ? await this.prisma.agentInvite.findMany({
              where: { email: normalizedEmail, status: AgentInviteStatus.PENDING },
              orderBy: { createdAt: 'desc' },
              take: 10,
              select: {
                id: true,
                organizationId: true,
                email: true,
                status: true,
                expiresAt: true,
                acceptedByUserId: true
              }
            })
          : [];

        const now = new Date();
        const validInvites = pendingInvites.filter((invite) => (invite.expiresAt ? invite.expiresAt > now : true));
        const expiredInviteIds = pendingInvites
          .filter((invite) => invite.expiresAt ? invite.expiresAt <= now : false)
          .map((invite) => invite.id);

        if (expiredInviteIds.length > 0) {
          await this.prisma.agentInvite.updateMany({
            where: { id: { in: expiredInviteIds }, status: AgentInviteStatus.PENDING },
            data: { status: AgentInviteStatus.EXPIRED }
          });
        }

        if (validInvites.length > 0) {
          const orgIds = new Set(validInvites.map((invite) => invite.organizationId));
          if (orgIds.size > 1) {
            throw new BadRequestException(
              'Multiple pending invites were found for this email. Please use the invite link for the organization you want to join.'
            );
          }
          user = await this.acceptAgentInvite(validInvites[0], normalizedEmail);
        }

        if (user) {
          // Invite-based provisioning succeeded; skip auto-provision logic.
        } else if (pendingInvites.length > 0 && expiredInviteIds.length === pendingInvites.length && !this.isCognitoAutoProvisionEnabled()) {
          throw new BadRequestException('Invite has expired');
        } else if (!this.isCognitoAutoProvisionEnabled()) {
          throw new UnauthorizedException('No user found for this account');
        }

        if (!user) {
          const defaultOrgId = process.env.DEFAULT_ORG_ID ?? 'org-hatch';
          const defaultTenantId = process.env.DEFAULT_TENANT_ID ?? 'tenant-hatch';

          // Ensure default org + tenant exist for local/dev.
          await this.prisma.organization.upsert({
            where: { id: defaultOrgId },
            update: {},
            create: {
              id: defaultOrgId,
              name: process.env.DEFAULT_ORG_NAME ?? 'Hatch'
            }
          });
          const tenant = await this.prisma.tenant.upsert({
            where: { id: defaultTenantId },
            update: {},
            create: {
              id: defaultTenantId,
              organizationId: defaultOrgId,
              name: process.env.DEFAULT_TENANT_NAME ?? 'Hatch',
              slug: process.env.DEFAULT_TENANT_SLUG ?? defaultTenantId
            }
          });

          const emailToStore = this.isEmailLike(normalizedEmail) ? normalizedEmail : placeholderEmail;
          const baseName = normalizedEmail.split('@')[0] || 'User';
          const role = this.resolveCognitoAutoProvisionRole();

          user = await this.prisma.user.create({
            data: {
              email: emailToStore,
              firstName: baseName,
              lastName: '',
              role,
              organizationId: tenant.organizationId,
              tenantId: tenant.id
            },
            select: { id: true, email: true, role: true, tenantId: true, organizationId: true }
          });

          await this.prisma.userOrgMembership.create({
            data: {
              userId: user.id,
              orgId: user.organizationId,
              isOrgAdmin: false
            }
          });
        }
      }
    }

    if (!user) {
      throw new UnauthorizedException('Unable to resolve user');
    }

    const accessToken = this.tokens.issueAccess({
      sub: user.id,
      email: user.email,
      role: user.role,
      roles: [user.role.toLowerCase()],
      tenantId: user.tenantId,
      orgId: user.organizationId
    });
    const refreshToken = this.tokens.issueRefresh({ sub: user.id });

    reply.setCookie(ACCESS_TOKEN_COOKIE, accessToken, this.cookieOptions(req, FIFTEEN_MINUTES_MS));
    reply.setCookie(REFRESH_TOKEN_COOKIE, refreshToken, this.cookieOptions(req, THIRTY_DAYS_MS));

    const accept = req.headers['accept'];
    const wantsJson = typeof accept === 'string' && accept.includes('application/json');

    if (wantsJson) {
      return reply.send({
        success: true,
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          organizationId: user.organizationId
        }
      });
    }

    return reply.redirect(redirectTo, 302);
  }
}
