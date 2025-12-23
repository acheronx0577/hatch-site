import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { PrismaService } from '../../modules/prisma/prisma.service';

type AuthenticatedRequest = FastifyRequest & {
  user?: Record<string, unknown>;
  params?: Record<string, unknown>;
  headers: Record<string, unknown>;
};

const headerValue = (request: AuthenticatedRequest, key: string): string | undefined => {
  const raw = request.headers?.[key] as string | string[] | undefined;
  if (!raw) return undefined;
  if (Array.isArray(raw)) return raw[0];
  return raw;
};

@Injectable()
export class OrgMembershipGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const userId =
      (request.user?.userId as string | undefined) ??
      (request.user?.sub as string | undefined) ??
      headerValue(request, 'x-user-id');

    if (!userId) {
      throw new UnauthorizedException('Missing authenticated user');
    }

    const orgId =
      (request.params?.orgId as string | undefined) ??
      (request.params?.organizationId as string | undefined) ??
      headerValue(request, 'x-org-id');

    if (!orgId) {
      throw new ForbiddenException('Missing organization context');
    }

    const membership = await this.prisma.userOrgMembership.findUnique({
      where: { userId_orgId: { userId, orgId } },
      select: { userId: true }
    });

    if (!membership) {
      throw new ForbiddenException('User is not a member of this organization');
    }

    return true;
  }
}

