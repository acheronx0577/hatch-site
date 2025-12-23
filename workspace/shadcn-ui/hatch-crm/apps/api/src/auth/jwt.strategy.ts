import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

const ACCESS_TOKEN_COOKIE = 'access_token';

type JwtPayload = {
  sub?: string;
  userId?: string;
  tenantId?: string;
  tid?: string;
  tenant_id?: string;
  [key: string]: unknown;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const secret = process.env.JWT_ACCESS_SECRET ?? process.env.API_JWT_SECRET;
    if (!secret && process.env.NODE_ENV === 'production') {
      throw new Error('JWT access secret is not configured (set JWT_ACCESS_SECRET)');
    }

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: any) => {
          const token = req?.cookies?.[ACCESS_TOKEN_COOKIE];
          return typeof token === 'string' && token.length > 0 ? token : null;
        },
        ExtractJwt.fromAuthHeaderAsBearerToken()
      ]),
      ignoreExpiration: false,
      secretOrKey: secret ?? 'dev-secret'
    });
  }

  async validate(payload: JwtPayload) {
    const tenantId = payload.tenantId ?? payload.tid ?? payload.tenant_id;
    const userId = payload.sub ?? payload.userId ?? payload['id'];

    return {
      ...payload,
      tenantId,
      userId
    };
  }
}
