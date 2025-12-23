import { BadRequestException, Injectable } from '@nestjs/common';
import Handlebars from 'handlebars';

import type { AiPromptTemplate } from '@hatch/db';

import { PrismaService } from '@/modules/prisma/prisma.service';
import { AiCacheService } from './ai-cache.service';
import { AiFeature } from '../types/ai-request.types';

export type CreatePromptDto = {
  organizationId: string;
  name: string;
  systemPrompt: string;
  userPromptTemplate: string;
  provider?: string | null;
  model?: string | null;
  maxTokens?: number | null;
  temperature?: number | null;
  description?: string | null;
  createdByUserId: string;
  isDefault?: boolean;
};

@Injectable()
export class AiPromptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AiCacheService
  ) {}

  async getPrompt(feature: AiFeature, brokerageId?: string, name?: string): Promise<AiPromptTemplate> {
    const organizationId = (brokerageId ?? process.env.DEFAULT_ORG_ID ?? '').trim();
    if (!organizationId) {
      throw new BadRequestException('brokerageId is required to resolve AI prompts');
    }

    const cacheKey = this.cacheKey(feature, organizationId, name);
    const cached = await this.cache.getJson<AiPromptTemplate>(cacheKey);
    if (cached) {
      return cached;
    }

    const prompt =
      (name
        ? await this.prisma.aiPromptTemplate.findFirst({
            where: { organizationId, feature, name, isActive: true },
            orderBy: { version: 'desc' }
          })
        : null) ??
      (await this.prisma.aiPromptTemplate.findFirst({
        where: { organizationId, feature, isActive: true, isDefault: true },
        orderBy: { version: 'desc' }
      })) ??
      (await this.prisma.aiPromptTemplate.findFirst({
        where: { organizationId, feature, isActive: true },
        orderBy: { version: 'desc' }
      })) ??
      (await this.prisma.aiPromptTemplate.findFirst({
        where: { organizationId, feature },
        orderBy: { version: 'desc' }
      }));

    if (!prompt) {
      throw new BadRequestException(`No AI prompt template configured for feature=${feature}`);
    }

    await this.cache.setJson(cacheKey, prompt, 5 * 60);
    return prompt;
  }

  interpolate(template: string, variables: Record<string, any>): string {
    try {
      const compiled = Handlebars.compile(template, {
        strict: true,
        noEscape: false
      });
      return compiled(variables ?? {});
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error ?? 'unknown');
      throw new BadRequestException(`Prompt interpolation failed: ${detail}`);
    }
  }

  async createVersion(feature: AiFeature, data: CreatePromptDto): Promise<AiPromptTemplate> {
    const organizationId = data.organizationId?.trim();
    if (!organizationId) {
      throw new BadRequestException('organizationId is required');
    }

    const latest = await this.prisma.aiPromptTemplate.findFirst({
      where: { organizationId, feature },
      orderBy: { version: 'desc' },
      select: { version: true }
    });
    const nextVersion = (latest?.version ?? 0) + 1;

    const created = await this.prisma.aiPromptTemplate.create({
      data: {
        organizationId,
        feature,
        name: data.name,
        version: nextVersion,
        isActive: false,
        isDefault: Boolean(data.isDefault),
        systemPrompt: data.systemPrompt,
        userPromptTemplate: data.userPromptTemplate,
        provider: data.provider ?? null,
        model: data.model ?? null,
        maxTokens: data.maxTokens ?? null,
        temperature: data.temperature ?? null,
        description: data.description ?? null,
        createdByUserId: data.createdByUserId
      }
    });

    await this.cache.del(this.cacheKey(feature, organizationId));
    return created;
  }

  async activateVersion(feature: AiFeature, organizationId: string, version: number): Promise<void> {
    const orgId = organizationId?.trim();
    if (!orgId) {
      throw new BadRequestException('organizationId is required');
    }
    if (!Number.isFinite(version) || version <= 0) {
      throw new BadRequestException('version must be a positive number');
    }

    await this.prisma.$transaction([
      this.prisma.aiPromptTemplate.updateMany({
        where: { organizationId: orgId, feature, isActive: true },
        data: { isActive: false }
      }),
      this.prisma.aiPromptTemplate.updateMany({
        where: { organizationId: orgId, feature, version },
        data: { isActive: true }
      })
    ]);

    await this.cache.del(this.cacheKey(feature, orgId));
  }

  async getVersionHistory(feature: AiFeature, organizationId: string): Promise<AiPromptTemplate[]> {
    const orgId = organizationId?.trim();
    if (!orgId) {
      throw new BadRequestException('organizationId is required');
    }

    return this.prisma.aiPromptTemplate.findMany({
      where: { organizationId: orgId, feature },
      orderBy: { version: 'desc' }
    });
  }

  private cacheKey(feature: AiFeature, organizationId: string, name?: string) {
    const suffix = name && name.trim().length > 0 ? name.trim() : 'default';
    return `ai:prompt:${feature}:${organizationId}:${suffix}`;
  }
}
