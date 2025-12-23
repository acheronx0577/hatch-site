import { Injectable, Logger } from '@nestjs/common';

import { DEFAULT_EMBEDDING_MODEL_ID } from '@/shared/ai/llm.constants';
import { LLMClient } from '@/shared/ai/llm.client';

export type EmbedOptions = { tenantId?: string; model?: string };

export interface EmbeddingsProvider {
  embed(texts: string[], opts?: EmbedOptions): Promise<number[][]>;
}

@Injectable()
export class EmbeddingsService implements EmbeddingsProvider {
  private readonly provider: EmbeddingsProvider;
  private readonly log = new Logger(EmbeddingsService.name);

  constructor() {
    const name = (process.env.AI_EMBEDDINGS_PROVIDER || 'mock').toLowerCase();
    if (usesVendorProvider(name)) {
      this.provider = new LlmEmbeddingsAdapter();
      return;
    }

    if (name !== 'mock') {
      this.log.warn(`Unknown embeddings provider "${name}", falling back to deterministic mock embeddings.`);
    }
    this.provider = new MockEmbeddings();
  }

  embed(texts: string[], opts?: EmbedOptions) {
    return this.provider.embed(texts, opts);
  }
}

class MockEmbeddings implements EmbeddingsProvider {
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.vec(text));
  }

  private vec(text: string) {
    const dim = 768;
    const out = new Array(dim).fill(0);
    let hash = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
      out[(hash >>> 0) % dim] += 1;
    }
    const norm = Math.hypot(...out) || 1;
    return out.map((value) => value / norm);
  }
}

class LlmEmbeddingsAdapter implements EmbeddingsProvider {
  private readonly llm = new LLMClient();

  async embed(texts: string[], opts?: EmbedOptions): Promise<number[][]> {
    if (!this.llm.isConfigured()) {
      throw new Error('LLM provider is not configured');
    }

    const model = opts?.model || process.env.AI_EMBEDDINGS_MODEL || DEFAULT_EMBEDDING_MODEL_ID;

    try {
      return await this.llm.createEmbeddings({ texts, model });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'unknown error';
      throw new Error(`LLM embeddings error: ${detail}`);
    }
  }
}

function usesVendorProvider(name: string) {
  return ['llm', 'internal', 'vendor', 'grok', 'xai'].includes(name);
}
