import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export interface RecommendationFilters {
  propertyType?: string;
  side?: string;
  jurisdiction?: string;
}

@Injectable()
export class ContractsRecommendationService {
  constructor(private readonly prisma: PrismaService) {}

  async recommend(orgId: string, filters: RecommendationFilters) {
    const templates = await this.prisma.contractTemplate.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        propertyType: filters.propertyType ?? undefined,
        side: filters.side ?? undefined,
        jurisdiction: filters.jurisdiction ?? undefined
      },
      orderBy: { updatedAt: 'desc' }
    });

    const reason = this.buildReason(filters);
    return templates.map((template) => ({
      ...template,
      recommendationReason: reason
    }));
  }

  private buildReason(filters: RecommendationFilters) {
    const parts = [];
    if (filters.propertyType) {
      parts.push(`propertyType=${filters.propertyType}`);
    }
    if (filters.side) {
      parts.push(`side=${filters.side}`);
    }
    if (filters.jurisdiction) {
      parts.push(`jurisdiction=${filters.jurisdiction}`);
    }
    return parts.length ? `Matched ${parts.join(', ')}` : 'Recommended template';
  }
}
