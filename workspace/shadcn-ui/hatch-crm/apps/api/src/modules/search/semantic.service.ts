import { Injectable } from '@nestjs/common';
import { Prisma } from '@hatch/db';

import { PrismaService } from '@/modules/prisma/prisma.service';
import { EmbeddingsService } from '@/modules/ai/embeddings.service';

type SearchParams = {
  tenantId: string;
  query: string;
  entityType?: string;
  entityId?: string;
  limit?: number;
};

@Injectable()
export class SemanticSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingsService
  ) {}

  async search(params: SearchParams) {
    const { tenantId, query, entityType, entityId } = params;
    const maxTopK = Number(process.env.AI_RAG_TOPK || 5);
    const limit = Math.max(1, Math.min(params.limit ?? maxTopK, 20));

    const [queryVector] = await this.embeddings.embed([query], { tenantId });
    const dim = queryVector.length || 768;
    const vectorValues = Prisma.join(queryVector.map((value) => Prisma.sql`${value}`));
    const vectorExpr = Prisma.sql`(${vectorValues})::vector(${dim})`;

    const entityTypeCondition = entityType ? Prisma.sql`AND entity_type = ${entityType}` : Prisma.sql``;
    const entityIdCondition = entityId ? Prisma.sql`AND entity_id = ${entityId}` : Prisma.sql``;

    let rows: Array<{
      id: string;
      content: string;
      entityType: string;
      entityId: string;
      score: number;
      meta: Record<string, unknown> | null;
    }> = [];

    try {
      rows = await this.prisma.$queryRaw<Array<{
        id: string;
        content: string;
        entityType: string;
        entityId: string;
        score: number;
        meta: Record<string, unknown> | null;
      }>>(Prisma.sql`
        SELECT
          id,
          content,
          entity_type AS "entityType",
          entity_id AS "entityId",
          1 - ((embedding_f8::vector(${dim})) <=> ${vectorExpr}) AS score,
          meta
        FROM "VectorChunk"
        WHERE tenant_id = ${tenantId}
          ${entityTypeCondition}
          ${entityIdCondition}
        ORDER BY (embedding_f8::vector(${dim})) <=> ${vectorExpr} ASC
        LIMIT ${limit}
      `);
    } catch (error) {
      if (this.isVectorTypeMissing(error)) {
        return this.fallbackSearch({
          tenantId,
          entityType,
          entityId,
          limit,
          queryVector
        });
      }
      throw error;
    }

    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      entityType: row.entityType,
      entityId: row.entityId,
      score: Number(row.score),
      meta: row.meta ?? null
    }));
  }

  private isVectorTypeMissing(error: unknown): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      typeof error.message === 'string' &&
      error.message.includes('type "vector" does not exist')
    );
  }

  private async fallbackSearch(params: {
    tenantId: string;
    entityType?: string;
    entityId?: string;
    limit: number;
    queryVector: number[];
  }) {
    const { tenantId, entityType, entityId, limit, queryVector } = params;
    if (!queryVector.length) {
      return [];
    }

    const queryNorm = Math.sqrt(queryVector.reduce((sum, value) => sum + value * value, 0));
    if (!queryNorm) {
      return [];
    }

    const rows = await this.prisma.vectorChunk.findMany({
      where: {
        tenantId,
        entityType: entityType ?? undefined,
        entityId: entityId ?? undefined
      },
      take: Math.max(limit * 4, limit)
    });

    const scored = rows
      .map((chunk) => {
        const chunkVector = chunk.embeddingF8 as number[] | null;
        if (!chunkVector || chunkVector.length !== queryVector.length) {
          return null;
        }

        const chunkNorm = Math.sqrt(chunkVector.reduce((sum, value) => sum + value * value, 0));
        if (!chunkNorm) {
          return null;
        }

        const dot = queryVector.reduce((sum, value, idx) => sum + value * chunkVector[idx], 0);
        const cosine = dot / (queryNorm * chunkNorm);

        return {
          id: chunk.id,
          content: chunk.content,
          entityType: chunk.entityType,
          entityId: chunk.entityId,
          score: cosine,
          meta: (chunk.meta as Record<string, unknown> | null) ?? null
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored;
  }
}
