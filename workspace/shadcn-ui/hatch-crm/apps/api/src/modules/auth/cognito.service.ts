import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CognitoConfig {
  domain: string;
  clientId: string;
  redirectUri: string;
  userPoolId?: string;
}

@Injectable()
export class CognitoService {
  private readonly logger = new Logger(CognitoService.name);
  private readonly config: CognitoConfig;

  constructor(private readonly configService: ConfigService) {
    this.config = {
      domain: this.configService.get<string>('COGNITO_DOMAIN') ?? '',
      clientId: this.configService.get<string>('COGNITO_CLIENT_ID') ?? '',
      redirectUri: this.configService.get<string>('COGNITO_REDIRECT_URI') ?? '',
      userPoolId: this.configService.get<string>('COGNITO_USER_POOL_ID')
    };

    if (!this.config.domain || !this.config.clientId) {
      this.logger.warn('Cognito not fully configured. Agent invites will not work properly.');
    }
  }

  /**
   * Generate Cognito signup URL with invite token embedded as state parameter
   * The state parameter will be returned to us after successful signup
   */
  generateSignupUrl(inviteToken: string, email?: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      scope: 'openid email profile',
      redirect_uri: `${this.config.redirectUri}/auth/cognito/callback`,
      // Embed invite token in state so we can retrieve it after signup
      state: Buffer.from(JSON.stringify({ inviteToken })).toString('base64')
    });

    // Pre-fill email if provided
    if (email) {
      params.append('login_hint', email);
    }

    return `${this.config.domain}/signup?${params.toString()}`;
  }

  /**
   * Generate Cognito login URL for existing users
   */
  generateLoginUrl(): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      scope: 'openid email profile',
      redirect_uri: `${this.config.redirectUri}/auth/cognito/callback`
    });

    return `${this.config.domain}/login?${params.toString()}`;
  }

  /**
   * Decode state parameter from Cognito callback
   * Returns the invite token that was embedded during signup
   */
  decodeState(state: string): { inviteToken?: string } {
    try {
      const decoded = Buffer.from(state, 'base64').toString('utf-8');
      return JSON.parse(decoded);
    } catch (error) {
      this.logger.error('Failed to decode Cognito state parameter', error);
      return {};
    }
  }

  /**
   * Exchange authorization code for tokens
   * This would typically call Cognito's token endpoint
   * For now, we'll rely on client-side token exchange
   *
   * SECURITY TODO for Production:
   * - Implement server-side token exchange with Cognito's /oauth2/token endpoint
   * - Verify the returned tokens
   * - Handle refresh token rotation
   * - Add proper error handling for invalid/expired codes
   */
  async exchangeCodeForTokens(code: string): Promise<{ idToken: string; accessToken: string } | null> {
    // TODO: Implement server-side token exchange with Cognito
    // const response = await fetch(`${this.config.domain}/oauth2/token`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    //   body: new URLSearchParams({
    //     grant_type: 'authorization_code',
    //     client_id: this.config.clientId,
    //     code,
    //     redirect_uri: this.config.redirectUri
    //   })
    // });

    this.logger.warn('Token exchange not yet implemented - relying on client-side flow');
    return null;
  }

  /**
   * Verify Cognito JWT token
   * Returns user info from the token
   *
   * ⚠️ SECURITY WARNING - PRODUCTION CRITICAL:
   * This method currently DOES NOT verify the JWT signature!
   * It only decodes the token payload without cryptographic validation.
   *
   * For production, you MUST:
   * 1. Fetch Cognito's public keys from /.well-known/jwks.json
   * 2. Verify the JWT signature using the public key
   * 3. Validate token expiration (exp claim)
   * 4. Validate token issuer (iss claim) matches your Cognito user pool
   * 5. Validate audience (aud claim) matches your client ID
   * 6. Use a library like jsonwebtoken or jose for proper verification
   *
   * Example implementation:
   * import * as jwt from 'jsonwebtoken';
   * import jwksClient from 'jwks-rsa';
   *
   * const client = jwksClient({
   *   jwksUri: `${this.config.domain}/.well-known/jwks.json`
   * });
   * const key = await client.getSigningKey(token.header.kid);
   * const publicKey = key.getPublicKey();
   * const verified = jwt.verify(idToken, publicKey, {
   *   issuer: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`,
   *   audience: this.config.clientId
   * });
   */
  async verifyToken(idToken: string): Promise<{ sub: string; email: string } | null> {
    // TODO: Implement JWT verification with Cognito public keys
    // For now, we'll trust tokens from the frontend
    // In production, this MUST verify the JWT signature

    try {
      const payload = JSON.parse(
        Buffer.from(idToken.split('.')[1], 'base64').toString('utf-8')
      );

      return {
        sub: payload.sub,
        email: payload.email
      };
    } catch (error) {
      this.logger.error('Failed to decode Cognito token', error);
      return null;
    }
  }

  isConfigured(): boolean {
    return !!(this.config.domain && this.config.clientId && this.config.redirectUri);
  }
}
