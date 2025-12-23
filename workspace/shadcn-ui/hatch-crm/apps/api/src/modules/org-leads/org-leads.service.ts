import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  ConsentChannel,
  ConsentScope,
  CustomFieldEntity,
  CustomFieldType,
  LeadSource,
  LeadStatus,
  LeadScoreTier,
  LeadGenConversionEventType,
  LeadTouchpointType,
  OrgEventType,
  PersonStage,
  Prisma,
  UserRole,
  PlaybookTriggerType
} from '@hatch/db';

import { PrismaService } from '../prisma/prisma.service';
import { OrgEventsService } from '../org-events/org-events.service';
import { ConsentsService } from '../consents/consents.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';
import { PlaybookRunnerService } from '../playbooks/playbook-runner.service';
import { toJsonValue, toNullableJson } from '../common';
import { calculateLeadScore } from '../leads/lead-score.util';
import { RoutingService } from '../routing/routing.service';
import { LeadRoutingOrgMode } from '../routing/dto/routing-settings.dto';
import { RoutingSettingsService } from '../routing/routing-settings.service';
import { TrackingService } from '../tracking/tracking.service';

interface LeadFilters {
  status?: string;
}

const isPrismaUniqueConstraintError = (error: unknown) =>
  typeof (error as { code?: string } | undefined)?.code === 'string' && (error as { code?: string }).code === 'P2002';

const normalizeCustomFieldKey = (value: string) => {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';
  return trimmed
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
};

const labelFromCustomFieldKey = (key: string) =>
  key
    .replace(/[_\-.]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const inferCustomFieldType = (value: unknown): CustomFieldType => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return CustomFieldType.NUMBER;
  }

  if (value instanceof Date) {
    return CustomFieldType.DATE;
  }

  if (typeof value === 'string') {
    const looksLikeDate = /^\d{4}-\d{2}-\d{2}/.test(value);
    if (looksLikeDate && Number.isFinite(Date.parse(value))) {
      return CustomFieldType.DATE;
    }
    return CustomFieldType.TEXT;
  }

  if (Array.isArray(value)) {
    return CustomFieldType.MULTI_SELECT;
  }

  return CustomFieldType.TEXT;
};

@Injectable()
export class OrgLeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgEvents: OrgEventsService,
    private readonly playbooks: PlaybookRunnerService,
    private readonly routing: RoutingService,
    private readonly routingSettings: RoutingSettingsService,
    private readonly tracking: TrackingService,
    private readonly consents: ConsentsService
  ) {}

  private async assertMembership(userId: string, orgId: string) {
    const membership = await this.prisma.userOrgMembership.findUnique({
      where: { userId_orgId: { userId, orgId } },
      select: {
        user: { select: { role: true } }
      }
    });
    if (!membership) {
      throw new ForbiddenException('User is not part of this organization');
    }
    const role = membership.user?.role ?? null;
    return { role };
  }

  private async assertBrokerOrAgent(userId: string, orgId: string) {
    const { role } = await this.assertMembership(userId, orgId);
    if (!role || (role !== UserRole.BROKER && role !== UserRole.AGENT && role !== UserRole.TEAM_LEAD)) {
      throw new ForbiddenException('Broker or agent access required');
    }
    return { role };
  }

  private async assertAgentProfileInOrg(agentProfileId: string, orgId: string) {
    const profile = await this.prisma.agentProfile.findUnique({ where: { id: agentProfileId } });
    if (!profile || profile.organizationId !== orgId) {
      throw new NotFoundException('Agent profile not found');
    }
    return profile;
  }

  private async assertListingInOrg(listingId: string, orgId: string) {
    const listing = await this.prisma.orgListing.findUnique({ where: { id: listingId } });
    if (!listing || listing.organizationId !== orgId) {
      throw new NotFoundException('Listing not found');
    }
    return listing;
  }

  private normalizeStatus(value: string) {
    const normalized = value.toUpperCase();
    const allowed = Object.values(LeadStatus) as string[];
    if (!allowed.includes(normalized)) {
      throw new BadRequestException('Invalid lead status');
    }
    return normalized as LeadStatus;
  }

  async createLeadFromPortal(
    orgId: string,
    consumerId: string | null,
    dto: CreateLeadDto,
    req?: { ip?: string; headers?: Record<string, unknown> }
  ) {
    const honeypotValue = (dto.website ?? '').trim();
    const isSpamLikely = honeypotValue.length > 0;

    const normalizedEmail = this.normalizeEmail(dto.email);
    const normalizedPhone = this.normalizePhone(dto.phone);

    const tenant = await this.resolveDefaultTenantForOrg(orgId);

    let listingAgentProfileId: string | null = null;
    if (dto.listingId) {
      const listing = await this.assertListingInOrg(dto.listingId, orgId);
      listingAgentProfileId = listing.agentProfileId;
    }

    let consumerFallbackName: string | undefined;
    let consumerFallbackEmail: string | undefined;

    if (consumerId) {
      const consumer = await this.prisma.user.findUnique({ where: { id: consumerId } });
      if (consumer) {
        consumerFallbackName = `${consumer.firstName ?? ''} ${consumer.lastName ?? ''}`.trim() || undefined;
        consumerFallbackEmail = consumer.email;
      }
    }

    const candidateEmail = normalizedEmail ?? this.normalizeEmail(consumerFallbackEmail);
    const candidatePhone = normalizedPhone;
    if (!candidateEmail && !candidatePhone) {
      throw new BadRequestException('Email or phone is required');
    }

    const now = new Date();
    const desiredMoveIn = dto.desiredMoveIn ? new Date(dto.desiredMoveIn) : undefined;

    const leadMetadata = this.buildLeadMetadata(dto, req, { isSpamLikely });
    const personCustomFields = this.normalizeCustomFields({
      ...(dto.metadata ?? {}),
      ...(desiredMoveIn ? { desiredMoveIn: desiredMoveIn.toISOString() } : {}),
      ...(dto.budgetMin !== undefined ? { budgetMin: dto.budgetMin } : {}),
      ...(dto.budgetMax !== undefined ? { budgetMax: dto.budgetMax } : {}),
      ...(dto.bedrooms !== undefined ? { bedrooms: dto.bedrooms } : {}),
      ...(dto.bathrooms !== undefined ? { bathrooms: dto.bathrooms } : {})
    });

    const { lead, personId, tenantId } = await this.prisma.$transaction(async (tx) => {
      const tenantId = tenant?.id ?? null;

      const crmPerson =
        tenantId && (candidateEmail || candidatePhone) && !isSpamLikely
          ? await this.upsertCrmPersonFromPortalLead(tx, {
              tenantId,
              organizationId: orgId,
              name: (dto.name ?? consumerFallbackName) ?? null,
              email: candidateEmail,
              phone: candidatePhone,
              utmSource: dto.utmSource ?? null,
              utmMedium: dto.utmMedium ?? null,
              utmCampaign: dto.utmCampaign ?? null,
              gclid: dto.gclid ?? null
            })
          : null;

      if (crmPerson && tenantId && personCustomFields) {
        await this.upsertPersonCustomFields(tx, {
          tenantId,
          organizationId: orgId,
          personId: crmPerson.id,
          userId: consumerId ?? undefined,
          customFields: personCustomFields
        });
      }

      const lead = await tx.lead.create({
        data: {
          organizationId: orgId,
          tenantId: tenantId ?? undefined,
          personId: crmPerson?.id ?? undefined,
          consumerId: consumerId ?? undefined,
          listingId: dto.listingId ?? undefined,
          agentProfileId: listingAgentProfileId ?? undefined,
          status: isSpamLikely ? LeadStatus.UNQUALIFIED : undefined,
          name: (dto.name ?? consumerFallbackName) ?? undefined,
          email: normalizedEmail ?? this.normalizeEmail(dto.email ?? consumerFallbackEmail),
          phone: normalizedPhone ?? undefined,
          message: dto.message ?? undefined,
          desiredMoveIn: desiredMoveIn ?? undefined,
          budgetMin: dto.budgetMin ?? undefined,
          budgetMax: dto.budgetMax ?? undefined,
          bedrooms: dto.bedrooms ?? undefined,
          bathrooms: dto.bathrooms ?? undefined,
          source: dto.listingId ? LeadSource.LISTING_INQUIRY : LeadSource.PORTAL_SIGNUP,
          createdByUserId: consumerId ?? undefined,
          metadata: toNullableJson(leadMetadata)
        }
      });

      if (crmPerson && tenantId) {
        await this.recordCrmTouchpointFromPortalLead(tx, {
          tenantId,
          personId: crmPerson.id,
          occurredAt: now,
          message: dto.message ?? null,
          orgLeadId: lead.id,
          listingId: dto.listingId ?? null,
          attribution: leadMetadata?.attribution ?? null
        });

        if (dto.anonymousId?.trim()) {
          await tx.event.updateMany({
            where: {
              tenantId,
              anonymousId: dto.anonymousId.trim(),
              personId: null
            },
            data: {
              personId: crmPerson.id
            }
          });
        }
      }

      return { lead, personId: crmPerson?.id ?? null, tenantId };
    });

    if (!isSpamLikely && tenantId && personId) {
      const evidenceUri = this.maybeValidUrl(dto.pageUrl);
      await this.captureMarketingConsents({
        tenantId,
        personId,
        req,
        emailOptIn: dto.marketingConsentEmail ?? false,
        smsOptIn: dto.marketingConsentSms ?? false,
        evidenceUri
      });

      await this.tracking.updateLeadActivityFromEvents({
        tenantId,
        personId,
        occurredAt: now,
        shouldRecomputeRollup: true
      });
    }

    if (!isSpamLikely) {
      await this.orgEvents.logOrgEvent({
        organizationId: orgId,
        type: OrgEventType.ORG_LEAD_CREATED,
        payload: {
          leadId: lead.id,
          listingId: lead.listingId ?? null,
          source: lead.source,
          tenantId,
          personId
        }
      });

      void this.playbooks
        .runTrigger(orgId, PlaybookTriggerType.LEAD_CREATED, { leadId: lead.id })
        .catch(() => undefined);

      if (tenantId && personId) {
        await this.routePortalLeadIntoCrm({
          tenantId,
          organizationId: orgId,
          orgLeadId: lead.id,
          personId,
          listingAgentProfileId,
          actorUserId: consumerId ?? undefined
        });
      }
    }

    return lead;
  }

  async listLeadsForOrg(orgId: string, userId: string, filters: LeadFilters = {}) {
    const { role } = await this.assertBrokerOrAgent(userId, orgId);
    const where: Prisma.LeadWhereInput = {
      organizationId: orgId
    };

    if (filters.status) {
      where.status = this.normalizeStatus(filters.status);
    }

    if (role !== UserRole.BROKER && role !== UserRole.TEAM_LEAD) {
      const agentProfile = await this.prisma.agentProfile.findUnique({
        where: { organizationId_userId: { organizationId: orgId, userId } }
      });
      if (!agentProfile) {
        return [];
      }
      where.agentProfileId = agentProfile.id;
    }

    return this.prisma.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        listing: true,
        agentProfile: {
          include: {
            user: { select: { firstName: true, lastName: true, email: true } }
          }
        }
      }
    });
  }

  async updateLeadStatus(orgId: string, userId: string, leadId: string, dto: UpdateLeadStatusDto) {
    const { role } = await this.assertBrokerOrAgent(userId, orgId);
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead || lead.organizationId !== orgId) {
      throw new NotFoundException('Lead not found');
    }

    const requestedStatus = this.normalizeStatus(dto.status);

    let nextAgentProfileId: string | null | undefined = undefined;
    if (dto.agentProfileId !== undefined) {
      if (dto.agentProfileId === null) {
        nextAgentProfileId = null;
      } else {
        const profile = await this.assertAgentProfileInOrg(dto.agentProfileId, orgId);
        nextAgentProfileId = profile.id;
      }
    }

    if (role === UserRole.AGENT) {
      const agentProfile = await this.prisma.agentProfile.findUnique({
        where: { organizationId_userId: { organizationId: orgId, userId } }
      });
      if (!agentProfile) {
        throw new ForbiddenException('Agent profile not found');
      }
      if (lead.agentProfileId && lead.agentProfileId !== agentProfile.id) {
        throw new ForbiddenException('Cannot modify leads assigned to other agents');
      }
      if (nextAgentProfileId && nextAgentProfileId !== agentProfile.id) {
        throw new ForbiddenException('Agents cannot reassign leads to other agents');
      }
      nextAgentProfileId = agentProfile.id;
    }

    const updated = await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        status: requestedStatus,
        agentProfileId: nextAgentProfileId === undefined ? undefined : nextAgentProfileId
      }
    });

    if (lead.status !== updated.status) {
      await this.maybeRecordLeadGenConversionFromStatusChange(updated);
    }

    void this.playbooks
      .runTrigger(orgId, PlaybookTriggerType.LEAD_UPDATED, { leadId: updated.id, status: updated.status })
      .catch(() => undefined);

    await this.orgEvents.logOrgEvent({
      organizationId: orgId,
      actorId: userId,
      type: OrgEventType.ORG_LEAD_STATUS_CHANGED,
      payload: {
        leadId: updated.id,
        status: updated.status,
        agentProfileId: updated.agentProfileId ?? null
      }
    });

    return updated;
  }

  private mapLeadStatusToLeadGenEvent(status: LeadStatus): LeadGenConversionEventType | null {
    switch (status) {
      case LeadStatus.CONTACTED:
        return LeadGenConversionEventType.LEAD_CONTACTED;
      case LeadStatus.QUALIFIED:
        return LeadGenConversionEventType.LEAD_QUALIFIED;
      case LeadStatus.APPOINTMENT_SET:
        return LeadGenConversionEventType.APPOINTMENT_SET;
      case LeadStatus.UNDER_CONTRACT:
        return LeadGenConversionEventType.DEAL_UNDER_CONTRACT;
      case LeadStatus.CLOSED:
        return LeadGenConversionEventType.DEAL_CLOSED;
      default:
        return null;
    }
  }

  private async maybeRecordLeadGenConversionFromStatusChange(lead: { id: string; organizationId: string; tenantId: string | null; personId: string | null; status: LeadStatus; metadata: unknown | null; }) {
    const eventType = this.mapLeadStatusToLeadGenEvent(lead.status);
    if (!eventType) {
      return;
    }

    const meta = (lead.metadata ?? null) as any;
    const leadGen = (meta?.custom?.leadGen ?? meta?.leadGen ?? null) as
      | { landingPageId?: string | null; campaignId?: string | null }
      | null;
    const landingPageId = (leadGen?.landingPageId ?? null) as string | null;
    const campaignId = (leadGen?.campaignId ?? null) as string | null;

    if (!landingPageId && !campaignId) {
      return;
    }

    const existing = await this.prisma.leadGenConversionEvent.findFirst({
      where: { leadId: lead.id, eventType },
      select: { id: true }
    });
    if (existing) {
      return;
    }

    await this.prisma.leadGenConversionEvent.create({
      data: {
        organizationId: lead.organizationId,
        tenantId: lead.tenantId ?? undefined,
        personId: lead.personId ?? undefined,
        leadId: lead.id,
        campaignId: campaignId ?? undefined,
        landingPageId: landingPageId ?? undefined,
        eventType,
        occurredAt: new Date(),
        attribution: toNullableJson(meta?.attribution ?? null)
      }
    });
  }

  private async resolveDefaultTenantForOrg(orgId: string): Promise<{ id: string } | null> {
    return this.prisma.tenant.findFirst({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'asc' },
      select: { id: true }
    });
  }

  private normalizeEmail(email?: string | null): string | null {
    const trimmed = (email ?? '').trim();
    return trimmed ? trimmed.toLowerCase() : null;
  }

  private normalizePhone(phone?: string | null): string | null {
    const trimmed = (phone ?? '').trim();
    if (!trimmed) return null;
    const digits = trimmed.replace(/[^0-9+]/g, '');
    if (!digits) return null;
    if (digits.startsWith('+')) return digits;
    if (digits.length === 10) return `+1${digits}`;
    return digits;
  }

  private splitName(name?: string | null): { firstName: string; lastName: string } {
    const trimmed = (name ?? '').trim();
    if (!trimmed) {
      return { firstName: '', lastName: '' };
    }
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return { firstName: parts[0] ?? '', lastName: '' };
    }
    return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
  }

  private buildLeadMetadata(
    dto: CreateLeadDto,
    req?: { ip?: string; headers?: Record<string, unknown> },
    opts?: { isSpamLikely?: boolean }
  ) {
    const userAgent =
      typeof req?.headers?.['user-agent'] === 'string' ? (req?.headers?.['user-agent'] as string) : null;

    const attribution = {
      utmSource: dto.utmSource ?? null,
      utmMedium: dto.utmMedium ?? null,
      utmCampaign: dto.utmCampaign ?? null,
      gclid: dto.gclid ?? null,
      fbclid: dto.fbclid ?? null,
      pageUrl: dto.pageUrl ?? null,
      referrer: dto.referrer ?? null,
      anonymousId: dto.anonymousId ?? null
    };

    const merged = {
      attribution,
      spam: opts?.isSpamLikely ? { honeypot: true } : null,
      ip: req?.ip ?? null,
      userAgent,
      custom: dto.metadata ?? null
    } satisfies Record<string, unknown>;

    return merged;
  }

  private maybeValidUrl(value?: string | null): string | undefined {
    const trimmed = (value ?? '').trim();
    if (!trimmed) return undefined;
    try {
      // eslint-disable-next-line no-new
      new URL(trimmed);
      return trimmed;
    } catch {
      return undefined;
    }
  }

  private async upsertCrmPersonFromPortalLead(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      organizationId: string;
      name: string | null;
      email: string | null;
      phone: string | null;
      utmSource: string | null;
      utmMedium: string | null;
      utmCampaign: string | null;
      gclid: string | null;
    }
  ) {
    const match = await tx.person.findFirst({
      where: {
        tenantId: input.tenantId,
        deletedAt: null,
        OR: [
          ...(input.email ? [{ primaryEmail: input.email }] : []),
          ...(input.phone ? [{ primaryPhone: input.phone }] : [])
        ]
      }
    });

    const { firstName, lastName } = this.splitName(input.name);

    if (!match) {
      const now = new Date();

      const { pipeline, stage } = await this.resolveInboundPipelinePlacement(tx, input.tenantId);

      try {
        return await tx.person.create({
          data: {
            tenantId: input.tenantId,
            organizationId: input.organizationId,
            ownerId: null,
            firstName,
            lastName,
            primaryEmail: input.email,
            primaryPhone: input.phone,
            stage: PersonStage.NEW,
            tags: ['portal_lead'],
            source: 'portal',
            utmSource: input.utmSource,
            utmMedium: input.utmMedium,
            utmCampaign: input.utmCampaign,
            gclid: input.gclid,
            doNotContact: false,
            pipelineId: pipeline?.id ?? null,
            stageId: stage?.id ?? null,
            stageEnteredAt: now,
            leadScore: 0,
            scoreTier: LeadScoreTier.D,
            scoreUpdatedAt: now,
            lastActivityAt: now
          }
        });
      } catch (error) {
        if (!isPrismaUniqueConstraintError(error)) {
          throw error;
        }

        const existing = await tx.person.findFirst({
          where: {
            tenantId: input.tenantId,
            deletedAt: null,
            OR: [
              ...(input.email ? [{ primaryEmail: input.email }] : []),
              ...(input.phone ? [{ primaryPhone: input.phone }] : [])
            ]
          }
        });

        if (!existing) {
          throw error;
        }

        return this.updateCrmPersonFromPortalLead(tx, existing, {
          ...input,
          firstName,
          lastName
        });
      }
    }

    return this.updateCrmPersonFromPortalLead(tx, match, { ...input, firstName, lastName });
  }

  private async resolveInboundPipelinePlacement(
    tx: Prisma.TransactionClient,
    tenantId: string,
    preferredPipelineId?: string | null
  ): Promise<{ pipeline: { id: string } | null; stage: { id: string } | null }> {
    const resolve = async (where: Prisma.PipelineWhereInput) => {
      const pipeline = await tx.pipeline.findFirst({
        where: {
          tenantId,
          ...where,
          stages: { some: {} }
        },
        orderBy: [{ isDefault: 'desc' }, { order: 'asc' }, { publishedAt: 'desc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          stages: { orderBy: { order: 'asc' }, take: 1, select: { id: true } }
        }
      });

      const stage = pipeline?.stages?.[0] ?? null;
      return { pipeline: pipeline ? { id: pipeline.id } : null, stage: stage ? { id: stage.id } : null };
    };

    if (preferredPipelineId) {
      const preferred = await resolve({ id: preferredPipelineId });
      if (preferred.pipeline && preferred.stage) return preferred;
    }

    const byDefault = await resolve({ isDefault: true });
    if (byDefault.pipeline && byDefault.stage) return byDefault;

    const buyer = await resolve({ type: 'buyer' });
    if (buyer.pipeline && buyer.stage) return buyer;

    return resolve({});
  }

  private async updateCrmPersonFromPortalLead(
    tx: Prisma.TransactionClient,
    match: Prisma.PersonGetPayload<Record<string, never>>,
    input: {
      tenantId: string;
      organizationId: string;
      firstName: string;
      lastName: string;
      email: string | null;
      phone: string | null;
      utmSource: string | null;
      utmMedium: string | null;
      utmCampaign: string | null;
      gclid: string | null;
    }
  ) {
    const now = new Date();

    const shouldSetPrimaryEmail = Boolean(input.email && !match.primaryEmail);
    const shouldSetPrimaryPhone = Boolean(input.phone && !match.primaryPhone);

    const [emailConflict, phoneConflict] = await Promise.all([
      shouldSetPrimaryEmail
        ? tx.person.findFirst({
            where: {
              tenantId: input.tenantId,
              deletedAt: null,
              primaryEmail: input.email!,
              id: { not: match.id }
            },
            select: { id: true }
          })
        : Promise.resolve(null),
      shouldSetPrimaryPhone
        ? tx.person.findFirst({
            where: {
              tenantId: input.tenantId,
              deletedAt: null,
              primaryPhone: input.phone!,
              id: { not: match.id }
            },
            select: { id: true }
          })
        : Promise.resolve(null)
    ]);

    const nextSecondaryEmails = (() => {
      if (!input.email || input.email === match.primaryEmail) return match.secondaryEmails;
      if (match.secondaryEmails.includes(input.email)) return match.secondaryEmails;
      return [...match.secondaryEmails, input.email];
    })();

    const nextSecondaryPhones = (() => {
      if (!input.phone || input.phone === match.primaryPhone) return match.secondaryPhones;
      if (match.secondaryPhones.includes(input.phone)) return match.secondaryPhones;
      return [...match.secondaryPhones, input.phone];
    })();

    const portalTag = 'portal_lead';
    const nextTags = match.tags.includes(portalTag) ? match.tags : [...match.tags, portalTag];

    const needsStage = !match.stageId;
    const needsPipeline = !match.pipelineId;

    const placement =
      needsStage || needsPipeline
        ? await this.resolveInboundPipelinePlacement(tx, input.tenantId, match.pipelineId)
        : { pipeline: null, stage: null };

    return tx.person.update({
      where: { id: match.id },
      data: {
        firstName: match.firstName?.trim() ? match.firstName : input.firstName,
        lastName: match.lastName?.trim() ? match.lastName : input.lastName,
        primaryEmail: !emailConflict && shouldSetPrimaryEmail ? input.email : undefined,
        primaryPhone: !phoneConflict && shouldSetPrimaryPhone ? input.phone : undefined,
        secondaryEmails: { set: nextSecondaryEmails },
        secondaryPhones: { set: nextSecondaryPhones },
        tags: { set: nextTags },
        source: match.source ?? 'portal',
        utmSource: match.utmSource ?? input.utmSource,
        utmMedium: match.utmMedium ?? input.utmMedium,
        utmCampaign: match.utmCampaign ?? input.utmCampaign,
        gclid: match.gclid ?? input.gclid,
        pipelineId: needsPipeline && placement.pipeline ? placement.pipeline.id : undefined,
        stageId: needsStage && placement.stage ? placement.stage.id : undefined,
        stageEnteredAt: needsStage && placement.stage ? now : undefined,
        lastActivityAt: now
      }
    });
  }

  private normalizeCustomFields(customFields?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!customFields) return undefined;

    const normalized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(customFields)) {
      const normalizedKey = normalizeCustomFieldKey(key);
      if (!normalizedKey) continue;
      normalized[normalizedKey] = value;
    }

    return Object.keys(normalized).length > 0 ? normalized : undefined;
  }

  private async upsertPersonCustomFields(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      organizationId: string;
      personId: string;
      userId?: string;
      customFields: Record<string, unknown>;
    }
  ): Promise<void> {
    const entries = Object.entries(input.customFields);
    if (entries.length === 0) return;

    const fields = await Promise.all(
      entries.map(([key, value]) =>
        tx.customField.upsert({
          where: {
            tenantId_entity_key: {
              tenantId: input.tenantId,
              entity: CustomFieldEntity.CONTACT,
              key
            }
          },
          create: {
            tenantId: input.tenantId,
            organizationId: input.organizationId,
            entity: CustomFieldEntity.CONTACT,
            key,
            label: labelFromCustomFieldKey(key),
            type: inferCustomFieldType(value),
            createdById: input.userId,
            updatedById: input.userId
          },
          update: {
            organizationId: input.organizationId,
            updatedById: input.userId,
            archived: false
          }
        })
      )
    );

    const fieldIds = fields.map((field) => field.id);
    const existingValues = await tx.customFieldValue.findMany({
      where: {
        tenantId: input.tenantId,
        personId: input.personId,
        fieldId: { in: fieldIds }
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, fieldId: true }
    });

    const existingByFieldId = new Map<string, string>();
    for (const row of existingValues) {
      if (!existingByFieldId.has(row.fieldId)) {
        existingByFieldId.set(row.fieldId, row.id);
      }
    }

    await Promise.all(
      fields.map((field, index) => {
        const value = entries[index]?.[1];
        const existingId = existingByFieldId.get(field.id);
        if (existingId) {
          return tx.customFieldValue.update({
            where: { id: existingId },
            data: { value: toNullableJson(value) }
          });
        }
        return tx.customFieldValue.create({
          data: {
            tenantId: input.tenantId,
            fieldId: field.id,
            personId: input.personId,
            value: toNullableJson(value)
          }
        });
      })
    );
  }

  private async recordCrmTouchpointFromPortalLead(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      personId: string;
      occurredAt: Date;
      message: string | null;
      orgLeadId: string;
      listingId: string | null;
      attribution: unknown;
    }
  ) {
    await tx.leadTouchpoint.create({
      data: {
        tenantId: input.tenantId,
        personId: input.personId,
        userId: null,
        type: LeadTouchpointType.OTHER,
        channel: null,
        occurredAt: input.occurredAt,
        summary: input.listingId ? 'Portal listing inquiry' : 'Portal lead inquiry',
        body: input.message,
        metadata: toJsonValue({
          orgLeadId: input.orgLeadId,
          listingId: input.listingId,
          attribution: input.attribution ?? null
        })
      }
    });

    const rollup = await tx.leadActivityRollup.upsert({
      where: { personId: input.personId },
      create: {
        tenantId: input.tenantId,
        personId: input.personId,
        lastTouchpointAt: input.occurredAt
      },
      update: {
        lastTouchpointAt: input.occurredAt
      }
    });

    const person = await tx.person.findFirst({
      where: { id: input.personId, tenantId: input.tenantId },
      include: { pipelineStage: true, leadFit: true }
    });
    if (!person) return;

    const { score, scoreTier } = calculateLeadScore({
      stage: person.pipelineStage,
      rollup,
      fit: person.leadFit ?? undefined,
      lastActivityAt: person.lastActivityAt ?? undefined,
      touchpointAt: input.occurredAt
    });

    await tx.person.update({
      where: { id: input.personId },
      data: {
        lastActivityAt: input.occurredAt,
        leadScore: score,
        scoreTier,
        scoreUpdatedAt: new Date()
      }
    });
  }

  private async routePortalLeadIntoCrm(input: {
    tenantId: string;
    organizationId: string;
    orgLeadId: string;
    personId: string;
    listingAgentProfileId?: string | null;
    actorUserId?: string;
  }) {
    const person = await this.prisma.person.findUnique({
      where: { id: input.personId }
    });
    if (!person || person.tenantId !== input.tenantId) {
      return;
    }

    if (input.listingAgentProfileId) {
      const agentProfile = await this.prisma.agentProfile.findUnique({
        where: { id: input.listingAgentProfileId },
        select: { id: true, userId: true, organizationId: true }
      });

      if (agentProfile && agentProfile.organizationId === input.organizationId) {
        await Promise.all([
          person.ownerId
            ? Promise.resolve()
            : this.prisma.person.update({
                where: { id: input.personId },
                data: { ownerId: agentProfile.userId }
              }),
          this.prisma.lead.updateMany({
            where: { id: input.orgLeadId, agentProfileId: null },
            data: { agentProfileId: agentProfile.id }
          })
        ]);
      }

      return;
    }

    if (person.ownerId) {
      const agentProfile = await this.prisma.agentProfile.findUnique({
        where: { organizationId_userId: { organizationId: input.organizationId, userId: person.ownerId } },
        select: { id: true }
      });

      if (agentProfile) {
        await this.prisma.lead.updateMany({
          where: { id: input.orgLeadId, agentProfileId: null },
          data: { agentProfileId: agentProfile.id }
        });
      }

      return;
    }

    const routingSettings = await this.routingSettings.getSettings({
      orgId: input.organizationId,
      tenantId: input.tenantId
    });

    if (routingSettings.mode === LeadRoutingOrgMode.APPROVAL_POOL) {
      const ensuredApprovalTeamId =
        routingSettings.approvalTeamId ??
        (await this.routingSettings.updateSettings({
          orgId: input.organizationId,
          tenantId: input.tenantId,
          mode: LeadRoutingOrgMode.APPROVAL_POOL
        })).approvalTeamId;

      await this.routing.assign({
        tenantId: input.tenantId,
        person,
        actorUserId: input.actorUserId,
        approvalPoolTeamId: ensuredApprovalTeamId ?? undefined
      });

      return;
    }

    const result = await this.routing.assign({
      tenantId: input.tenantId,
      person,
      actorUserId: input.actorUserId
    });

    const assignedUserId = result.selectedAgents[0]?.userId ?? null;
    if (!assignedUserId) {
      return;
    }

    const agentProfile = await this.prisma.agentProfile.findUnique({
      where: { organizationId_userId: { organizationId: input.organizationId, userId: assignedUserId } },
      select: { id: true }
    });

    await Promise.all([
      this.prisma.person.update({
        where: { id: input.personId },
        data: { ownerId: assignedUserId }
      }),
      agentProfile
        ? this.prisma.lead.update({
            where: { id: input.orgLeadId },
            data: { agentProfileId: agentProfile.id }
          })
        : Promise.resolve()
    ]);
  }

  private async captureMarketingConsents(input: {
    tenantId: string;
    personId: string;
    emailOptIn: boolean;
    smsOptIn: boolean;
    evidenceUri?: string;
    req?: { ip?: string; headers?: Record<string, unknown> };
  }) {
    const ip = input.req?.ip;
    const userAgent =
      typeof input.req?.headers?.['user-agent'] === 'string'
        ? (input.req?.headers?.['user-agent'] as string)
        : undefined;

    const capturedAt = new Date();

    if (input.emailOptIn) {
      await this.consents.addConsent({
        tenantId: input.tenantId,
        personId: input.personId,
        channel: ConsentChannel.EMAIL,
        scope: ConsentScope.PROMOTIONAL,
        verbatimText: 'Opted in via portal form',
        source: 'portal',
        ip,
        userAgent,
        evidenceUri: input.evidenceUri,
        capturedAt
      });
    }

    if (input.smsOptIn) {
      await this.consents.addConsent({
        tenantId: input.tenantId,
        personId: input.personId,
        channel: ConsentChannel.SMS,
        scope: ConsentScope.PROMOTIONAL,
        verbatimText: 'Opted in via portal form',
        source: 'portal',
        ip,
        userAgent,
        evidenceUri: input.evidenceUri,
        capturedAt
      });
    }
  }
}
