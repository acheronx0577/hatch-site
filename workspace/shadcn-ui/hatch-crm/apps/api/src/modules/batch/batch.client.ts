import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

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
  private readonly http: AxiosInstance;
  private readonly logger = new Logger(BatchClient.name);

  constructor(private readonly configService: ConfigService) {
    const token = this.configService.get<string>('BATCH_API_TOKEN') ?? process.env.BATCH_API_TOKEN;
    if (!token) {
      throw new Error('BATCH_API_TOKEN is not configured - Batch integration cannot start');
    }
    this.http = axios.create({
      baseURL: 'https://api.batchdata.com/v1',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    });
  }

  async fetchEvents(page: number, limit: number): Promise<BatchEventsResponse> {
    try {
      const response = await this.http.get('/events', { params: { page, limit } });
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
    try {
      const response = await this.http.get(`/users/${userId}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch Batch user ${userId}: ${error}`);
      throw error;
    }
  }
}
