import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

type CacheEntry = { value: string; expiresAtMs: number };

@Injectable()
export class AiCacheService implements OnModuleDestroy {
  private readonly log = new Logger(AiCacheService.name);
  private readonly memory = new Map<string, CacheEntry>();
  private redis: Redis | null = null;
  private redisReady = false;

  private shouldUseRedis() {
    return process.env.NODE_ENV !== 'test' && Boolean(process.env.REDIS_URL);
  }

  private getRedis(): Redis | null {
    if (!this.shouldUseRedis()) {
      return null;
    }

    if (this.redis) {
      return this.redis;
    }

    const url = process.env.REDIS_URL as string;
    this.redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: Number(process.env.AI_REDIS_CONNECT_TIMEOUT_MS ?? 500),
      lazyConnect: true
    });

    this.redis.on('ready', () => {
      this.redisReady = true;
    });

    this.redis.on('error', (err) => {
      this.redisReady = false;
      this.log.warn(`Redis cache error: ${err.message}`);
    });

    return this.redis;
  }

  async getJson<T>(key: string): Promise<T | null> {
    const redis = this.getRedis();
    if (redis) {
      try {
        if (!this.redisReady) {
          await redis.connect();
        }
        const raw = await redis.get(key);
        if (raw) {
          return JSON.parse(raw) as T;
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error ?? 'unknown');
        this.log.warn(`Redis cache get failed (${key}): ${detail}`);
      }
    }

    const entry = this.memory.get(key);
    if (!entry) {
      return null;
    }
    if (Date.now() > entry.expiresAtMs) {
      this.memory.delete(key);
      return null;
    }
    try {
      return JSON.parse(entry.value) as T;
    } catch {
      this.memory.delete(key);
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const payload = JSON.stringify(value);
    const expiresAtMs = Date.now() + ttlSeconds * 1000;

    const redis = this.getRedis();
    if (redis) {
      try {
        if (!this.redisReady) {
          await redis.connect();
        }
        await redis.set(key, payload, 'EX', ttlSeconds);
        return;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error ?? 'unknown');
        this.log.warn(`Redis cache set failed (${key}): ${detail}`);
      }
    }

    this.memory.set(key, { value: payload, expiresAtMs });
  }

  async del(key: string): Promise<void> {
    const redis = this.getRedis();
    if (redis) {
      try {
        if (!this.redisReady) {
          await redis.connect();
        }
        await redis.del(key);
      } catch {
        // ignore
      }
    }
    this.memory.delete(key);
  }

  async onModuleDestroy() {
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {
        // ignore
      }
    }
  }
}

