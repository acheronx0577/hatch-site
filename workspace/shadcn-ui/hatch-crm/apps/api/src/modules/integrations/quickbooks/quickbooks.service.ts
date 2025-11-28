import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const OAuthClient = require('intuit-oauth');

import { PrismaService } from '@/modules/prisma/prisma.service';

@Injectable()
export class QuickBooksService {
  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService) {}

  private getClientBase() {
    return new OAuthClient({
      clientId: this.config.get<string>('QB_CLIENT_ID'),
      clientSecret: this.config.get<string>('QB_CLIENT_SECRET'),
      environment: this.config.get<string>('QB_ENV') ?? 'sandbox',
      redirectUri: this.config.get<string>('QB_REDIRECT_URI')
    });
  }

  private getClientWithToken(tokensJson: string) {
    return new OAuthClient({
      clientId: this.config.get<string>('QB_CLIENT_ID'),
      clientSecret: this.config.get<string>('QB_CLIENT_SECRET'),
      environment: this.config.get<string>('QB_ENV') ?? 'sandbox',
      redirectUri: this.config.get<string>('QB_REDIRECT_URI'),
      token: JSON.parse(tokensJson)
    });
  }

  private getScopes() {
    return (this.config.get<string>('QB_SCOPES') ?? '').split(/\s+/).filter(Boolean);
  }

  // Keep table bootstrap here so the flow works even on a reset dev DB.
  private async ensureConnectionTable() {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "QuickBooksConnection" (
        "id" text PRIMARY KEY,
        "orgId" text NOT NULL,
        "realmId" text NOT NULL,
        "tokensJson" text NOT NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "QuickBooksConnection_orgId_key" UNIQUE ("orgId")
      );
    `);
    // Drop FK if present so we can store sandbox orgs that don't exist in the seeded DB.
    await this.prisma.$executeRawUnsafe(
      'ALTER TABLE "QuickBooksConnection" DROP CONSTRAINT IF EXISTS "QuickBooksConnection_org_fkey";'
    );
  }

  generateState(orgId: string) {
    const secret = this.config.get<string>('QB_STATE_SECRET');
    const nonce = crypto.randomBytes(16).toString('hex');
    const payload = `${orgId}:${nonce}`;
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return Buffer.from(`${payload}:${signature}`).toString('base64url');
  }

  parseAndVerifyState(state: string): string {
    const secret = this.config.get<string>('QB_STATE_SECRET');
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 3) throw new UnauthorizedException('Invalid state');
    const [orgId, nonce, sig] = parts;
    const payload = `${orgId}:${nonce}`;
    const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      throw new UnauthorizedException('Invalid state signature');
    }
    return orgId;
  }

  buildAuthorizeUrl(orgId: string) {
    const client = this.getClientBase();
    const state = this.generateState(orgId);
    return client.authorizeUri({
      scope: this.getScopes().join(' '),
      state
    });
  }

  async handleCallback(fullRedirectUrl: string, realmIdFromQuery: string) {
    const client = this.getClientBase();
    const authResponse = await client.createToken(fullRedirectUrl);
    const tokenJson = authResponse.getJson();
    const realmId = realmIdFromQuery || tokenJson.realmId;
    return { tokenJson, realmId };
  }

  async saveTokens(orgId: string, realmId: string, tokenJson: any) {
    await this.ensureConnectionTable();
    const tokens = JSON.stringify(tokenJson);
    // Use raw SQL so we don't depend on generated client shape if schema/code drift.
    await this.prisma.$executeRaw`
      INSERT INTO "QuickBooksConnection" ("id","orgId","realmId","tokensJson","createdAt","updatedAt")
      VALUES (${crypto.randomUUID()}, ${orgId}, ${realmId}, ${tokens}, NOW(), NOW())
      ON CONFLICT ("orgId") DO UPDATE
      SET "realmId" = EXCLUDED."realmId",
          "tokensJson" = EXCLUDED."tokensJson",
          "updatedAt" = NOW()
    `;
  }

  async getValidTokens(orgId: string): Promise<{ realmId: string; tokenJson: any }> {
    await this.ensureConnectionTable();
    const [conn] =
      ((await this.prisma.$queryRaw`
        SELECT "realmId", "tokensJson"
        FROM "QuickBooksConnection"
        WHERE "orgId" = ${orgId}
        LIMIT 1
      `) as Array<{ realmId: string; tokensJson: string }>) ?? [];
    if (!conn) throw new UnauthorizedException('QuickBooks not connected');

    const client = this.getClientWithToken(conn.tokensJson);
    const refreshedAuthResponse = await client.refreshUsingToken(conn.tokensJson);
    const newTokens = refreshedAuthResponse.getJson();

    if (JSON.stringify(newTokens) !== conn.tokensJson) {
      await this.prisma.$executeRaw`
        UPDATE "QuickBooksConnection"
        SET "tokensJson" = ${JSON.stringify(newTokens)}, "updatedAt" = NOW()
        WHERE "orgId" = ${orgId}
      `;
    }

    return { realmId: conn.realmId, tokenJson: newTokens };
  }

  getBaseApiUrl() {
    const env = this.config.get<string>('QB_ENV');
    return env === 'sandbox' ? 'https://sandbox-quickbooks.api.intuit.com' : 'https://quickbooks.api.intuit.com';
  }
}
