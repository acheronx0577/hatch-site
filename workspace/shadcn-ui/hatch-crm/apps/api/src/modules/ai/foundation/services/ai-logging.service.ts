import { Injectable, Logger } from '@nestjs/common';

import type { AiCompletionRequest } from '../types/ai-request.types';

@Injectable()
export class AiLoggingService {
  private readonly log = new Logger(AiLoggingService.name);

  logStart(requestId: string, request: AiCompletionRequest, meta: { provider: string; model: string }) {
    this.log.debug(
      `start id=${requestId} feature=${request.feature} provider=${meta.provider} model=${meta.model} user=${request.userId} org=${request.brokerageId}`
    );
  }

  logSuccess(requestId: string, meta: { latencyMs: number; promptTokens: number; completionTokens: number }) {
    this.log.debug(
      `ok id=${requestId} latencyMs=${meta.latencyMs} promptTokens=${meta.promptTokens} completionTokens=${meta.completionTokens}`
    );
  }

  logFailure(requestId: string, meta: { latencyMs: number; errorType: string; detail?: string }) {
    this.log.warn(`fail id=${requestId} latencyMs=${meta.latencyMs} errorType=${meta.errorType} detail=${meta.detail ?? ''}`.trim());
  }
}

