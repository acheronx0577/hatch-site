import { Injectable } from '@nestjs/common';

import { PrismaService } from '@/modules/prisma/prisma.service';
import { AiFoundationConfig } from './ai.config';
import { AiFeature } from './types/ai-request.types';

type AiAddonMetadata = {
  enabledFeatures?: string[];
  disabledFeatures?: string[];
  piiAllowlist?: string[];
};

export type AiOrganizationAiSettings = {
  enabled: boolean;
  enabledFeatures?: string[];
  disabledFeatures?: string[];
  piiAllowlist: string[];
};

@Injectable()
export class AiFeatureFlagsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(organizationId: string): Promise<AiOrganizationAiSettings | null> {
    const orgId = organizationId?.trim();
    if (!orgId) {
      return null;
    }

    const addon = await this.prisma.organizationAddon.findUnique({
      where: { organizationId_key: { organizationId: orgId, key: 'ai' } }
    });

    if (!addon) {
      return { enabled: true, piiAllowlist: [] };
    }

    const meta = (addon.metadata as AiAddonMetadata | null) ?? null;

    const enabledFeatures = Array.isArray(meta?.enabledFeatures) ? meta?.enabledFeatures : undefined;
    const disabledFeatures = Array.isArray(meta?.disabledFeatures) ? meta?.disabledFeatures : undefined;
    const piiAllowlist = Array.isArray(meta?.piiAllowlist) ? meta?.piiAllowlist.filter(Boolean) : [];

    return {
      enabled: addon.enabled,
      enabledFeatures,
      disabledFeatures,
      piiAllowlist
    };
  }

  async isEnabled(feature: AiFeature, organizationId: string): Promise<boolean> {
    if (!AiFoundationConfig.enabled) {
      return false;
    }

    const settings = await this.getSettings(organizationId);
    if (!settings) {
      return false;
    }

    return this.isEnabledWithSettings(feature, settings);
  }

  isEnabledWithSettings(feature: AiFeature, settings: AiOrganizationAiSettings): boolean {
    if (!settings.enabled) {
      return false;
    }

    if (settings.enabledFeatures) {
      return settings.enabledFeatures.includes(feature);
    }

    if (settings.disabledFeatures) {
      return !settings.disabledFeatures.includes(feature);
    }

    return true;
  }
}
