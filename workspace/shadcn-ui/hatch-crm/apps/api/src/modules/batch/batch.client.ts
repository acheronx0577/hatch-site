import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosInstance } from 'axios';

export interface BatchEventDto extends Record<string, unknown> {
  id: string;
  type: string;
  occurredAt?: string;
  occurred_at?: string;
  createdAt?: string;
  created_at?: string;
}

export interface BatchEventsResponse {
  events: BatchEventDto[];
  page: number;
  limit: number;
  total?: number;
}

export interface BatchUser extends Record<string, unknown> {
  id: string;
}

@Injectable()
export class BatchClient {
  private readonly http?: AxiosInstance;
  private readonly logger = new Logger(BatchClient.name);
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    const token = this.configService.get<string>('BATCH_API_TOKEN') ?? process.env.BATCH_API_TOKEN;
    if (!token) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('BATCH_API_TOKEN is not configured - Batch integration cannot start');
      }
      this.enabled = false;
      this.logger.warn('BATCH_API_TOKEN is not configured; Batch integration is disabled.');
      return;
    }
    this.enabled = true;
    this.http = axios.create({
      baseURL: 'https://api.batchdata.com/v1',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    });
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private getHttp(): AxiosInstance {
    if (!this.http) {
      throw new Error('Batch integration is disabled (missing BATCH_API_TOKEN).');
    }
    return this.http;
  }

  async fetchEvents(page: number, limit: number): Promise<BatchEventsResponse> {
    const http = this.getHttp();
    try {
      const response = await http.get('/events', { params: { page, limit } });
      const data = response.data ?? {};
      const events: BatchEventDto[] = data.events ?? data.data ?? [];

      return {
        events,
        page: data.page ?? page,
        limit: data.limit ?? limit,
        total: data.total ?? data.count
      };
    } catch (error) {
      this.logger.error(`Failed to fetch Batch events for page ${page}: ${error}`);
      throw error;
    }
  }

  async fetchUser(userId: string): Promise<BatchUser> {
    const http = this.getHttp();
    try {
      const response = await http.get(`/users/${userId}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch Batch user ${userId}: ${error}`);
      throw error;
    }
  }
}
