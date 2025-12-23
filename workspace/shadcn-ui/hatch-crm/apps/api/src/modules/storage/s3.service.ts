import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable, Transform } from 'stream';
import fetch from 'node-fetch';

@Injectable()
export class S3Service {
  private readonly endpoint = (process.env.S3_ENDPOINT ?? process.env.AWS_S3_ENDPOINT ?? '').trim() || undefined;
  private readonly forcePathStyle = this.resolveForcePathStyle(this.endpoint);
  private readonly ensuredBuckets = new Set<string>();
  private readonly client: S3Client;

  private readonly dataBucket =
    process.env.AWS_S3_BUCKET_DATA ??
    process.env.AWS_S3_BUCKET_EXTERNAL_DATA ??
    process.env.AWS_S3_BUCKET_AGGREGATORS ??
    '';

  private readonly docsBucket =
    process.env.AWS_S3_BUCKET_DOCS ??
    process.env.AWS_S3_BUCKET_CONTRACTS ??
    process.env.AWS_S3_BUCKET ??
    '';

  private readonly mediaBucket =
    process.env.AWS_S3_BUCKET_MEDIA ?? process.env.AWS_S3_BUCKET_PROPERTY ?? '';

  private readonly defaultBucket = this.docsBucket || this.mediaBucket;

  private readonly region = process.env.AWS_REGION ?? 'us-east-2';
  private readonly maxDownloadBytes = Number(process.env.S3_MAX_DOWNLOAD_BYTES ?? 250 * 1024 * 1024); // 250MB limit by default
  private readonly docsPublicBase =
    process.env.S3_PUBLIC_BASE_URL_DOCS ??
    process.env.S3_PUBLIC_BASE_URL_CONTRACTS ??
    process.env.S3_PUBLIC_BASE_URL;
  private readonly mediaPublicBase =
    process.env.S3_PUBLIC_BASE_URL_MEDIA ??
    process.env.S3_PUBLIC_BASE_URL_PROPERTY ??
    process.env.S3_PUBLIC_BASE_URL;

  constructor() {
    const region = process.env.AWS_REGION ?? 'us-east-2';
    this.client = new S3Client({
      region,
      credentials:
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            }
          : undefined,
      ...(this.endpoint
        ? {
            endpoint: this.endpoint,
            forcePathStyle: this.forcePathStyle
          }
        : {})
    });
  }

  isConfigured(): boolean {
    return Boolean(this.defaultBucket);
  }

  private resolveForcePathStyle(endpoint: string | undefined): boolean {
    const configured = (process.env.S3_FORCE_PATH_STYLE ?? process.env.AWS_S3_FORCE_PATH_STYLE ?? '').trim();
    if (configured) {
      return configured.toLowerCase() === 'true';
    }

    if (!endpoint) {
      return false;
    }

    try {
      const url = new URL(endpoint);
      const host = url.hostname.toLowerCase();
      if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')) {
        return true;
      }
    } catch {
      // ignore
    }

    return false;
  }

  private shouldAutoCreateBuckets(): boolean {
    const configured = (process.env.S3_AUTO_CREATE_BUCKETS ?? process.env.S3_AUTO_CREATE_BUCKET ?? '').trim();
    if (configured) {
      return configured.toLowerCase() === 'true';
    }

    if (process.env.NODE_ENV === 'production') {
      return false;
    }

    if (!this.endpoint) {
      return false;
    }

    try {
      const url = new URL(this.endpoint);
      const host = url.hostname.toLowerCase();
      return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost');
    } catch {
      return false;
    }
  }

  private async ensureBucketExists(bucket: string) {
    if (!bucket) return;
    if (this.ensuredBuckets.has(bucket)) return;
    if (!this.shouldAutoCreateBuckets()) return;

    try {
      await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
      this.ensuredBuckets.add(bucket);
      return;
    } catch {
      // continue to attempt create
    }

    try {
      await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch {
      // ignore (bucket may already exist, or permissions may block)
    }

    this.ensuredBuckets.add(bucket);
  }

  async uploadObject(key: string, body: Buffer | string | Readable, contentType: string) {
    const bucket = this.resolveBucket({ key });
    await this.ensureBucketExists(bucket);

    const cmd = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType
    });

    await this.client.send(cmd);
    return { key };
  }

  async uploadFromUrl(key: string, url: string, contentType?: string) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
    }

    const ct = contentType ?? res.headers.get('content-type') ?? 'application/octet-stream';
    const lengthHeader = res.headers.get('content-length');
    const contentLength = lengthHeader ? Number.parseInt(lengthHeader, 10) : null;
    if (this.maxDownloadBytes > 0 && contentLength && contentLength > this.maxDownloadBytes) {
      throw new Error(
        `Remote file exceeds configured limit of ${this.maxDownloadBytes} bytes (content-length=${contentLength})`
      );
    }

    const rawBody = res.body;
    const body = rawBody
      ? rawBody instanceof Readable
        ? rawBody
        : Readable.fromWeb(rawBody as any)
      : Readable.from([]);
    const guardedStream =
      this.maxDownloadBytes > 0 ? body.pipe(this.createSizeGuard(this.maxDownloadBytes)) : body;

    return this.uploadObject(key, guardedStream, ct);
  }

  private createSizeGuard(limit: number) {
    let total = 0;
    return new Transform({
      transform(chunk, _encoding, callback) {
        total += chunk.length;
        if (limit > 0 && total > limit) {
          callback(new Error(`Remote file exceeds configured limit of ${limit} bytes`));
          return;
        }
        callback(null, chunk);
      }
    });
  }

  async getObjectStream(key: string): Promise<Readable> {
    const bucket = this.resolveBucket({ key });
    await this.ensureBucketExists(bucket);
    const cmd = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });
    const res = await this.client.send(cmd);
    const body = res.Body;
    if (!body) {
      throw new Error(`No object body returned for key ${key}`);
    }
    return body instanceof Readable ? body : Readable.from(body as any);
  }

  async getObjectBuffer(key: string): Promise<Buffer> {
    const stream = await this.getObjectStream(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async putObject(params: { key: string; body: Buffer | string | Readable; contentType: string }) {
    return this.uploadObject(params.key, params.body, params.contentType);
  }

  async getPresignedUrl(key: string, expiresInSeconds = 900): Promise<string> {
    const bucket = this.resolveBucket({ key });
    await this.ensureBucketExists(bucket);
    const cmd = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });
    return getSignedUrl(this.client, cmd, { expiresIn: expiresInSeconds });
  }

  async getPresignedUploadUrl(params: {
    key: string;
    contentType?: string;
    expiresInSeconds?: number;
  }): Promise<string> {
    const bucket = this.resolveBucket({ key: params.key });
    await this.ensureBucketExists(bucket);
    const cmd = new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      ContentType: params.contentType ?? 'application/octet-stream'
    });
    return getSignedUrl(this.client, cmd, { expiresIn: params.expiresInSeconds ?? 900 });
  }

  buildPublicUrl(key: string): string {
    const bucket = this.resolveBucket({ key });
    if (!this.publicBaseForBucket(bucket) && this.endpoint) {
      const endpoint = this.endpoint.replace(/\/+$/, '');
      return `${endpoint}/${bucket}/${key.replace(/^\/+/, '')}`;
    }
    const base =
      this.publicBaseForBucket(bucket) || `https://${bucket}.s3.${this.region}.amazonaws.com`;
    return `${base.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`;
  }

  async searchKeys(params: { prefix?: string; contains: string[]; maxKeys?: number }): Promise<string[]> {
    const bucket = this.resolveBucket({ prefix: params.prefix });
    await this.ensureBucketExists(bucket);

    const prefix = params.prefix;
    const contains = params.contains.map((value) => value.toLowerCase()).filter(Boolean);
    const maxKeys = params.maxKeys ?? 50;
    const results: string[] = [];
    let token: string | undefined;

    while (results.length < maxKeys) {
      const res = await this.client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: token,
          MaxKeys: 200
        })
      );

      for (const object of res.Contents ?? []) {
        if (!object.Key) continue;
        const keyLower = object.Key.toLowerCase();
        const match = contains.length === 0 ? true : contains.some((needle) => keyLower.includes(needle));
        if (match) {
          results.push(object.Key);
          if (results.length >= maxKeys) break;
        }
      }

      if (!res.IsTruncated || !res.NextContinuationToken) {
        break;
      }
      token = res.NextContinuationToken;
    }

    return results;
  }

  private resolveBucket(input: { key?: string; prefix?: string }): string {
    const target = input.key ?? input.prefix ?? '';
    const isPropertyMedia = target.startsWith('property-images/');
    const isExternalData =
      target.startsWith('raw/') ||
      target.startsWith('normalized/') ||
      target.startsWith('manifests/') ||
      target.startsWith('public-records/') ||
      target.startsWith('batchdata/') ||
      target.startsWith('mls-raw/');

    if (isPropertyMedia && this.mediaBucket) {
      return this.mediaBucket;
    }

    if (isExternalData && this.dataBucket) {
      return this.dataBucket;
    }

    if (!isPropertyMedia && this.docsBucket) {
      return this.docsBucket;
    }

    if (this.docsBucket) {
      return this.docsBucket;
    }
    if (this.mediaBucket) {
      return this.mediaBucket;
    }
    if (this.defaultBucket) {
      return this.defaultBucket;
    }

    throw new ServiceUnavailableException(
      'Object storage is not configured. Set AWS_S3_BUCKET (and for local MinIO: S3_ENDPOINT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY).'
    );
  }

  private publicBaseForBucket(bucket: string): string | undefined {
    if (this.mediaBucket && bucket === this.mediaBucket) {
      return this.mediaPublicBase;
    }
    if (this.docsBucket && bucket === this.docsBucket) {
      return this.docsPublicBase;
    }
    return this.docsPublicBase ?? this.mediaPublicBase;
  }
}
