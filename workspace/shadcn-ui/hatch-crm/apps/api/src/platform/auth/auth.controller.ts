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

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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

  @Get('login')
  @UseGuards(AuthGuard('oidc'))
  // Intentionally empty: guard handles redirect.
  login() {
    return;
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

    reply.setCookie('refresh_token', refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV !== 'development',
      maxAge: THIRTY_DAYS_MS,
      path: '/'
    });

    return {
      accessToken
    };
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
  async cognitoCallback(@Query() query: CognitoCallbackDto) {
    const { code, state, idToken, email, cognitoSub } = query;

    // Decode state parameter to get invite token
    if (!state) {
      throw new BadRequestException('Missing state parameter');
    }

    const { inviteToken } = this.cognito.decodeState(state);
    if (!inviteToken) {
      throw new BadRequestException('Invalid state parameter - no invite token found');
    }

    // Look up the invite
    const invite = await this.prisma.agentInvite.findUnique({
      where: { token: inviteToken },
      include: { organization: true }
    });

    if (!invite) {
      throw new NotFoundException('Invite not found');
    }

    // Validate invite status
    if (invite.status !== AgentInviteStatus.PENDING) {
      throw new BadRequestException(`Invite already ${invite.status.toLowerCase()}`);
    }

    // Validate invite expiration
    if (invite.expiresAt && new Date() > invite.expiresAt) {
      throw new BadRequestException('Invite has expired');
    }

    // Exchange authorization code for tokens (if we have code instead of idToken)
    let userInfo: { sub: string; email: string } | null = null;
    if (idToken) {
      userInfo = await this.cognito.verifyToken(idToken);
    } else if (code) {
      const tokens = await this.cognito.exchangeCodeForTokens(code);
      if (tokens?.idToken) {
        userInfo = await this.cognito.verifyToken(tokens.idToken);
      }
    }

    // Fallback to query params if token verification didn't work
    if (!userInfo && email && cognitoSub) {
      userInfo = { sub: cognitoSub, email };
    }

    if (!userInfo) {
      throw new BadRequestException('Could not extract user info from Cognito response');
    }

    // Check if user already exists
    let user = await this.prisma.user.findUnique({
      where: { email: userInfo.email.toLowerCase() }
    });

    if (user) {
      // User exists - just update their org membership if needed
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
      // Create new user account
      const tenant = await this.prisma.tenant.findFirst({
        where: { organizationId: invite.organizationId }
      });

      if (!tenant) {
        throw new NotFoundException('Tenant not found for organization');
      }

      user = await this.prisma.user.create({
        data: {
          email: userInfo.email.toLowerCase(),
          organizationId: invite.organizationId,
          tenantId: tenant.id,
          role: UserRole.AGENT,
          // No password hash - using Cognito auth only
          firstName: userInfo.email.split('@')[0], // Placeholder - will be updated by user
          lastName: ''
        }
      });

      // Create org membership
      await this.prisma.userOrgMembership.create({
        data: {
          userId: user.id,
          orgId: invite.organizationId,
          isOrgAdmin: false
        }
      });

      // Create agent profile
      await this.prisma.agentProfile.create({
        data: {
          userId: user.id,
          organizationId: invite.organizationId
        }
      });
    }

    // Mark invite as accepted
    await this.prisma.agentInvite.update({
      where: { id: invite.id },
      data: {
        status: AgentInviteStatus.ACCEPTED
      }
    });

    // Issue JWT tokens for our system
    const accessToken = this.tokens.issueAccess({
      sub: user.id,
      email: user.email,
      role: user.role,
      roles: [user.role.toLowerCase()],
      tenantId: user.tenantId,
      orgId: user.organizationId
    });
    const refreshToken = this.tokens.issueRefresh({ sub: user.id });

    // Return tokens and redirect URL
    // In production, you'd redirect to frontend with tokens in URL/cookies
    return {
      success: true,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId
      }
    };
  }
}
