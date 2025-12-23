import type { AiCompletionResponse } from '@/modules/ai/foundation/types/ai-request.types';

export enum FollowUpType {
  AFTER_SHOWING = 'after_showing',
  AFTER_OPEN_HOUSE = 'after_open_house',
  NEW_LISTING_MATCH = 'new_listing_match',
  PRICE_REDUCTION = 'price_reduction',
  JUST_CHECKING_IN = 'just_checking_in',
  COLD_LEAD_REENGAGEMENT = 'cold_lead_reengagement',
  OFFER_UPDATE = 'offer_update',
  UNDER_CONTRACT_UPDATE = 'under_contract_update',
  CLOSING_REMINDER = 'closing_reminder',
  POST_CLOSING_FOLLOWUP = 'post_closing_followup',
  ANNIVERSARY_TOUCHPOINT = 'anniversary_touchpoint',
  MARKET_UPDATE = 'market_update'
}

export type GenerateFollowUpEmailRequest = {
  leadId: string;
  followUpType: FollowUpType;
  specificGoal?: string;
};

export type FollowUpEmailResult = {
  subject: string;
  body: string;
  requestId: string;
  pendingActionId: string | null;
  requiresApproval: boolean;
  usage: AiCompletionResponse['usage'];
};

export type GenerateFollowUpTextRequest = {
  leadId: string;
  followUpType: FollowUpType;
  brief?: string;
};

export type FollowUpTextResult = {
  text: string;
  requestId: string;
  pendingActionId: string | null;
  requiresApproval: boolean;
  usage: AiCompletionResponse['usage'];
};
