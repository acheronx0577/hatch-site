import { BadRequestException, Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import pdfParseModule from 'pdf-parse';
import mammoth from 'mammoth';

import { EmbeddingsService } from '@/modules/ai/embeddings.service';
import type { PageContent, ProcessedDocument, ProcessedDocumentChunk } from './document-qa.types';

type PdfParseFn = (data: Buffer) => Promise<{ text?: string }>;
const pdfParseFn: PdfParseFn | undefined =
  (pdfParseModule as unknown as { default?: PdfParseFn }).default ??
  ((pdfParseModule as unknown as PdfParseFn) || undefined);

const DEFAULT_CHUNK_CHARS = 2200;
const DEFAULT_CHUNK_OVERLAP_CHARS = 260;

@Injectable()
export class DocumentProcessor {
  private readonly maxTextChars = Number(process.env.DOCUMENT_QA_MAX_TEXT_CHARS ?? 200_000);
  private readonly chunkChars = Number(process.env.DOCUMENT_QA_CHUNK_CHARS ?? DEFAULT_CHUNK_CHARS);
  private readonly chunkOverlapChars = Number(process.env.DOCUMENT_QA_CHUNK_OVERLAP_CHARS ?? DEFAULT_CHUNK_OVERLAP_CHARS);

  constructor(private readonly embeddings: EmbeddingsService) {}

  async processDocument(
    file: Buffer,
    filename: string,
    mimeType: string,
    opts?: { organizationId?: string }
  ): Promise<ProcessedDocument> {
    const normalizedMime = (mimeType ?? '').trim().toLowerCase();
    if (!normalizedMime) {
      throw new BadRequestException('mimeType is required');
    }

    const normalizedFilename = (filename ?? '').trim() || 'document';

    let fullText = '';
    let pages: PageContent[] = [];

    switch (normalizedMime) {
      case 'application/pdf': {
        const pdfResult = await this.extractFromPdf(file);
        fullText = pdfResult.text;
        pages = pdfResult.pages;
        break;
      }

      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
        fullText = await this.extractFromDocx(file);
        pages = [{ pageNumber: 1, content: fullText }];
        break;
      }

      case 'image/jpeg':
      case 'image/png': {
        fullText = await this.extractFromImage(file, normalizedMime);
        pages = [{ pageNumber: 1, content: fullText }];
        break;
      }

      default:
        throw new BadRequestException(`Unsupported document type: ${mimeType}`);
    }

    fullText = this.truncateText(this.sanitizeText(fullText));
    pages = pages
      .map((page) => ({
        pageNumber: page.pageNumber,
        content: this.truncateText(this.sanitizeText(page.content))
      }))
      .filter((page) => page.content.length > 0);

    if (!fullText.trim()) {
      throw new BadRequestException('Unable to extract text from document');
    }

    const chunkDrafts = this.chunkDocument(pages);
    if (!chunkDrafts.length) {
      throw new BadRequestException('Unable to chunk extracted text');
    }

    const embeddings = await this.generateEmbeddings(chunkDrafts.map((chunk) => chunk.content), {
      organizationId: opts?.organizationId
    });

    const chunks: ProcessedDocumentChunk[] = chunkDrafts.map((chunk, idx) => ({
      ...chunk,
      embedding: embeddings[idx] ?? []
    }));

    return {
      filename: normalizedFilename,
      mimeType: normalizedMime,
      fullText,
      pages,
      chunks
    };
  }

  private async extractFromPdf(file: Buffer): Promise<{ text: string; pages: PageContent[] }> {
    if (!pdfParseFn) {
      throw new BadRequestException('PDF parsing is not available');
    }

    const parsed = await pdfParseFn(file);
    const rawText = parsed?.text ?? '';
    const sanitized = this.sanitizeText(rawText);

    const pageParts = sanitized.includes('\f')
      ? sanitized.split('\f').map((part) => part.trim()).filter(Boolean)
      : [];

    const pages: PageContent[] = pageParts.length
      ? pageParts.map((content, idx) => ({ pageNumber: idx + 1, content }))
      : [{ pageNumber: 1, content: sanitized }];

    return {
      text: pages.map((page) => page.content).join('\n\n').trim(),
      pages
    };
  }

  private async extractFromDocx(file: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer: file });
      return result?.value ? this.sanitizeText(result.value) : '';
    } catch (error) {
      throw new BadRequestException(`DOCX extraction failed: ${(error as Error).message}`);
    }
  }

  private async extractFromImage(file: Buffer, mimeType: string): Promise<string> {
    const apiKey = process.env.XAI_API_KEY || process.env.GROK_API_KEY;
    const baseURL = process.env.XAI_BASE_URL || process.env.GROK_BASE_URL || 'https://api.x.ai/v1';

    if (!apiKey?.trim()) {
      throw new BadRequestException('XAI_API_KEY is required for image OCR');
    }

    const model =
      (process.env.AI_MODEL_GROK_VISION ?? process.env.XAI_MODEL_VISION ?? '').trim() ||
      (process.env.AI_MODEL_GROK ?? process.env.XAI_MODEL ?? 'grok-4-1-fast-reasoning');

    const client = new OpenAI({ apiKey: apiKey.trim(), baseURL: normalizeBaseUrl(baseURL) });

    const base64 = file.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const completion = await client.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 900,
      messages: [
        {
          role: 'system',
          content:
            'You extract text from images. Return ONLY the extracted text, preserving line breaks when possible. Do not add commentary.'
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract all readable text from this image.' },
            { type: 'image_url', image_url: { url: dataUrl } }
          ] as any
        }
      ]
    });

    const text = completion.choices?.[0]?.message?.content ?? '';
    return this.sanitizeText(text);
  }

  private chunkDocument(pages: PageContent[]): Array<{ chunkIndex: number; pageNumber: number; content: string }> {
    const size = Number.isFinite(this.chunkChars) && this.chunkChars > 200 ? this.chunkChars : DEFAULT_CHUNK_CHARS;
    const overlap =
      Number.isFinite(this.chunkOverlapChars) && this.chunkOverlapChars >= 0
        ? this.chunkOverlapChars
        : DEFAULT_CHUNK_OVERLAP_CHARS;

    const chunks: Array<{ chunkIndex: number; pageNumber: number; content: string }> = [];
    let chunkIndex = 0;

    for (const page of pages) {
      const pageText = (page.content ?? '').trim();
      if (!pageText) continue;

      for (const content of chunkWithOverlap(pageText, size, overlap)) {
        const trimmed = content.trim();
        if (!trimmed) continue;
        chunks.push({ chunkIndex, pageNumber: page.pageNumber, content: trimmed });
        chunkIndex += 1;
      }
    }

    return chunks;
  }

  private async generateEmbeddings(texts: string[], opts?: { organizationId?: string }): Promise<number[][]> {
    const batchSize = 64;
    const out: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const slice = texts.slice(i, i + batchSize);
      const vectors = await this.embeddings.embed(slice, { tenantId: opts?.organizationId });
      out.push(...vectors);
    }

    return out;
  }

  private sanitizeText(value: string): string {
    const input = value ?? '';
    return input
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private truncateText(value: string): string {
    if (!value) return '';
    const max = Number.isFinite(this.maxTextChars) && this.maxTextChars > 0 ? this.maxTextChars : 200_000;
    return value.length > max ? value.slice(0, max) : value;
  }
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return 'https://api.x.ai/v1';
  }
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function* chunkWithOverlap(text: string, size: number, overlap: number) {
  const total = text.length;
  if (!total) {
    return;
  }

  let start = 0;
  while (start < total) {
    let end = Math.min(total, start + size);

    if (end < total) {
      const windowStart = Math.max(start, end - 240);
      const window = text.slice(windowStart, end);
      const boundary = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('\n'), window.lastIndexOf('. '));
      if (boundary > 80) {
        end = windowStart + boundary + 1;
      }
    }

    const chunk = text.slice(start, end);
    yield chunk;

    if (end >= total) break;

    const nextStart = end - overlap;
    start = nextStart > start ? nextStart : end;
  }
}

