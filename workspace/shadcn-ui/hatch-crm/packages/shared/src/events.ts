import { createHmac } from 'crypto';

import { z } from 'zod';

export const eventTypes = [
  'conversation.created',
  'lead.created',
  'consent.captured',
  'consent.revoked',
  'agreement.signed',
  'tour.requested',
  'tour.confirmed',
  'tour.kept',
  'lead-routing.assigned',
  'lead-routing.sla.breached',
  'lead-routing.sla.satisfied',
  'offer.submitted',
  'deal.stage_changed',
  'message.sent',
  'message.read',
  'message.failed',
  'compliance.violation_detected',
  're.offer.created',
  're.offer.accepted',
  're.listing.status.changed',
  're.transaction.milestone.completed',
  're.payouts.generated'
] as const;

export type EventType = (typeof eventTypes)[number];

export const domainEventSchema = z.object({
  id: z.string().optional(),
  eventType: z.enum(eventTypes),
  occurredAt: z.string(),
  tenantId: z.string(),
  actorId: z.string().optional(),
  resource: z.object({
    id: z.string(),
    type: z.string()
  }),
  correlationId: z.string().optional(),
  data: z.record(z.any())
});

export type DomainEvent = z.infer<typeof domainEventSchema>;

export const makeDomainEvent = (input: DomainEvent): DomainEvent => {
  return domainEventSchema.parse(input);
};


export const signPayload = (payload: string, secret: string) => {
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  return `sha256=${signature}`;
};
