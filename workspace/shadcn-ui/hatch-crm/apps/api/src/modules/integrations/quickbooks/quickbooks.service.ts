import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountingProvider } from '@hatch/db';
import * as crypto from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const OAuthClient = require('intuit-oauth');

import { PrismaService } from '@/modules/prisma/prisma.service';

type ProfitAndLossParams = {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
};

type ProfitAndLossReport = {
  totalIncome: number;
  totalExpenses: number;
  netIncome: number | null;
  incomeByAccount: Array<{ label: string; amount: number }>;
  expensesByAccount: Array<{ label: string; amount: number }>;
};

@Injectable()
export class QuickBooksService {
  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService) {}

  private isMissingSchemaError(error: unknown) {
    return (
      error instanceof Error &&
      (error as any).code &&
      ['P2021', 'P2022', '42P01'].includes((error as any).code)
    );
  }

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

  private getStateSecret(): string {
    const explicit = this.config.get<string>('QB_STATE_SECRET')?.trim();
    if (explicit) return explicit;
    const jwtFallback = this.config.get<string>('JWT_ACCESS_SECRET')?.trim() ?? process.env.JWT_ACCESS_SECRET?.trim();
    return jwtFallback || 'local-qb-state-secret';
  }

  generateState(orgId: string) {
    const secret = this.getStateSecret();
    const nonce = crypto.randomBytes(16).toString('hex');
    const payload = `${orgId}:${nonce}`;
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return Buffer.from(`${payload}:${signature}`).toString('base64url');
  }

  parseAndVerifyState(state: string): string {
    const secret = this.getStateSecret();
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

    try {
      await this.prisma.accountingIntegrationConfig.upsert({
        where: { organizationId: orgId },
        create: {
          organizationId: orgId,
          provider: AccountingProvider.QUICKBOOKS,
          realmId,
          connectedAt: new Date()
        },
        update: {
          provider: AccountingProvider.QUICKBOOKS,
          realmId,
          connectedAt: new Date()
        }
      });
    } catch (error) {
      if (!this.isMissingSchemaError(error)) {
        throw error;
      }
    }
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

    const tokenJson = JSON.parse(conn.tokensJson);
    const refreshToken = tokenJson.refresh_token ?? tokenJson.refreshToken ?? null;

    if (!refreshToken) {
      return { realmId: conn.realmId, tokenJson };
    }

    const client = this.getClientWithToken(conn.tokensJson);
    const refreshedAuthResponse = await client.refreshUsingToken(refreshToken);
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

  async fetchProfitAndLoss(orgId: string, params: ProfitAndLossParams): Promise<ProfitAndLossReport> {
    const { realmId, tokenJson } = await this.getValidTokens(orgId);

    const accessToken = tokenJson?.access_token ?? tokenJson?.accessToken ?? null;
    if (!accessToken) {
      throw new UnauthorizedException('QuickBooks access token is missing');
    }

    const url = new URL(`${this.getBaseApiUrl()}/v3/company/${encodeURIComponent(realmId)}/reports/ProfitAndLoss`);
    url.searchParams.set('start_date', params.startDate);
    url.searchParams.set('end_date', params.endDate);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (response.status === 401 || response.status === 403) {
      throw new UnauthorizedException('QuickBooks authorization expired or revoked');
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`QuickBooks ProfitAndLoss failed (${response.status}): ${body || response.statusText}`);
    }

    const report = (await response.json()) as any;
    return parseProfitAndLossReport(report);
  }
}

type QboColData = { value?: string };
type QboReportRow = {
  ColData?: QboColData[];
  Header?: { ColData?: QboColData[] };
  Summary?: { ColData?: QboColData[] };
  Rows?: { Row?: QboReportRow[] };
};

const parseAmount = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const normalized = trimmed.replace(/,/g, '');
  const isParens = normalized.startsWith('(') && normalized.endsWith(')');
  const numeric = isParens ? normalized.slice(1, -1) : normalized;
  const parsed = Number.parseFloat(numeric);
  if (!Number.isFinite(parsed)) return 0;
  return isParens ? -parsed : parsed;
};

const colLabel = (col?: QboColData) => (col?.value ?? '').toString().trim();
const pickAmountFromCols = (cols?: QboColData[]) => parseAmount(cols?.at(-1)?.value);

const walkRows = (rows: QboReportRow[] | undefined, out: QboReportRow[]) => {
  for (const row of rows ?? []) {
    out.push(row);
    const nested = row.Rows?.Row;
    if (nested?.length) {
      walkRows(nested, out);
    }
  }
};

const findSection = (rows: QboReportRow[] | undefined, sectionName: string): QboReportRow | null => {
  const target = sectionName.trim().toLowerCase();
  const flat: QboReportRow[] = [];
  walkRows(rows, flat);
  return (
    flat.find((row) => colLabel(row.Header?.ColData?.[0]).toLowerCase() === target) ?? null
  );
};

const extractLines = (section: QboReportRow | null): Array<{ label: string; amount: number }> => {
  if (!section) return [];
  const flat: QboReportRow[] = [];
  walkRows(section.Rows?.Row, flat);
  const lines = flat
    .filter((row) => Array.isArray(row.ColData) && row.ColData.length >= 2)
    .map((row) => ({ label: colLabel(row.ColData?.[0]), amount: pickAmountFromCols(row.ColData) }))
    .filter((line) => line.label && line.amount !== 0);
  return lines.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 12);
};

const findSummaryAmount = (rows: QboReportRow[] | undefined, label: string): number | null => {
  const target = label.trim().toLowerCase();
  const flat: QboReportRow[] = [];
  walkRows(rows, flat);
  for (const row of flat) {
    const summaryLabel = colLabel(row.Summary?.ColData?.[0]).toLowerCase();
    if (summaryLabel === target) {
      return pickAmountFromCols(row.Summary?.ColData);
    }
  }
  return null;
};

const parseProfitAndLossReport = (report: any): ProfitAndLossReport => {
  const rootRows = (report?.Rows?.Row ?? []) as QboReportRow[];

  const totalIncome = findSummaryAmount(rootRows, 'Total Income') ?? 0;
  const totalExpenses = findSummaryAmount(rootRows, 'Total Expenses') ?? 0;
  const netIncome = findSummaryAmount(rootRows, 'Net Income');

  const incomeSection = findSection(rootRows, 'Income');
  const expensesSection = findSection(rootRows, 'Expenses');

  return {
    totalIncome,
    totalExpenses,
    netIncome,
    incomeByAccount: extractLines(incomeSection),
    expensesByAccount: extractLines(expensesSection)
  };
};
