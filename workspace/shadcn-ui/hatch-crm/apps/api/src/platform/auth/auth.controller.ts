import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { TokensService } from './tokens.service';

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
  constructor(private readonly tokens: TokensService) {}

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
}
