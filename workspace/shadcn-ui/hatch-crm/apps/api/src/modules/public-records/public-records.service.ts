import { Injectable, Logger } from '@nestjs/common';
import { SellerOpportunityStatus, type Prisma } from '@hatch/db';
import { randomUUID } from 'crypto';
import { createWriteStream } from 'fs';
import { mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Client } from 'pg';
import { createInterface } from 'readline';
import fetch from 'node-fetch';
import { pipeline } from 'stream/promises';
import * as unzipper from 'unzipper';

import { PrismaService } from '@/modules/prisma/prisma.service';
import { S3Service } from '@/modules/storage/s3.service';

type SyncResult =
  | { status: 'SUCCESS'; datasetsProcessed: number; datasetsUpdated: number }
  | { status: 'SKIPPED_LOCKED'; datasetsProcessed: 0; datasetsUpdated: 0 };

type DatasetRunResult =
  | { status: 'SKIPPED_UNCHANGED'; updated: false }
  | { status: 'SUCCESS'; updated: true; s3Key: string };

type PreviousRunNote = {
  etag?: string | null;
  lastModified?: string | null;
  fileId?: string | null;
  s3Key?: string | null;
};

type SellerSignal = {
  key: string;
  label: string;
  weight: number;
  value?: string;
  reason: string;
};

type SellerOpportunityCandidate = {
  dedupeKey: string;
  source: string;
  score: number;
  signals: Prisma.InputJsonValue;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  ownerName: string | null;
  ownerMailingAddressLine1: string | null;
  ownerMailingAddressLine2: string | null;
  ownerMailingCity: string | null;
  ownerMailingState: string | null;
  ownerMailingPostalCode: string | null;
  county: string | null;
  latitude: number | null;
  longitude: number | null;
  lastSeenAt: Date;
};

type SellerOpportunityIngestOrgStats = { orgId: string; created: number; updated: number };

type SellerOpportunityIngestResult = {
  orgs: SellerOpportunityIngestOrgStats[];
  scannedRows: number;
  candidates: number;
  skippedInvalid: number;
  skippedBelowScore: number;
  capped: boolean;
};

@Injectable()
export class PublicRecordsService {
  private readonly logger = new Logger(PublicRecordsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service
  ) {}

  async syncOnce(params: { reason: 'cron' | 'manual' }): Promise<SyncResult> {
    const sellerOppOrgIds = this.sellerOpportunityOrgIds();
    const lockResult = await this.withGlobalLock('public_records_sync', async () => {
      let datasetsProcessed = 0;
      let datasetsUpdated = 0;

      if (sellerOppOrgIds.length) {
        await this.repairFloridaPublicRecordOpportunities(sellerOppOrgIds, ['Lee', 'Collier'], 'FL');
      }

      const results: Array<Promise<DatasetRunResult>> = [
        this.syncLeeParcels({ ...params, sellerOppOrgIds }),
        this.syncCollierIntParcels(params),
        this.syncCollierIntfilesCsv({ ...params, sellerOppOrgIds }),
        this.syncCollierParcelPolygonShape(params)
      ];

      for (const resultPromise of results) {
        const result = await resultPromise;
        datasetsProcessed += 1;
        if (result.updated) datasetsUpdated += 1;
      }

      return { datasetsProcessed, datasetsUpdated };
    });

    if (!lockResult) {
      return { status: 'SKIPPED_LOCKED', datasetsProcessed: 0, datasetsUpdated: 0 };
    }

    return { status: 'SUCCESS', ...lockResult };
  }

  private async withGlobalLock<T>(lockKey: string, fn: () => Promise<T>): Promise<T | null> {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not configured');
    }

    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const lockId = this.lockKeyToBigInt(lockKey);
      const res = await client.query<{ locked: boolean }>('select pg_try_advisory_lock($1) as locked', [lockId]);
      const locked = res.rows?.[0]?.locked ?? false;
      if (!locked) return null;

      try {
        return await fn();
      } finally {
        await client.query('select pg_advisory_unlock($1)', [lockId]).catch((error) => {
          this.logger.warn(`Failed to release advisory lock: ${error instanceof Error ? error.message : error}`);
        });
      }
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  private lockKeyToBigInt(value: string): bigint {
    // Deterministic 64-bit value derived from string input (simple FNV-1a 64-bit).
    let hash = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;
    for (const byte of Buffer.from(value, 'utf8')) {
      hash ^= BigInt(byte);
      hash = BigInt.asUintN(64, hash * prime);
    }
    // Advisory lock functions accept signed bigint; keep it within signed 63-bit positive range.
    return BigInt.asUintN(63, hash);
  }

  private metricsOrgId() {
    return (process.env.PUBLIC_RECORDS_METRICS_ORG_ID ?? 'system').trim() || 'system';
  }

  private s3DatePrefix(now = new Date()) {
    return now.toISOString().slice(0, 10);
  }

  private basePrefix() {
    return (process.env.PUBLIC_RECORDS_S3_BASE_PREFIX ?? 'raw/public-records').replace(/^\/+/, '').replace(/\/+$/, '');
  }

  private forceSync() {
    const raw = (process.env.PUBLIC_RECORDS_FORCE ?? '').trim().toLowerCase();
    return raw === 'true' || raw === '1' || raw === 'yes';
  }

  private sellerOpportunityOrgIds(): string[] {
    const raw =
      process.env.PUBLIC_RECORDS_SELLER_OPPORTUNITY_ORG_IDS ??
      process.env.PUBLIC_RECORDS_SYNC_ORG_IDS ??
      process.env.PUBLIC_RECORDS_TARGET_ORG_IDS ??
      '';
    const orgIds = raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    return Array.from(new Set(orgIds));
  }

  private sellerOpportunityMinScore(): number {
    const raw = process.env.PUBLIC_RECORDS_SELLER_OPPORTUNITY_MIN_SCORE ?? process.env.PUBLIC_RECORDS_MIN_SCORE;
    const value = raw ? Number(raw) : 70;
    if (!Number.isFinite(value) || value < 0) return 70;
    return Math.min(100, Math.floor(value));
  }

  private sellerOpportunityMaxPerDataset(): number {
    const raw =
      process.env.PUBLIC_RECORDS_SELLER_OPPORTUNITY_MAX_PER_DATASET ??
      process.env.PUBLIC_RECORDS_MAX_OPPORTUNITIES_PER_DATASET;
    const value = raw ? Number(raw) : 5000;
    if (!Number.isFinite(value) || value <= 0) return 5000;
    return Math.min(100_000, Math.floor(value));
  }

  private async syncLeeParcels(params: { reason: 'cron' | 'manual'; sellerOppOrgIds: string[] }): Promise<DatasetRunResult> {
    const url =
      (process.env.PUBLIC_RECORDS_LEE_PARCELS_URL ??
        'https://www.leepa.org/TaxRoll/ParcelData/LCPA_Parcel_Data_TXT.zip').trim();
    const key = 'public_records.lee.leepa.parcels';
    const metricsOrgId = this.metricsOrgId();

    const run = await this.prisma.metricsRun.create({
      data: { orgId: metricsOrgId, key, status: 'RUNNING', note: JSON.stringify({ reason: params.reason }) }
    });

    const startedAt = new Date();
    const tmpRoot = join(tmpdir(), `hatch-public-records-${randomUUID()}`);
    await mkdir(tmpRoot, { recursive: true });
    const localZip = join(tmpRoot, 'lee-parcels.zip');

    try {
      const head = await fetch(url, { method: 'HEAD' });
      if (!head.ok) throw new Error(`Lee parcels HEAD failed: ${head.status} ${head.statusText}`);
      const etag = head.headers.get('etag');
      const lastModified = head.headers.get('last-modified');

      const previous = await this.getPreviousRunNote(metricsOrgId, key);
      if (!this.forceSync() && previous?.etag === etag && previous?.lastModified === lastModified) {
        await this.prisma.metricsRun.update({
          where: { id: run.id },
          data: {
            status: 'SUCCESS',
            finishedAt: new Date(),
            note: JSON.stringify({ status: 'SKIPPED_UNCHANGED', etag, lastModified, previousS3Key: previous?.s3Key ?? null })
          }
        });
        return { status: 'SKIPPED_UNCHANGED', updated: false };
      }

      await this.downloadToFile(url, localZip);

      const s3Key = `${this.basePrefix()}/fl/lee/leepa/taxroll/parcels/${this.s3DatePrefix(startedAt)}/LCPA_Parcel_Data_TXT.zip`;
      await this.s3.uploadObject(s3Key, createReadStreamCompat(localZip), 'application/zip');

      const sellerOppIngest = await this.ingestLeeSellerOpportunities({
        zipPath: localZip,
        orgIds: params.sellerOppOrgIds,
        county: 'Lee'
      });

      await this.prisma.metricsRun.update({
        where: { id: run.id },
        data: {
          status: 'SUCCESS',
          finishedAt: new Date(),
          note: JSON.stringify({ status: 'SUCCESS', etag, lastModified, s3Key, sellerOpportunities: sellerOppIngest })
        }
      });

      return { status: 'SUCCESS', updated: true, s3Key };
    } catch (error) {
      await this.prisma.metricsRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', finishedAt: new Date(), note: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    } finally {
      await rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async syncCollierIntParcels(params: { reason: 'cron' | 'manual' }): Promise<DatasetRunResult> {
    const url =
      (process.env.PUBLIC_RECORDS_COLLIER_INT_PARCELS_URL ??
        'https://www.collierappraiser.com/Main_Data/downloadgdfile.asp?folderName=INT%20FILES%20(NEW)&file=int_parcels_csv.zip').trim();
    const key = 'public_records.collier.collierappraiser.int_parcels';
    return this.syncCollierGoogleDriveBackedZip({
      metricsKey: key,
      sourceUrl: url,
      s3Key: `${this.basePrefix()}/fl/collier/collierappraiser/taxroll/parcels/${this.s3DatePrefix()}/int_parcels_csv.zip`,
      reason: params.reason
    });
  }

  private async syncCollierIntfilesCsv(params: { reason: 'cron' | 'manual'; sellerOppOrgIds: string[] }): Promise<DatasetRunResult> {
    const url =
      (process.env.PUBLIC_RECORDS_COLLIER_INTFILES_URL ??
        'https://www.collierappraiser.com/Main_Data/downloadgdfile.asp?folderName=INT%20FILES%20(NEW)&file=intfiles_csv.zip').trim();
    const key = 'public_records.collier.collierappraiser.intfiles_csv';
    return this.syncCollierGoogleDriveBackedZip({
      metricsKey: key,
      sourceUrl: url,
      s3Key: `${this.basePrefix()}/fl/collier/collierappraiser/taxroll/all/${this.s3DatePrefix()}/intfiles_csv.zip`,
      reason: params.reason,
      ingestSellerOpportunities: async (zipPath) =>
        this.ingestCollierSellerOpportunities({
          zipPath,
          orgIds: params.sellerOppOrgIds,
          county: 'Collier'
        })
    });
  }

  private async syncCollierParcelPolygonShape(params: { reason: 'cron' | 'manual' }): Promise<DatasetRunResult> {
    const url =
      (process.env.PUBLIC_RECORDS_COLLIER_PARCELS_SHAPE_URL ??
        'https://www.collierappraiser.com/Main_Data/downloadgdfile.asp?folderName=GIS%20(Shape%20files)&file=parcel_polygon_shape_file.zip').trim();
    const key = 'public_records.collier.collierappraiser.parcel_polygon_shape_file';
    return this.syncCollierGoogleDriveBackedZip({
      metricsKey: key,
      sourceUrl: url,
      s3Key: `${this.basePrefix()}/fl/collier/collierappraiser/gis/parcels-polygons/${this.s3DatePrefix()}/parcel_polygon_shape_file.zip`,
      reason: params.reason
    });
  }

  private async syncCollierGoogleDriveBackedZip(params: {
    metricsKey: string;
    sourceUrl: string;
    s3Key: string;
    reason: 'cron' | 'manual';
    ingestSellerOpportunities?: (zipPath: string) => Promise<SellerOpportunityIngestResult | null>;
  }): Promise<DatasetRunResult> {
    const metricsOrgId = this.metricsOrgId();
    const run = await this.prisma.metricsRun.create({
      data: { orgId: metricsOrgId, key: params.metricsKey, status: 'RUNNING', note: JSON.stringify({ reason: params.reason }) }
    });

    const tmpRoot = join(tmpdir(), `hatch-public-records-${randomUUID()}`);
    await mkdir(tmpRoot, { recursive: true });
    const localZip = join(tmpRoot, 'collier.zip');

    try {
      const fileId = await this.resolveCollierFileId(params.sourceUrl);

      const previous = await this.getPreviousRunNote(metricsOrgId, params.metricsKey);
      if (!this.forceSync() && previous?.fileId === fileId) {
        await this.prisma.metricsRun.update({
          where: { id: run.id },
          data: {
            status: 'SUCCESS',
            finishedAt: new Date(),
            note: JSON.stringify({ status: 'SKIPPED_UNCHANGED', fileId, previousS3Key: previous?.s3Key ?? null })
          }
        });
        return { status: 'SKIPPED_UNCHANGED', updated: false };
      }

      const downloadUrl = await this.resolveGoogleDriveDownloadUrl(fileId);
      await this.downloadToFile(downloadUrl, localZip);

      await this.s3.uploadObject(params.s3Key, createReadStreamCompat(localZip), 'application/zip');

      const sellerOppIngest = params.ingestSellerOpportunities ? await params.ingestSellerOpportunities(localZip) : null;

      await this.prisma.metricsRun.update({
        where: { id: run.id },
        data: {
          status: 'SUCCESS',
          finishedAt: new Date(),
          note: JSON.stringify({ status: 'SUCCESS', fileId, s3Key: params.s3Key, sellerOpportunities: sellerOppIngest })
        }
      });

      return { status: 'SUCCESS', updated: true, s3Key: params.s3Key };
    } catch (error) {
      await this.prisma.metricsRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', finishedAt: new Date(), note: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    } finally {
      await rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async getPreviousRunNote(orgId: string, key: string): Promise<PreviousRunNote | null> {
    const last = await this.prisma.metricsRun.findFirst({
      where: { orgId, key, status: 'SUCCESS' },
      orderBy: { createdAt: 'desc' },
      select: { note: true }
    });
    const parsed = safeJsonParse<PreviousRunNote>(last?.note ?? null);
    return parsed ?? null;
  }

  private async resolveCollierFileId(sourceUrl: string): Promise<string> {
    const res = await fetch(sourceUrl, { method: 'HEAD', redirect: 'manual' as any });
    if (res.status < 300 || res.status >= 400) {
      throw new Error(`Expected redirect from Collier download endpoint; got ${res.status}`);
    }
    const location = res.headers.get('location');
    if (!location) {
      throw new Error('Collier download endpoint missing location header');
    }
    const url = new URL(location, 'https://www.collierappraiser.com');
    const id = url.searchParams.get('id');
    if (!id) {
      throw new Error(`Unable to resolve Google Drive id from redirect: ${location}`);
    }
    return id;
  }

  private async resolveGoogleDriveDownloadUrl(fileId: string): Promise<string> {
    const landingUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
    const res = await fetch(landingUrl);
    if (!res.ok) {
      throw new Error(`Google Drive landing request failed: ${res.status} ${res.statusText}`);
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) {
      // If Drive returns a direct file response, use the resolved URL.
      return res.url;
    }

    const html = await res.text();
    const actionMatch =
      html.match(/<form[^>]+id=\"download-form\"[^>]*action=\"([^\"]+)\"/i) ??
      html.match(/<form[^>]+action=\"([^\"]+)\"[^>]*id=\"download-form\"/i);
    const action = actionMatch?.[1];
    if (!action) {
      throw new Error('Unable to locate Google Drive download form action');
    }

    const params = new URLSearchParams();
    const inputRegex = /<input[^>]+name=\"([^\"]+)\"[^>]*value=\"([^\"]*)\"[^>]*>/gi;
    let match: RegExpExecArray | null;
    while ((match = inputRegex.exec(html))) {
      const name = match[1];
      const value = match[2] ?? '';
      if (!name) continue;
      params.set(name, value);
    }

    if (!params.get('id')) params.set('id', fileId);
    if (!params.get('export')) params.set('export', 'download');

    return `${action}?${params.toString()}`;
  }

  private async downloadToFile(url: string, destinationPath: string) {
    const res = await fetch(url);
    if (!res.ok || !res.body) {
      throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
    }
    const stream = res.body as any;
    await pipeline(stream, createWriteStream(destinationPath));
  }

  private normalizeAddressPart(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9\s#.-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private makeDedupeKey(addressLine1: string, city: string, state: string, postalCode: string) {
    return [
      this.normalizeAddressPart(addressLine1),
      this.normalizeAddressPart(city),
      state.toUpperCase().trim(),
      postalCode.trim()
    ].join('|');
  }

  private async ingestLeeSellerOpportunities(params: {
    zipPath: string;
    orgIds: string[];
    county: string;
  }): Promise<SellerOpportunityIngestResult | null> {
    if (!params.orgIds.length) {
      this.logger.warn('PUBLIC_RECORDS_SYNC_ORG_IDS is not set; skipping seller opportunity upsert for Lee parcels.');
      return null;
    }

    const minScore = this.sellerOpportunityMinScore();
    const maxPerDataset = this.sellerOpportunityMaxPerDataset();
    const batchSize = 250;
    const orgStats = new Map<string, SellerOpportunityIngestOrgStats>(
      params.orgIds.map((orgId) => [orgId, { orgId, created: 0, updated: 0 }])
    );

    const directory = await unzipper.Open.file(params.zipPath);
    const candidates = directory.files
      .filter((entry) => entry.type === 'File')
      .map((entry) => entry.path)
      .join(', ');

    const dataEntry =
      directory.files.find((entry) => {
        const name = entry.path.toLowerCase();
        return entry.type === 'File' && name.endsWith('.txt') && !name.includes('field') && name.includes('lcpa');
      }) ??
      directory.files.find((entry) => {
        const name = entry.path.toLowerCase();
        return entry.type === 'File' && name.endsWith('.txt') && !name.includes('field');
      });

    if (!dataEntry) {
      throw new Error(`Lee parcels zip is missing a .txt data file. Entries: ${candidates}`);
    }

    const stream = dataEntry.stream();
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    let headerNorm: string[] | null = null;
    let situsAddressIdx: number | null = null;
    let situsCityIdx: number | null = null;
    let situsStateIdx: number | null = null;
    let situsZipIdx: number | null = null;

    let ownerName1Idx: number | null = null;
    let ownerName2Idx: number | null = null;

    let mailAddr1Idx: number | null = null;
    let mailAddr2Idx: number | null = null;
    let mailCityIdx: number | null = null;
    let mailStateIdx: number | null = null;
    let mailZipIdx: number | null = null;

    let homesteadIdx: number | null = null;
    let saleDateIdx: number | null = null;
    let saleAmountIdx: number | null = null;
    let justValueIdx: number | null = null;
    let latitudeIdx: number | null = null;
    let longitudeIdx: number | null = null;

    let scannedRows = 0;
    let candidatesRows = 0;
    let skippedInvalid = 0;
    let skippedBelowScore = 0;
    let capped = false;
    let batch: SellerOpportunityCandidate[] = [];

    const flush = async () => {
      if (!batch.length) return;
      const stats = await this.upsertSellerOpportunityBatch(params.orgIds, batch);
      for (const entry of stats) {
        const current = orgStats.get(entry.orgId);
        if (!current) continue;
        current.created += entry.created;
        current.updated += entry.updated;
      }
      batch = [];
    };

    try {
      for await (const rawLine of rl) {
        const line = rawLine.trimEnd();
        if (!line) continue;

        if (!headerNorm) {
          headerNorm = line.split('\t').map((value) => normalizeHeader(value.trim()));

          situsAddressIdx = findColumnIndex(headerNorm, [
            'siteaddress',
            'situsaddress',
            'propertyaddress',
            'site_address',
            'site addr',
            'locationaddress'
          ]);
          situsCityIdx = findColumnIndex(headerNorm, ['sitecity', 'situscity', 'city']);
          situsZipIdx = findColumnIndex(headerNorm, ['sitezip', 'situszip', 'zipcode', 'postalcode', 'zip']);

          ownerName1Idx = findColumnIndex(headerNorm, [
            'ownername',
            'ownername1',
            'owner1',
            'owner1name',
            'owner1_nm',
            'owner_1',
            'ownernm1',
            'ownname1'
          ]);
          ownerName2Idx = findColumnIndex(headerNorm, [
            'ownername2',
            'owner2',
            'owner2name',
            'owner2_nm',
            'owner_2',
            'ownernm2',
            'ownname2'
          ]);

          mailAddr1Idx = findColumnIndex(headerNorm, ['mailaddress1', 'mailaddr1', 'owneraddress1', 'mailingaddress1']);
          mailAddr2Idx = findColumnIndex(headerNorm, ['mailaddress2', 'mailaddr2', 'owneraddress2', 'mailingaddress2']);
          mailCityIdx = findColumnIndex(headerNorm, ['mailcity', 'mailingcity', 'ownercity']);
          mailStateIdx = findColumnIndex(headerNorm, ['mailstate', 'mailingstate', 'ownerstate']);
          mailZipIdx = findColumnIndex(headerNorm, ['mailzip', 'mailingzip', 'ownerzip', 'mailzipcode']);

          homesteadIdx = findColumnIndex(headerNorm, [
            'homestead',
            'homesteadexemption',
            'homesteadamount',
            'hsamt',
            'hstdamount'
          ]);
          saleDateIdx = findColumnIndex(headerNorm, ['sale1date', 'lastsaledate', 'saledate', 'sale_date']);
          saleAmountIdx = findColumnIndex(headerNorm, ['sale1amount', 'lastsaleamount', 'saleamount', 'sale_price']);
          justValueIdx = findColumnIndex(headerNorm, ['justvalue', 'marketvalue', 'totalvalue', 'assessedvalue']);
          latitudeIdx = findColumnIndex(headerNorm, ['latitude', 'lat']);
          longitudeIdx = findColumnIndex(headerNorm, ['longitude', 'lon', 'lng']);

          continue;
        }

        scannedRows += 1;

        const cols = line.split('\t');
        const get = (idx: number | null) => (idx === null ? '' : (cols[idx] ?? '').trim());

        const addressLine1 = get(situsAddressIdx);
        const city = get(situsCityIdx);
        const state = 'FL';
        const postalCode = get(situsZipIdx);

        if (!addressLine1 || !city || !postalCode) {
          skippedInvalid += 1;
          continue;
        }

        const ownerName = [get(ownerName1Idx), get(ownerName2Idx)].filter(Boolean).join(' ').trim() || null;

        const ownerMailingAddressLine1 = get(mailAddr1Idx) || null;
        const ownerMailingAddressLine2 = get(mailAddr2Idx) || null;
        const mailingCity = get(mailCityIdx);
        const mailingState = get(mailStateIdx);
        const mailingZip = get(mailZipIdx);
        const mailingAddress = [ownerMailingAddressLine1, ownerMailingAddressLine2].filter(Boolean).join(' ');

        const homesteadAmount = parseNumber(get(homesteadIdx));
        const saleDate = parseDate(get(saleDateIdx));
        const saleAmount = parseNumber(get(saleAmountIdx));
        const justValue = parseNumber(get(justValueIdx));

        const latitude = parseNumber(get(latitudeIdx));
        const longitude = parseNumber(get(longitudeIdx));

        const { score, signals } = this.scorePublicRecordSellerOpportunity({
          situs: { addressLine1, city, state, postalCode },
          mailing: { addressLine1: mailingAddress, city: mailingCity, state: mailingState, postalCode: mailingZip },
          homesteadAmount,
          lastSaleDate: saleDate,
          lastSaleAmount: saleAmount,
          justValue,
          county: params.county
        });

        if (score < minScore) {
          skippedBelowScore += 1;
          continue;
        }

        candidatesRows += 1;
        const dedupeKey = this.makeDedupeKey(addressLine1, city, state, postalCode);

        batch.push({
          dedupeKey,
          source: 'PUBLIC_RECORDS',
          score,
          signals: signals as unknown as Prisma.InputJsonValue,
          addressLine1,
          city,
          state,
          postalCode,
          ownerName,
          ownerMailingAddressLine1,
          ownerMailingAddressLine2,
          ownerMailingCity: mailingCity || null,
          ownerMailingState: mailingState ? mailingState.toUpperCase() : null,
          ownerMailingPostalCode: mailingZip || null,
          county: params.county,
          latitude: Number.isFinite(latitude ?? NaN) ? (latitude as number) : null,
          longitude: Number.isFinite(longitude ?? NaN) ? (longitude as number) : null,
          lastSeenAt: new Date()
        });

        if (batch.length >= batchSize) {
          await flush();
        }

        if (candidatesRows >= maxPerDataset) {
          capped = true;
          break;
        }
      }
    } finally {
      rl.close();
      stream.destroy();
    }

    await flush();

    return {
      orgs: Array.from(orgStats.values()),
      scannedRows,
      candidates: candidatesRows,
      skippedInvalid,
      skippedBelowScore,
      capped
    };
  }

  private async ingestCollierSellerOpportunities(params: {
    zipPath: string;
    orgIds: string[];
    county: string;
  }): Promise<SellerOpportunityIngestResult | null> {
    if (!params.orgIds.length) {
      this.logger.warn('PUBLIC_RECORDS_SYNC_ORG_IDS is not set; skipping seller opportunity upsert for Collier intfiles.');
      return null;
    }

    const minScore = this.sellerOpportunityMinScore();
    const maxPerDataset = this.sellerOpportunityMaxPerDataset();
    const batchSize = 250;
    const orgStats = new Map<string, SellerOpportunityIngestOrgStats>(
      params.orgIds.map((orgId) => [orgId, { orgId, created: 0, updated: 0 }])
    );

    const directory = await unzipper.Open.file(params.zipPath);
    const salesEntry = findZipEntry(directory.files, ['int_sales.csv']);
    const parcelsEntry = findZipEntry(directory.files, ['int_parcels.csv']);

    if (!salesEntry || !parcelsEntry) {
      const entries = directory.files
        .filter((entry) => entry.type === 'File')
        .map((entry) => entry.path)
        .join(', ');
      throw new Error(`Collier intfiles zip missing expected files (INT_SALES.csv, INT_PARCELS.csv). Entries: ${entries}`);
    }

    const salesByParcelId = new Map<string, { saleDate: Date; saleAmount: number | null }>();
    const salesStream = salesEntry.stream();
    const salesRl = createInterface({ input: salesStream, crlfDelay: Infinity });
    try {
      let headerNorm: string[] | null = null;
      let idxParcel: number | null = null;
      let idxSaleDate: number | null = null;
      let idxSaleAmount: number | null = null;
      let idxQualified: number | null = null;

      for await (const rawLine of salesRl) {
        const line = rawLine.trimEnd();
        if (!line) continue;
        const cols = parseCsvLine(line);

        if (!headerNorm) {
          headerNorm = cols.map((value) => normalizeHeader(value));
          idxParcel = findColumnIndex(headerNorm, ['parcelid', 'parcel_id', 'parid']);
          idxSaleDate = findColumnIndex(headerNorm, ['saledate', 'sale_date']);
          idxSaleAmount = findColumnIndex(headerNorm, ['saleamount', 'sale_amount', 'saleprice', 'sale_price']);
          idxQualified = findColumnIndex(headerNorm, ['qualified', 'qual', 'qualifiedsale']);
          continue;
        }

        const parcelId = (idxParcel === null ? '' : cols[idxParcel] ?? '').trim();
        if (!parcelId) continue;
        const qualifiedRaw = (idxQualified === null ? '' : cols[idxQualified] ?? '').trim();
        if (qualifiedRaw && !isTruthyQualified(qualifiedRaw)) continue;
        const saleDate = parseDate((idxSaleDate === null ? '' : cols[idxSaleDate] ?? '').trim());
        if (!saleDate) continue;
        const saleAmount = parseNumber((idxSaleAmount === null ? '' : cols[idxSaleAmount] ?? '').trim());

        const existing = salesByParcelId.get(parcelId);
        if (!existing || existing.saleDate.getTime() < saleDate.getTime()) {
          salesByParcelId.set(parcelId, { saleDate, saleAmount });
        }
      }
    } finally {
      salesRl.close();
      salesStream.destroy();
    }

    const parcelsStream = parcelsEntry.stream();
    const parcelsRl = createInterface({ input: parcelsStream, crlfDelay: Infinity });

    let scannedRows = 0;
    let candidatesRows = 0;
    let skippedInvalid = 0;
    let skippedBelowScore = 0;
    let capped = false;
    let batch: SellerOpportunityCandidate[] = [];

    const flush = async () => {
      if (!batch.length) return;
      const stats = await this.upsertSellerOpportunityBatch(params.orgIds, batch);
      for (const entry of stats) {
        const current = orgStats.get(entry.orgId);
        if (!current) continue;
        current.created += entry.created;
        current.updated += entry.updated;
      }
      batch = [];
    };

    try {
      let headerNorm: string[] | null = null;
      let idxParcel: number | null = null;
      let idxSitusAddress: number | null = null;
      let idxSitusCity: number | null = null;
      let idxSitusZip: number | null = null;

      let idxOwnerName1: number | null = null;
      let idxOwnerName2: number | null = null;

      let idxMailAddr1: number | null = null;
      let idxMailAddr2: number | null = null;
      let idxMailAddr3: number | null = null;
      let idxMailCity: number | null = null;
      let idxMailState: number | null = null;
      let idxMailZip: number | null = null;

      let idxHomestead: number | null = null;
      let idxJustValue: number | null = null;
      let idxLat: number | null = null;
      let idxLon: number | null = null;

      for await (const rawLine of parcelsRl) {
        const line = rawLine.trimEnd();
        if (!line) continue;
        const cols = parseCsvLine(line);

        if (!headerNorm) {
          headerNorm = cols.map((value) => normalizeHeader(value));
          idxParcel = findColumnIndex(headerNorm, ['parcelid', 'parcel_id', 'parid']);
          idxSitusAddress = findColumnIndex(headerNorm, [
            'sitestreetaddress',
            'situsstreetaddress',
            'sitestreet',
            'situsstreet',
            'situsaddress',
            'siteaddress',
            'propertyaddress'
          ]);
          idxSitusCity = findColumnIndex(headerNorm, ['situscity', 'sitecity', 'city']);
          idxSitusZip = findColumnIndex(headerNorm, ['situszip', 'sitezip', 'zipcode', 'postalcode', 'zip']);

          idxOwnerName1 = findColumnIndex(headerNorm, ['ownerline1', 'ownername1', 'owner1', 'owner1name', 'ownername']);
          idxOwnerName2 = findColumnIndex(headerNorm, ['ownerline2', 'ownername2', 'owner2', 'owner2name']);

          idxMailAddr1 = findColumnIndex(headerNorm, ['ownerline3', 'mailingaddress', 'mailaddress1', 'mailaddr1', 'owneraddress1']);
          idxMailAddr2 = findColumnIndex(headerNorm, ['ownerline4', 'mailaddress2', 'mailaddr2', 'owneraddress2']);
          idxMailAddr3 = findColumnIndex(headerNorm, ['ownerline5']);
          idxMailCity = findColumnIndex(headerNorm, ['mailcity', 'mailingcity', 'ownercity']);
          idxMailState = findColumnIndex(headerNorm, ['mailstate', 'mailingstate', 'ownerstate']);
          idxMailZip = findColumnIndex(headerNorm, ['mailzip', 'mailingzip', 'ownerzip', 'mailzipcode']);

          idxHomestead = findColumnIndex(headerNorm, ['homestead', 'homesteadexemption', 'homesteadamount']);
          idxJustValue = findColumnIndex(headerNorm, ['justvalue', 'marketvalue', 'totalvalue', 'assessedvalue']);
          idxLat = findColumnIndex(headerNorm, ['latitude', 'lat']);
          idxLon = findColumnIndex(headerNorm, ['longitude', 'lon', 'lng']);
          continue;
        }

        scannedRows += 1;

        const parcelId = (idxParcel === null ? '' : cols[idxParcel] ?? '').trim();
        const addressLine1 = (idxSitusAddress === null ? '' : cols[idxSitusAddress] ?? '').trim();
        const city = (idxSitusCity === null ? '' : cols[idxSitusCity] ?? '').trim();
        const state = 'FL';
        const postalCode = (idxSitusZip === null ? '' : cols[idxSitusZip] ?? '').trim();

        if (!addressLine1 || !city || !postalCode) {
          skippedInvalid += 1;
          continue;
        }

        const ownerName = [
          (idxOwnerName1 === null ? '' : cols[idxOwnerName1] ?? '').trim(),
          (idxOwnerName2 === null ? '' : cols[idxOwnerName2] ?? '').trim()
        ]
          .filter(Boolean)
          .join(' ')
          .trim() || null;

        const ownerMailingAddressLine1 = (idxMailAddr1 === null ? '' : cols[idxMailAddr1] ?? '').trim() || null;
        const ownerMailingAddressLine2 =
          [
            (idxMailAddr2 === null ? '' : cols[idxMailAddr2] ?? '').trim(),
            (idxMailAddr3 === null ? '' : cols[idxMailAddr3] ?? '').trim()
          ]
            .filter(Boolean)
            .join(' ')
            .trim() || null;

        const mailingAddress = [
          ownerMailingAddressLine1,
          ownerMailingAddressLine2
        ]
          .filter(Boolean)
          .join(' ');
        const mailingCity = (idxMailCity === null ? '' : cols[idxMailCity] ?? '').trim();
        const mailingState = (idxMailState === null ? '' : cols[idxMailState] ?? '').trim();
        const mailingZip = (idxMailZip === null ? '' : cols[idxMailZip] ?? '').trim();

        const homesteadAmount = parseNumber((idxHomestead === null ? '' : cols[idxHomestead] ?? '').trim());
        const justValue = parseNumber((idxJustValue === null ? '' : cols[idxJustValue] ?? '').trim());
        const latitude = parseNumber((idxLat === null ? '' : cols[idxLat] ?? '').trim());
        const longitude = parseNumber((idxLon === null ? '' : cols[idxLon] ?? '').trim());

        const sale = parcelId ? salesByParcelId.get(parcelId) : undefined;

        const { score, signals } = this.scorePublicRecordSellerOpportunity({
          situs: { addressLine1, city, state, postalCode },
          mailing: { addressLine1: mailingAddress, city: mailingCity, state: mailingState, postalCode: mailingZip },
          homesteadAmount,
          lastSaleDate: sale?.saleDate ?? null,
          lastSaleAmount: sale?.saleAmount ?? null,
          justValue,
          county: params.county
        });

        if (score < minScore) {
          skippedBelowScore += 1;
          continue;
        }

        candidatesRows += 1;
        const dedupeKey = this.makeDedupeKey(addressLine1, city, state, postalCode);
        batch.push({
          dedupeKey,
          source: 'PUBLIC_RECORDS',
          score,
          signals: signals as unknown as Prisma.InputJsonValue,
          addressLine1,
          city,
          state,
          postalCode,
          ownerName,
          ownerMailingAddressLine1,
          ownerMailingAddressLine2,
          ownerMailingCity: mailingCity || null,
          ownerMailingState: mailingState ? mailingState.toUpperCase() : null,
          ownerMailingPostalCode: mailingZip || null,
          county: params.county,
          latitude: Number.isFinite(latitude ?? NaN) ? (latitude as number) : null,
          longitude: Number.isFinite(longitude ?? NaN) ? (longitude as number) : null,
          lastSeenAt: new Date()
        });

        if (batch.length >= batchSize) {
          await flush();
        }

        if (candidatesRows >= maxPerDataset) {
          capped = true;
          break;
        }
      }
    } finally {
      parcelsRl.close();
      parcelsStream.destroy();
    }

    await flush();

    return {
      orgs: Array.from(orgStats.values()),
      scannedRows,
      candidates: candidatesRows,
      skippedInvalid,
      skippedBelowScore,
      capped
    };
  }

  private async upsertSellerOpportunityBatch(
    orgIds: string[],
    batch: SellerOpportunityCandidate[]
  ): Promise<SellerOpportunityIngestOrgStats[]> {
    const uniqueByKey = new Map<string, SellerOpportunityCandidate>();
    for (const item of batch) {
      const existing = uniqueByKey.get(item.dedupeKey);
      if (!existing || existing.score < item.score) {
        uniqueByKey.set(item.dedupeKey, item);
      }
    }
    const items = Array.from(uniqueByKey.values());
    if (!items.length) return orgIds.map((orgId) => ({ orgId, created: 0, updated: 0 }));

    const stats: SellerOpportunityIngestOrgStats[] = [];
    for (const orgId of orgIds) {
      const dedupeKeys = items.map((item) => item.dedupeKey);
      const existing = await this.prisma.sellerOpportunity.findMany({
        where: { organizationId: orgId, dedupeKey: { in: dedupeKeys } },
        select: { dedupeKey: true, source: true }
      });
      const existingByKey = new Map(existing.map((row) => [row.dedupeKey, row.source]));

      const createData: Prisma.SellerOpportunityCreateManyInput[] = [];
      const updateData: SellerOpportunityCandidate[] = [];

      for (const item of items) {
        const existingSource = existingByKey.get(item.dedupeKey);
        if (!existingSource) {
          createData.push({
            organizationId: orgId,
            dedupeKey: item.dedupeKey,
            source: item.source,
            status: SellerOpportunityStatus.NEW,
            score: item.score,
            signals: item.signals,
            addressLine1: item.addressLine1,
            city: item.city,
            state: item.state,
            postalCode: item.postalCode,
            ownerName: item.ownerName,
            ownerMailingAddressLine1: item.ownerMailingAddressLine1,
            ownerMailingAddressLine2: item.ownerMailingAddressLine2,
            ownerMailingCity: item.ownerMailingCity,
            ownerMailingState: item.ownerMailingState,
            ownerMailingPostalCode: item.ownerMailingPostalCode,
            county: item.county ?? null,
            latitude: item.latitude ?? null,
            longitude: item.longitude ?? null,
            lastSeenAt: item.lastSeenAt
          });
          continue;
        }

        if (String(existingSource).toUpperCase() === 'MLS') {
          // Avoid overwriting MLS-based opportunities; those are managed by the seller-opportunity engine.
          continue;
        }

        updateData.push(item);
      }

      let created = 0;
      let updated = 0;

      if (createData.length) {
        const res = await this.prisma.sellerOpportunity.createMany({ data: createData, skipDuplicates: true });
        created = res.count;
      }

      for (const item of updateData) {
        await this.prisma.sellerOpportunity.update({
          where: { organizationId_dedupeKey: { organizationId: orgId, dedupeKey: item.dedupeKey } },
          data: {
            source: item.source,
            score: item.score,
            signals: item.signals,
            addressLine1: item.addressLine1,
            city: item.city,
            state: item.state,
            postalCode: item.postalCode,
            ownerName: item.ownerName,
            ownerMailingAddressLine1: item.ownerMailingAddressLine1,
            ownerMailingAddressLine2: item.ownerMailingAddressLine2,
            ownerMailingCity: item.ownerMailingCity,
            ownerMailingState: item.ownerMailingState,
            ownerMailingPostalCode: item.ownerMailingPostalCode,
            county: item.county ?? null,
            latitude: item.latitude ?? null,
            longitude: item.longitude ?? null,
            lastSeenAt: item.lastSeenAt
          }
        });
        updated += 1;
      }

      stats.push({ orgId, created, updated });
    }

    return stats;
  }

  private scorePublicRecordSellerOpportunity(input: {
    situs: { addressLine1: string; city: string; state: string; postalCode: string };
    mailing: { addressLine1?: string | null; city?: string | null; state?: string | null; postalCode?: string | null };
    homesteadAmount: number | null;
    lastSaleDate: Date | null;
    lastSaleAmount: number | null;
    justValue: number | null;
    county: string | null;
  }): { score: number; signals: SellerSignal[] } {
    const signals: SellerSignal[] = [];
    const add = (signal: SellerSignal) => {
      if (signals.some((existing) => existing.key === signal.key)) return;
      signals.push(signal);
    };

    const situs = `${input.situs.addressLine1} ${input.situs.city} ${input.situs.state} ${input.situs.postalCode}`;
    const mailing = `${input.mailing.addressLine1 ?? ''} ${input.mailing.city ?? ''} ${input.mailing.state ?? ''} ${input.mailing.postalCode ?? ''}`.trim();

    const situsNorm = this.normalizeAddressPart(situs);
    const mailingNorm = this.normalizeAddressPart(mailing);

    const situsZip = input.situs.postalCode.trim();
    const mailingZip = (input.mailing.postalCode ?? '').trim();
    const absentee =
      Boolean(mailingNorm) &&
      mailingNorm.length > 4 &&
      ((mailingZip && situsZip && mailingZip !== situsZip) || mailingNorm !== situsNorm);

    if (absentee) {
      add({
        key: 'ABSENTEE_OWNER',
        label: 'Absentee owner',
        weight: 30,
        value: input.mailing.state ? input.mailing.state.toUpperCase() : undefined,
        reason: 'Mailing address differs from the property address, often indicating a non-owner-occupied property.'
      });
    }

    const mailingState = (input.mailing.state ?? '').trim().toUpperCase();
    if (absentee && mailingState && mailingState !== 'FL') {
      add({
        key: 'OUT_OF_STATE_OWNER',
        label: 'Out-of-state owner',
        weight: 10,
        value: mailingState,
        reason: 'Owners who live out of state tend to be more open to selling or managing remotely.'
      });
    }

    const homestead = typeof input.homesteadAmount === 'number' && Number.isFinite(input.homesteadAmount)
      ? input.homesteadAmount
      : null;
    if (homestead !== null && homestead <= 0) {
      add({
        key: 'NO_HOMESTEAD',
        label: 'No homestead exemption',
        weight: 20,
        reason: 'No homestead exemption is a common indicator of non-owner occupancy or investment ownership.'
      });
    }

    if (input.lastSaleDate && Number.isFinite(input.lastSaleDate.getTime())) {
      const years = Math.floor((Date.now() - input.lastSaleDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      if (years >= 20) {
        add({
          key: 'LONG_HOLD_20Y',
          label: 'Long-term ownership',
          weight: 25,
          value: `${years}y`,
          reason: 'Owners who have held a property for 20+ years often have high equity and may be considering a transition.'
        });
      } else if (years >= 10) {
        add({
          key: 'LONG_HOLD_10Y',
          label: 'Long-term ownership',
          weight: 15,
          value: `${years}y`,
          reason: 'Longer ownership duration can correlate with accumulated equity and higher likelihood of selling.'
        });
      }
    }

    const justValue = typeof input.justValue === 'number' && Number.isFinite(input.justValue) ? input.justValue : null;
    if (justValue !== null) {
      if (justValue >= 1_000_000) {
        add({
          key: 'HIGH_VALUE',
          label: 'High-value property',
          weight: 15,
          value: `$${Math.round(justValue).toLocaleString()}`,
          reason: 'Higher-value homes typically justify priority outreach due to higher upside.'
        });
      } else if (justValue >= 500_000) {
        add({
          key: 'MID_HIGH_VALUE',
          label: 'High-value property',
          weight: 10,
          value: `$${Math.round(justValue).toLocaleString()}`,
          reason: 'Higher-value homes can justify priority outreach due to higher upside.'
        });
      }
    }

    const lastSaleAmount =
      typeof input.lastSaleAmount === 'number' && Number.isFinite(input.lastSaleAmount) ? input.lastSaleAmount : null;
    if (justValue !== null && lastSaleAmount !== null && lastSaleAmount > 0) {
      const ratio = justValue / lastSaleAmount;
      if (ratio >= 2) {
        add({
          key: 'HIGH_EQUITY',
          label: 'High equity',
          weight: 15,
          value: `${ratio.toFixed(1)}×`,
          reason: 'Assessed/market value significantly exceeds the last recorded sale amount, suggesting equity upside.'
        });
      }
    }

    const score = clamp(
      signals.reduce((sum, signal) => sum + signal.weight, 0),
      0,
      100
    );
    signals.sort((a, b) => b.weight - a.weight);

    return { score, signals };
  }

  private async repairFloridaPublicRecordOpportunities(orgIds: string[], counties: string[], state: string) {
    const desiredState = state.trim().toUpperCase();
    for (const orgId of orgIds) {
      const bad = await this.prisma.sellerOpportunity.findMany({
        where: {
          organizationId: orgId,
          source: 'PUBLIC_RECORDS',
          county: { in: counties },
          OR: [{ state: { not: desiredState } }, { addressLine1: 'U' }]
        },
        select: {
          id: true,
          addressLine1: true,
          city: true,
          postalCode: true,
          status: true,
          convertedLeadId: true,
          score: true,
          signals: true
        }
      });

      for (const record of bad) {
        if (record.addressLine1.trim() === 'U') {
          if (record.convertedLeadId) {
            await this.prisma.sellerOpportunity.update({
              where: { id: record.id },
              data: { state: desiredState }
            });
          } else {
            await this.prisma.sellerOpportunity.delete({ where: { id: record.id } }).catch(() => undefined);
          }
          continue;
        }

        const targetDedupeKey = this.makeDedupeKey(record.addressLine1, record.city, desiredState, record.postalCode);
        const existing = await this.prisma.sellerOpportunity.findUnique({
          where: { organizationId_dedupeKey: { organizationId: orgId, dedupeKey: targetDedupeKey } },
          select: {
            id: true,
            source: true,
            status: true,
            convertedLeadId: true,
            score: true,
            signals: true
          }
        });

        if (!existing) {
          await this.prisma.sellerOpportunity.update({
            where: { id: record.id },
            data: { state: desiredState, dedupeKey: targetDedupeKey }
          });
          continue;
        }

        if (String(existing.source ?? '').toUpperCase() === 'MLS') {
          await this.prisma.sellerOpportunity.delete({ where: { id: record.id } }).catch(() => undefined);
          continue;
        }

        const mergedConvertedLeadId = existing.convertedLeadId ?? record.convertedLeadId ?? null;
        const mergedStatus = mergedConvertedLeadId
          ? SellerOpportunityStatus.CONVERTED
          : existing.status === SellerOpportunityStatus.DISMISSED || record.status === SellerOpportunityStatus.DISMISSED
            ? SellerOpportunityStatus.DISMISSED
            : SellerOpportunityStatus.NEW;

        const mergedScore = Math.max(existing.score ?? 0, record.score ?? 0);
        const mergedSignals = mergeSignals(existing.signals, record.signals);

        await this.prisma.sellerOpportunity.update({
          where: { id: existing.id },
          data: {
            status: mergedStatus,
            convertedLeadId: mergedConvertedLeadId,
            score: mergedScore,
            signals: mergedSignals as unknown as Prisma.InputJsonValue
          }
        });

        await this.prisma.sellerOpportunity.delete({ where: { id: record.id } }).catch(() => undefined);
      }
    }
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizeHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const findColumnIndex = (headersNormalized: string[], candidates: string[]): number | null => {
  const normalizedCandidates = candidates.map((candidate) => normalizeHeader(candidate)).filter(Boolean);

  for (const candidate of normalizedCandidates) {
    const exactIdx = headersNormalized.indexOf(candidate);
    if (exactIdx !== -1) return exactIdx;
  }

  for (const candidate of normalizedCandidates) {
    if (candidate.length < 5) continue;
    const idx = headersNormalized.findIndex((header) => header.includes(candidate));
    if (idx !== -1) return idx;
  }

  return null;
};

const findZipEntry = (entries: Array<{ path: string; type: string }>, fileNames: string[]) => {
  const desired = fileNames.map((name) => name.toLowerCase());
  return entries.find((entry: any) => {
    if (entry.type !== 'File') return false;
    const lower = String(entry.path ?? '').toLowerCase();
    return desired.some((suffix) => lower.endsWith(suffix));
  }) as any;
};

const parseNumber = (raw: string | null | undefined): number | null => {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/[$,]/g, '');
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
};

const parseDate = (raw: string | null | undefined): Date | null => {
  if (!raw) return null;
  const value = String(raw).trim();
  if (!value || value === '0' || value.toLowerCase() === 'null') return null;

  if (/^\d{8}$/.test(value)) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6));
    const day = Number(value.slice(6, 8));
    const date = new Date(Date.UTC(year, month - 1, day));
    return Number.isFinite(date.getTime()) ? date : null;
  }

  const mdY = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdY) {
    const month = Number(mdY[1]);
    const day = Number(mdY[2]);
    const year = Number(mdY[3].length === 2 ? `20${mdY[3]}` : mdY[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return Number.isFinite(date.getTime()) ? date : null;
  }

  const iso = new Date(value);
  return Number.isFinite(iso.getTime()) ? iso : null;
};

const parseCsvLine = (line: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index] ?? '';
    if (inQuotes) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      result.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current);
  return result;
};

const isTruthyQualified = (value: string) => {
  const normalized = value.trim().toLowerCase();
  return normalized === 'y' || normalized === 'yes' || normalized === 'true' || normalized === '1' || normalized === 't';
};

const mergeSignals = (first: unknown, second: unknown): unknown[] => {
  const toArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);
  const all = [...toArray(first), ...toArray(second)];
  const byKey = new Map<string, any>();

  for (const raw of all) {
    if (!raw || typeof raw !== 'object') continue;
    const key = (raw as any).key;
    if (typeof key !== 'string' || !key) continue;
    const weight = Number((raw as any).weight ?? 0);
    const existing = byKey.get(key);
    if (!existing || weight > Number(existing.weight ?? 0)) {
      byKey.set(key, { ...raw, weight: Number.isFinite(weight) ? weight : 0 });
    }
  }

  return Array.from(byKey.values()).sort((a, b) => Number(b.weight ?? 0) - Number(a.weight ?? 0));
};

const safeJsonParse = <T>(value: string | null | undefined): T | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

const createReadStreamCompat = (path: string) => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs') as typeof import('fs');
  return fs.createReadStream(path);
};
