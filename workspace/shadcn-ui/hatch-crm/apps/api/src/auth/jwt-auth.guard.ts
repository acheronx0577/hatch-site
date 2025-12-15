import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = any>(err: unknown, user: TUser, _info: unknown, _context: ExecutionContext): TUser {
    if (user) {
      return user;
    }

    throw (err as Error) || new UnauthorizedException();
  }
}
