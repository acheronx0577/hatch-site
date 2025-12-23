import type { ComplianceCheckResult } from '@/modules/ai/foundation/services/ai-compliance.service';
import type { AiCompletionResponse } from '@/modules/ai/foundation/types/ai-request.types';

export type GenerateListingDescriptionRequest = {
  listingId: string;
  tone?: string;
  maxLength?: number;
  agentNotes?: string;
  features?: string[];
  recentUpdates?: string;
  neighborhood?: string;
  views?: string;
  yearBuilt?: number;
  propertyType?: string;
};

export type ListingDescriptionResult = {
  description: string;
  compliance: ComplianceCheckResult;
  usage: AiCompletionResponse['usage'];
  requestId: string;
};

