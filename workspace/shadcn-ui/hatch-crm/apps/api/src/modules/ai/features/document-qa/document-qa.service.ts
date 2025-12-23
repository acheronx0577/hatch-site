import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@hatch/db';

import { PrismaService } from '@/modules/prisma/prisma.service';
import { S3Service } from '@/modules/storage/s3.service';
import { AiService } from '@/modules/ai/ai.service';
import { AiPromptService } from '@/modules/ai/foundation/services/ai-prompt.service';
import { AiFeature } from '@/modules/ai/foundation/types/ai-request.types';
import { EmbeddingsService } from '@/modules/ai/embeddings.service';
import type { RequestContext } from '@/modules/common/request-context';
import { documentQaPrompt } from './document-qa.prompt';
import { documentSummaryPrompt } from './document-summary.prompt';
import { DocumentProcessor } from './document-processor';
import type { DocumentCitation, DocumentQaResponse, UploadDocumentResult } from './document-qa.types';
import { suggestedQuestionsByType } from './suggested-questions';

@Injectable()
export class DocumentQaService {
  private readonly maxQuestionChars = Number(process.env.DOCUMENT_QA_MAX_QUESTION_CHARS ?? 1200);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly ai: AiService,
    private readonly prompts: AiPromptService,
    private readonly embeddings: EmbeddingsService,
    private readonly processor: DocumentProcessor
  ) {}

  async uploadDocument(
    ctx: RequestContext,
    input: {
      buffer: Buffer;
      filename: string;
      mimeType: string;
      documentType?: string;
      entityType?: string;
      entityId?: string;
    }
  ): Promise<UploadDocumentResult> {
    const organizationId = ctx.orgId?.trim();
    if (!organizationId) throw new BadRequestException('Missing organization context');
    const userId = ctx.userId?.trim();
    if (!userId) throw new BadRequestException('Missing user context');

    const filename = (input.filename ?? '').trim();
    if (!filename) throw new BadRequestException('filename is required');
    const mimeType = (input.mimeType ?? '').trim();
    if (!mimeType) throw new BadRequestException('mimeType is required');

    const storageKey = this.buildStorageKey(organizationId, filename);

    await this.s3.uploadObject(storageKey, input.buffer, mimeType);

    const record = await this.prisma.documentUpload.create({
      data: {
        organizationId,
        filename,
        mimeType,
        fileSize: input.buffer.length,
        storageKey,
        status: 'pending',
        entityType: input.entityType?.trim() || null,
        entityId: input.entityId?.trim() || null,
        documentType: input.documentType?.trim() || null,
        uploadedById: userId
      },
      select: { id: true }
    });

    try {
      const processed = await this.processor.processDocument(input.buffer, filename, mimeType, { organizationId });

      await this.prisma.$transaction(async (tx) => {
        await tx.documentChunk.deleteMany({ where: { documentId: record.id } });

        if (processed.chunks.length) {
          await tx.documentChunk.createMany({
            data: processed.chunks.map((chunk) => ({
              documentId: record.id,
              chunkIndex: chunk.chunkIndex,
              pageNumber: chunk.pageNumber,
              content: chunk.content,
              embeddingF8: chunk.embedding as any
            }))
          });
        }

        await tx.documentUpload.update({
          where: { id: record.id },
          data: {
            status: 'ready',
            processedAt: new Date(),
            errorMessage: null,
            fullText: processed.fullText,
            pageCount: processed.pages.length
          }
        });
      });

      return {
        documentId: record.id,
        filename,
        mimeType,
        status: 'ready',
        pageCount: processed.pages.length
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Document processing failed';
      await this.prisma.documentUpload.update({
        where: { id: record.id },
        data: {
          status: 'failed',
          errorMessage: message,
          processedAt: new Date()
        }
      });
      throw error;
    }
  }

  async askQuestion(ctx: RequestContext, params: { documentId: string; question: string }): Promise<DocumentQaResponse> {
    const organizationId = ctx.orgId?.trim();
    if (!organizationId) throw new BadRequestException('Missing organization context');
    const userId = ctx.userId?.trim();
    if (!userId) throw new BadRequestException('Missing user context');

    const documentId = params.documentId?.trim();
    if (!documentId) throw new BadRequestException('documentId is required');

    const rawQuestion = (params.question ?? '').toString();
    const question = rawQuestion.trim().slice(0, Math.max(10, this.maxQuestionChars));
    if (!question) throw new BadRequestException('question is required');

    const document = await this.prisma.documentUpload.findFirst({
      where: { id: documentId, organizationId },
      select: { id: true, filename: true, documentType: true, status: true }
    });
    if (!document) {
      throw new BadRequestException('Document not found');
    }
    if (document.status !== 'ready') {
      throw new BadRequestException('Document is not ready');
    }

    await this.ensureDocumentQaPrompt(organizationId, userId);

    const [queryVector] = await this.embeddings.embed([question], { tenantId: organizationId });
    const relevantChunks = await this.findRelevantChunks(documentId, queryVector, { topK: 5 });
    const context = relevantChunks.map((chunk, idx) => ({
      citation: idx + 1,
      pageNumber: chunk.pageNumber ?? 1,
      content: chunk.content
    }));

    const completion = await this.ai.complete({
      feature: AiFeature.DOCUMENT_QA,
      promptTemplate: 'document-qa',
      variables: {
        documentType: document.documentType ?? 'unknown',
        documentName: document.filename,
        context,
        question
      },
      userId,
      brokerageId: organizationId,
      context: { entityType: 'document', entityId: documentId },
      options: { provider: 'grok', temperature: 0.2, maxTokens: 650 }
    });

    const parsed = parseAnswerWithCitations(completion.content, relevantChunks);

    await this.prisma.documentQaHistory.create({
      data: {
        documentId,
        question,
        answer: parsed.answer,
        citations: parsed.citations as unknown as Prisma.JsonValue,
        confidence: parsed.confidence,
        userId
      }
    });

    return {
      answer: parsed.answer,
      citations: parsed.citations,
      confidence: parsed.confidence,
      requestId: completion.id
    };
  }

  async summarizeDocument(ctx: RequestContext, params: { documentId: string }): Promise<{ summary: string }> {
    const organizationId = ctx.orgId?.trim();
    if (!organizationId) throw new BadRequestException('Missing organization context');
    const userId = ctx.userId?.trim();
    if (!userId) throw new BadRequestException('Missing user context');

    const documentId = params.documentId?.trim();
    if (!documentId) throw new BadRequestException('documentId is required');

    const document = await this.prisma.documentUpload.findFirst({
      where: { id: documentId, organizationId },
      select: { id: true, filename: true, documentType: true, status: true, fullText: true }
    });
    if (!document) throw new BadRequestException('Document not found');
    if (document.status !== 'ready') throw new BadRequestException('Document is not ready');

    await this.ensureDocumentSummaryPrompt(organizationId, userId);

    const text = (document.fullText ?? '').trim();
    if (!text) {
      return { summary: 'No extracted text available for this document.' };
    }

    const completion = await this.ai.complete({
      feature: AiFeature.DOCUMENT_QA,
      promptTemplate: 'document-summary',
      variables: {
        documentName: document.filename,
        documentType: document.documentType ?? 'unknown',
        documentText: truncate(text, 12_000)
      },
      userId,
      brokerageId: organizationId,
      context: { entityType: 'document', entityId: documentId },
      options: { provider: 'grok', temperature: 0.2, maxTokens: 450 }
    });

    return { summary: completion.content };
  }

  getSuggestedQuestions(documentType?: string | null): string[] {
    const key = (documentType ?? '').trim().toLowerCase();
    return suggestedQuestionsByType[key] ?? [];
  }

  private buildStorageKey(organizationId: string, filename: string) {
    const safeName = filename.replace(/[^\w.-]+/g, '_').slice(0, 120) || 'document';
    return `document-qa/${organizationId}/${randomUUID()}/${safeName}`;
  }

  private async ensureDocumentQaPrompt(organizationId: string, userId: string) {
    const existing = await this.prisma.aiPromptTemplate.findFirst({
      where: { organizationId, feature: AiFeature.DOCUMENT_QA, name: 'document-qa' },
      orderBy: { version: 'desc' },
      select: { version: true, isActive: true }
    });

    if (!existing) {
      const created = await this.prompts.createVersion(AiFeature.DOCUMENT_QA, {
        organizationId,
        name: 'document-qa',
        systemPrompt: documentQaPrompt.systemPrompt,
        userPromptTemplate: documentQaPrompt.userPromptTemplate,
        provider: 'grok',
        model: null,
        maxTokens: 650,
        temperature: 0.2,
        description: 'Answers questions about uploaded documents with citations.',
        createdByUserId: userId,
        isDefault: true
      });
      await this.prompts.activateVersion(AiFeature.DOCUMENT_QA, organizationId, created.version);
      return;
    }

    if (!existing.isActive) {
      await this.prompts.activateVersion(AiFeature.DOCUMENT_QA, organizationId, existing.version);
    }
  }

  private async ensureDocumentSummaryPrompt(organizationId: string, userId: string) {
    const existing = await this.prisma.aiPromptTemplate.findFirst({
      where: { organizationId, feature: AiFeature.DOCUMENT_QA, name: 'document-summary' },
      orderBy: { version: 'desc' },
      select: { version: true, isActive: true }
    });

    if (!existing) {
      const created = await this.prompts.createVersion(AiFeature.DOCUMENT_QA, {
        organizationId,
        name: 'document-summary',
        systemPrompt: documentSummaryPrompt.systemPrompt,
        userPromptTemplate: documentSummaryPrompt.userPromptTemplate,
        provider: 'grok',
        model: null,
        maxTokens: 450,
        temperature: 0.2,
        description: 'Summarizes uploaded documents for agents.',
        createdByUserId: userId,
        isDefault: false
      });
      await this.prompts.activateVersion(AiFeature.DOCUMENT_QA, organizationId, created.version);
      return;
    }

    if (!existing.isActive) {
      await this.prompts.activateVersion(AiFeature.DOCUMENT_QA, organizationId, existing.version);
    }
  }

  private async findRelevantChunks(
    documentId: string,
    queryVector: number[],
    opts?: { topK?: number }
  ): Promise<Array<{ id: string; chunkIndex: number; pageNumber: number | null; content: string; score: number }>> {
    const topK = Math.max(1, Math.min(opts?.topK ?? 5, 12));

    if (!queryVector.length) {
      const fallback = await this.prisma.documentChunk.findMany({
        where: { documentId },
        select: { id: true, chunkIndex: true, pageNumber: true, content: true },
        orderBy: { chunkIndex: 'asc' },
        take: topK
      });
      return fallback.map((chunk) => ({ ...chunk, score: 0 }));
    }

    const dim = queryVector.length;
    const vectorValues = Prisma.join(queryVector.map((value) => Prisma.sql`${value}`));
    const vectorExpr = Prisma.sql`(${vectorValues})::vector(${dim})`;

    try {
      const rows = await this.prisma.$queryRaw<
        Array<{
          id: string;
          chunkIndex: number;
          pageNumber: number | null;
          content: string;
          score: number;
        }>
      >(Prisma.sql`
        SELECT
          id,
          "chunkIndex" AS "chunkIndex",
          "pageNumber" AS "pageNumber",
          content,
          1 - (("embeddingF8"::vector(${dim})) <=> ${vectorExpr}) AS score
        FROM "DocumentChunk"
        WHERE "documentId" = ${documentId}
          AND "embeddingF8" IS NOT NULL
        ORDER BY ("embeddingF8"::vector(${dim})) <=> ${vectorExpr} ASC
        LIMIT ${topK}
      `);

      return rows.map((row) => ({
        id: row.id,
        chunkIndex: Number(row.chunkIndex),
        pageNumber: row.pageNumber ?? null,
        content: row.content,
        score: Number(row.score)
      }));
    } catch (error) {
      if (!isVectorTypeMissing(error)) {
        throw error;
      }
    }

    const chunks = await this.prisma.documentChunk.findMany({
      where: { documentId },
      select: { id: true, chunkIndex: true, pageNumber: true, content: true, embeddingF8: true }
    });

    const queryNorm = Math.sqrt(queryVector.reduce((sum, value) => sum + value * value, 0));
    if (!queryNorm) {
      return chunks.slice(0, topK).map((chunk) => ({
        id: chunk.id,
        chunkIndex: chunk.chunkIndex,
        pageNumber: chunk.pageNumber,
        content: chunk.content,
        score: 0
      }));
    }

    const scored = chunks
      .map((chunk) => {
        const vector = (chunk.embeddingF8 as number[] | null) ?? null;
        if (!vector || vector.length !== queryVector.length) {
          return null;
        }

        const chunkNorm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
        if (!chunkNorm) {
          return null;
        }

        const dot = queryVector.reduce((sum, value, idx) => sum + value * vector[idx], 0);
        const cosine = dot / (queryNorm * chunkNorm);

        return {
          id: chunk.id,
          chunkIndex: chunk.chunkIndex,
          pageNumber: chunk.pageNumber,
          content: chunk.content,
          score: cosine
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored;
  }
}

function parseAnswerWithCitations(
  content: string,
  chunks: Array<{ id: string; chunkIndex: number; pageNumber: number | null; content: string }>
): { answer: string; citations: DocumentCitation[]; confidence: DocumentQaResponse['confidence'] } {
  const raw = (content ?? '').trim();
  const confidenceMatch = raw.match(/\[Confidence:\s*(HIGH|MEDIUM|LOW|UNKNOWN)\s*\]/i);
  const confidence = (confidenceMatch?.[1]?.toUpperCase() as DocumentQaResponse['confidence']) ?? 'UNKNOWN';
  const answer = confidenceMatch ? raw.replace(confidenceMatch[0], '').trim() : raw;

  const used = new Set<number>();
  const citationRegex = /\[(\d+)\]/g;
  let match: RegExpExecArray | null = null;
  while ((match = citationRegex.exec(answer))) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) {
      used.add(value);
    }
  }

  const citations: DocumentCitation[] = Array.from(used)
    .sort((a, b) => a - b)
    .map((citationNumber) => {
      const idx = citationNumber - 1;
      const chunk = chunks[idx];
      if (!chunk) {
        return null;
      }
      return {
        citation: citationNumber,
        chunkId: chunk.id,
        chunkIndex: chunk.chunkIndex,
        pageNumber: chunk.pageNumber ?? 1,
        snippet: truncate(chunk.content, 260)
      };
    })
    .filter((entry): entry is DocumentCitation => Boolean(entry));

  return {
    answer,
    citations,
    confidence
  };
}

function truncate(text: string, maxChars: number): string {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return '';
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxChars - 1))}…`;
}

function isVectorTypeMissing(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    typeof error.message === 'string' &&
    error.message.includes('type "vector" does not exist')
  );
}
