import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-openidconnect';

interface OidcProfileEmail {
  value: string;
}

interface OidcProfile {
  id?: string;
  displayName?: string;
  emails?: OidcProfileEmail[];
  _json?: {
    sub?: string;
    email?: string;
    name?: string;
  };
}

@Injectable()
export class OidcStrategy extends PassportStrategy(Strategy, 'oidc') {
  private readonly isConfigured: boolean;

  constructor() {
    const issuer = process.env.OIDC_ISSUER;
    const authorizationURL = process.env.OIDC_AUTH_URL;
    const tokenURL = process.env.OIDC_TOKEN_URL;
    const userInfoURL = process.env.OIDC_USERINFO_URL;
    const clientID = process.env.OIDC_CLIENT_ID;
    const clientSecret = process.env.OIDC_CLIENT_SECRET;
    const callbackURL = process.env.OIDC_CALLBACK_URL;

    super({
      issuer: issuer ?? 'http://localhost:3000/oidc',
      authorizationURL: authorizationURL ?? 'http://localhost:3000/oidc/auth',
      tokenURL: tokenURL ?? 'http://localhost:3000/oidc/token',
      userInfoURL: userInfoURL ?? 'http://localhost:3000/oidc/userinfo',
      clientID: clientID ?? 'development-client',
      clientSecret: clientSecret ?? 'development-secret',
      callbackURL: callbackURL ?? 'http://localhost:4000/api/auth/oidc/callback',
      scope: ['openid', 'profile', 'email']
    });

    this.isConfigured = Boolean(
      issuer && authorizationURL && tokenURL && userInfoURL && clientID && clientSecret && callbackURL
    );

    if (!this.isConfigured) {
      Logger.warn(
        'OIDC environment variables are not fully configured. OIDC authentication is running in disabled mode.',
        OidcStrategy.name
      );
    }
  }

  validate(_issuer: string, profile: OidcProfile, done: (err: unknown, user?: any) => void) {
    if (!this.isConfigured) {
      return done(null, false);
    }

    const sub = profile.id ?? profile._json?.sub;
    const email = profile.emails?.[0]?.value ?? profile._json?.email;
    const name = profile.displayName ?? profile._json?.name ?? email ?? sub;

    done(null, {
      userId: sub,
      email,
      name
    });
  }
}
