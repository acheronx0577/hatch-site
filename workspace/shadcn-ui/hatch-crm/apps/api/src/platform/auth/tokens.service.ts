import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

const FIFTEEN_MINUTES = 15 * 60;
const THIRTY_DAYS = 30 * 24 * 60 * 60;

@Injectable()
export class TokensService {
  issueAccess(payload: Record<string, unknown>) {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) {
      throw new UnauthorizedException('JWT access secret is not configured');
    }
    return jwt.sign(payload, secret, { expiresIn: FIFTEEN_MINUTES });
  }

  issueRefresh(payload: Record<string, unknown>) {
    const secret = process.env.JWT_REFRESH_SECRET;
    if (!secret) {
      throw new UnauthorizedException('JWT refresh secret is not configured');
    }
    return jwt.sign(payload, secret, { expiresIn: THIRTY_DAYS });
  }

  verifyAccess(token: string) {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) {
      throw new UnauthorizedException('JWT access secret is not configured');
    }
    return jwt.verify(token, secret);
  }
}
