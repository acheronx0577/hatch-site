import { Injectable } from '@nestjs/common';
import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable, Transform } from 'stream';
import fetch from 'node-fetch';

@Injectable()
export class S3Service {
  private readonly client = new S3Client({
    region: process.env.AWS_REGION ?? 'us-east-2',
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
          }
        : undefined
  });

  private readonly bucket = process.env.AWS_S3_BUCKET ?? '';
  private readonly region = process.env.AWS_REGION ?? 'us-east-2';
  private readonly maxDownloadBytes = Number(process.env.S3_MAX_DOWNLOAD_BYTES ?? 250 * 1024 * 1024); // 250MB limit by default

  async uploadObject(key: string, body: Buffer | string | Readable, contentType: string) {
    if (!this.bucket) {
      throw new Error('AWS_S3_BUCKET is not configured');
    }

    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
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
    if (!this.bucket) {
      throw new Error('AWS_S3_BUCKET is not configured');
    }
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
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
    if (!this.bucket) {
      throw new Error('AWS_S3_BUCKET is not configured');
    }
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key
    });
    return getSignedUrl(this.client, cmd, { expiresIn: expiresInSeconds });
  }

  async getPresignedUploadUrl(params: {
    key: string;
    contentType?: string;
    expiresInSeconds?: number;
  }): Promise<string> {
    if (!this.bucket) {
      throw new Error('AWS_S3_BUCKET is not configured');
    }
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      ContentType: params.contentType ?? 'application/octet-stream'
    });
    return getSignedUrl(this.client, cmd, { expiresIn: params.expiresInSeconds ?? 900 });
  }

  buildPublicUrl(key: string): string {
    const base =
      process.env.S3_PUBLIC_BASE_URL ??
      (this.bucket ? `https://${this.bucket}.s3.${this.region}.amazonaws.com` : '');
    return `${base.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`;
  }

  async searchKeys(params: { prefix?: string; contains: string[]; maxKeys?: number }): Promise<string[]> {
    if (!this.bucket) {
      return [];
    }

    const prefix = params.prefix;
    const contains = params.contains.map((value) => value.toLowerCase()).filter(Boolean);
    const maxKeys = params.maxKeys ?? 50;
    const results: string[] = [];
    let token: string | undefined;

    while (results.length < maxKeys) {
      const res = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
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
}
