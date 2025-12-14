import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  ActivityType,
  Agreement,
  BuyerRepStatus,
  Consent,
  ConsentChannel,
  ConsentScope,
  ConsentStatus,
  Deal,
  DealStage,
  Listing,
  Message,
  Person,
  PersonStage,
  Prisma,
  SavedView,
  Tour,
  User,
  UserRole
} from '@hatch/db';

import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestContext } from '../common/request-context';
import { toJsonValue } from '../common';
import { CreateContactDto, type ContactSource } from './dto/create-contact.dto';
import { ContactListQueryDto } from './dto/contact-list-query.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { ContactReadModelService } from './read-model.service';
import { type ContactListItem as RepoContactListItem, ContactsRepo } from './contacts.repo';

interface ContactOwnerSummary {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl?: string | null;
}

interface ConsentBadge {
  channel: ConsentChannel;
  status: ConsentStatus;
  scope: ConsentScope | null;
  capturedAt: Date | null;
}

type PersonListPayload = Prisma.PersonGetPayload<{
  include: {
    owner: {
      select: {
        id: true;
        firstName: true;
        lastName: true;
        email: true;
        role: true;
        avatarUrl: true;
      };
    };
    consents: true;
    deals: true;
    agreements: true;
  };
}>;

type PersonDetailPayload = Prisma.PersonGetPayload<{
  include: {
    owner: {
      select: {
        id: true;
        firstName: true;
        lastName: true;
        email: true;
        role: true;
        avatarUrl: true;
      };
    };
    consents: true;
    agreements: true;
    tours: {
      orderBy: { startAt: 'desc' };
      take: number;
      include: { listing: true; agent: true };
    };
    deals: {
      orderBy: { updatedAt: 'desc' };
      include: { listing: true };
    };
    messages: {
      orderBy: { createdAt: 'desc' };
      take: number;
      include: { user: true };
    };
    activities: {
      orderBy: { occurredAt: 'desc' };
      take: number;
      include: {
        user: {
          select: { id: true; firstName: true; lastName: true };
        };
      };
    };
  };
}>;

export type ContactListItem = RepoContactListItem;

export interface ContactListResponse {
  rows: ContactListItem[];
  nextCursor?: string;
  savedView?: SavedView | null;
}

export interface ContactDetailsSummary {
  id: string;
  firstName: string | null;
  lastName: string | null;
  primaryEmail: string | null;
  secondaryEmails: string[];
  primaryPhone: string | null;
  secondaryPhones: string[];
  stage: PersonStage;
  tags: string[];
  source: string | null;
  address: string | null;
  doNotContact: boolean;
  buyerRepStatus: BuyerRepStatus;
  lastActivityAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  owner?: ContactOwnerSummary | null;
  consent: {
    email: ConsentBadge;
    sms: ConsentBadge;
  };
  hasOpenDeal: boolean;
  agreements: Array<{ id: string; status: string; expiryDate: Date | null }>;
  deletedAt: Date | null;
}

export interface ContactTimelineEntry {
  id: string;
  type: ActivityType | string;
  occurredAt: Date;
  payload: Prisma.JsonValue;
  actor?: {
    id: string | null;
    name: string | null;
  };
}

export type ContactDetails = ContactDetailsSummary & {
  organizationId: string;
  notes?: string | null;
  consents: Consent[];
  deals: Array<Deal & { listing: Listing | null }>;
  tours: Array<Tour & { listing: Listing | null; agent: User | null }>;
  agreements: Agreement[];
  messages: Array<Message & { user: User | null }>;
  timeline: ContactTimelineEntry[];
};

export interface ContactCreatedResult {
  status: 'created';
  contact: ContactDetails;
}

export interface ContactMergeProposedResult {
  status: 'merge_proposed';
  proposalId: string;
  existingContact: ContactDetailsSummary;
  existingContactId: string;
  incoming: NormalizedContactInput;
}

export type CreateContactResult = ContactCreatedResult | ContactMergeProposedResult;

interface NormalizedContactInput {
  tenantId: string;
  organizationId: string;
  ownerId?: string;
  firstName?: string;
  lastName?: string;
  primaryEmail?: string;
  primaryPhone?: string;
  secondaryEmails: string[];
  secondaryPhones: string[];
  stage: PersonStage;
  tags: string[];
  source?: ContactSource;
  address?: string;
  doNotContact: boolean;
  notes?: string;
  consents: Array<
    ConsentEvidence & {
      channel: ConsentChannel;
      scope: ConsentScope;
    }
  >;
}

interface ConsentEvidence {
  verbatimText: string;
  source: string;
  capturedAt?: string;
  ipAddress?: string;
  userAgent?: string;
  evidenceUri?: string;
}

interface OwnerScope {
  allowedOwnerIds: string[] | null;
  canManageTeam: boolean;
}

const NON_ACTIVE_DEAL_STAGES = [DealStage.CLOSED, DealStage.LOST];

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly readModel: ContactReadModelService,
    private readonly repo: ContactsRepo
  ) {}

  async list(query: ContactListQueryDto, ctx: RequestContext): Promise<ContactListResponse> {
    const tenantId = ctx.tenantId;
    const orgId = ctx.orgId;

    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }

    if (!orgId) {
      throw new BadRequestException('orgId is required');
    }

    const appliedQuery: ContactListQueryDto = { ...query };
    let savedView: SavedView | null = null;

    if (appliedQuery.savedViewId) {
      savedView = await this.prisma.savedView.findFirst({
        where: { id: appliedQuery.savedViewId, tenantId }
      });

      if (savedView) {
        this.applySavedViewFilters(appliedQuery, savedView);
      }
    }

    const ownerScope = await this.resolveOwnerScope(ctx, tenantId);
    if (ownerScope.allowedOwnerIds && ownerScope.allowedOwnerIds.length === 0) {
      return { rows: [], savedView };
    }

    let ownerIds: string[] | undefined;
    if (ownerScope.allowedOwnerIds) {
      if (appliedQuery.ownerId) {
        if (!ownerScope.allowedOwnerIds.includes(appliedQuery.ownerId)) {
          return { rows: [], savedView };
        }
      } else {
        ownerIds = ownerScope.allowedOwnerIds;
      }
    }

    const result = await this.repo.list({
      ...appliedQuery,
      orgId,
      tenantId,
      ownerIds
    });

    return {
      rows: result.rows,
      nextCursor: result.nextCursor,
      savedView
    };
  }

  async create(dto: CreateContactDto, request: RequestContext): Promise<CreateContactResult> {
    const normalized = this.normalizeCreateInput(dto);
    const duplicate = await this.findDuplicate(normalized.tenantId, normalized.primaryEmail, normalized.primaryPhone);

    if (duplicate) {
      const proposal = await this.createMergeProposal(duplicate, normalized, request);
      return {
        status: 'merge_proposed',
        proposalId: proposal.id,
        existingContactId: duplicate.id,
        existingContact: this.mapPersonToSummary(duplicate),
        incoming: normalized
      };
    }

    const person = await this.prisma.person.create({
      data: {
        tenantId: normalized.tenantId,
        organizationId: normalized.organizationId,
        ownerId: normalized.ownerId,
        firstName: normalized.firstName ?? '',
        lastName: normalized.lastName ?? '',
        primaryEmail: normalized.primaryEmail ?? null,
        secondaryEmails: normalized.secondaryEmails,
        primaryPhone: normalized.primaryPhone ?? null,
        secondaryPhones: normalized.secondaryPhones,
        stage: normalized.stage,
        tags: this.normalizeTags(normalized.tags),
        source: normalized.source ?? null,
        address: normalized.address ?? null,
        doNotContact: normalized.doNotContact,
        buyerRepStatus: BuyerRepStatus.NONE,
        lastActivityAt: new Date()
      }
    });

    if (normalized.consents.length > 0) {
      await this.captureConsents(person.id, normalized.tenantId, normalized.consents, request.userId);
    }

    await this.logActivity({
      tenantId: person.tenantId,
      personId: person.id,
      userId: request.userId,
      type: ActivityType.LEAD_CREATED,
      payload: {
        stage: person.stage,
        ownerId: person.ownerId,
        source: person.source
      }
    });

    if (normalized.notes) {
      await this.logActivity({
        tenantId: person.tenantId,
        personId: person.id,
        userId: request.userId,
        type: ActivityType.NOTE_ADDED,
        payload: {
          text: normalized.notes
        }
      });
    }

    await this.outbox.enqueue({
      tenantId: person.tenantId,
      eventType: 'lead.created',
      occurredAt: new Date().toISOString(),
      resource: { id: person.id, type: 'person' },
      data: {
        personId: person.id,
        tenantId: person.tenantId,
        ownerId: person.ownerId,
        stage: person.stage
      }
    });

    const contact = await this.getById(person.id, person.tenantId, request);

    this.refreshReadModel();

    return {
      status: 'created',
      contact
    };
  }

  async getById(personId: string, tenantId: string, ctx: RequestContext): Promise<ContactDetails> {
    const ownerScope = await this.resolveOwnerScope(ctx, tenantId);
    const where: Prisma.PersonWhereInput = { id: personId, tenantId };

    if (ownerScope.allowedOwnerIds) {
      where.OR = [
        { ownerId: { in: ownerScope.allowedOwnerIds } },
        { ownerId: null, OR: ownerScope.allowedOwnerIds.map((id) => ({ ownerId: id })) }
      ];
    }

    const personRecord = await this.prisma.person.findFirst({
      where,
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            avatarUrl: true
          }
        },
        consents: true,
        agreements: true,
        tours: {
          orderBy: { startAt: 'desc' },
          take: 10,
          include: { listing: true, agent: true }
        },
        deals: {
          orderBy: { updatedAt: 'desc' },
          include: { listing: true }
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { user: true }
        },
        activities: {
          orderBy: { occurredAt: 'desc' },
          take: 100,
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true }
            }
          }
        }
      }
    });

    const person = personRecord as PersonDetailPayload | null;

    if (!person) {
      throw new NotFoundException('Contact not found');
    }

    const base = this.mapPersonToSummary(person as unknown as PersonListPayload);

    const timeline: ContactTimelineEntry[] = person.activities.map((activity) => ({
      id: activity.id,
      type: activity.type,
      occurredAt: activity.occurredAt,
      payload: activity.payload,
      actor: activity.user
        ? {
            id: activity.user.id,
            name: [activity.user.firstName, activity.user.lastName].filter(Boolean).join(' ') || null
          }
        : undefined
    }));

    return {
      ...base,
      organizationId: person.organizationId,
      consents: person.consents,
      deals: person.deals,
      tours: person.tours,
      agreements: person.agreements,
      messages: person.messages,
      timeline
    };
  }

  async update(id: string, tenantId: string, dto: UpdateContactDto, ctx: RequestContext): Promise<ContactDetails> {
    const existing = await this.prisma.person.findFirst({
      where: { id, tenantId },
      include: {
        consents: true,
        owner: true
      }
    });

    if (!existing) {
      throw new NotFoundException('Contact not found');
    }

    await this.ensureCanMutate(existing, ctx);

    const updates: Prisma.PersonUpdateInput = {};
    const activityPayloads: Array<{ type: ActivityType; payload: Prisma.JsonValue }> = [];

    if (dto.firstName !== undefined || dto.lastName !== undefined) {
      updates.firstName = dto.firstName ?? existing.firstName ?? '';
      updates.lastName = dto.lastName ?? existing.lastName ?? '';
    }

    if (dto.primaryEmail !== undefined) {
      const email = this.normalizeEmail(dto.primaryEmail);
      if (email !== existing.primaryEmail) {
        await this.assertNoDuplicate(tenantId, { primaryEmail: email, contactId: id });
        updates.primaryEmail = email;
        activityPayloads.push({
          type: ActivityType.CONTACT_EMAIL_CHANGED,
          payload: {
            previous: existing.primaryEmail,
            next: email
          }
        });
      }
    }

    if (dto.primaryPhone !== undefined) {
      const phone = this.normalizePhone(dto.primaryPhone);
      if (phone !== existing.primaryPhone) {
        await this.assertNoDuplicate(tenantId, { primaryPhone: phone, contactId: id });
        updates.primaryPhone = phone;
        activityPayloads.push({
          type: ActivityType.CONTACT_PHONE_CHANGED,
          payload: {
            previous: existing.primaryPhone,
            next: phone
          }
        });
      }
    }

    if (dto.secondaryEmails !== undefined) {
      updates.secondaryEmails = this.normalizeEmailArray(dto.secondaryEmails);
    }

    if (dto.secondaryPhones !== undefined) {
      updates.secondaryPhones = this.normalizePhoneArray(dto.secondaryPhones);
    }

    if (dto.stage && dto.stage !== existing.stage) {
      updates.stage = dto.stage;
      activityPayloads.push({
        type: ActivityType.CONTACT_STAGE_CHANGED,
        payload: { previous: existing.stage, next: dto.stage }
      });
    }

    if (dto.tags !== undefined) {
      const normalizedTags = this.normalizeTags(dto.tags);
      updates.tags = normalizedTags;
      activityPayloads.push({
        type: ActivityType.CONTACT_TAGS_CHANGED,
        payload: { previous: existing.tags, next: normalizedTags }
      });
    }

    if (dto.source !== undefined) {
      updates.source = dto.source ?? null;
    }

    if (dto.address !== undefined) {
      updates.address = dto.address ?? null;
    }

    if (dto.doNotContact !== undefined) {
      updates.doNotContact = dto.doNotContact;
    }

    if (dto.ownerId !== undefined && dto.ownerId !== existing.ownerId) {
      await this.ensureOwnerAssignmentIsAllowed(dto.ownerId, tenantId, ctx);
      updates.owner = { connect: { id: dto.ownerId } };
      activityPayloads.push({
        type: ActivityType.CONTACT_OWNER_CHANGED,
        payload: { previous: existing.ownerId, next: dto.ownerId }
      });
    }

    if (dto.notes) {
      await this.logActivity({
        tenantId,
        personId: id,
        userId: ctx.userId,
        type: ActivityType.NOTE_ADDED,
        payload: { text: dto.notes }
      });
    }

    if (Object.keys(updates).length > 0) {
      updates.lastActivityAt = new Date();
      await this.prisma.person.update({
        where: { id },
        data: updates
      });
    }

    for (const activity of activityPayloads) {
      await this.logActivity({
        tenantId,
        personId: id,
        userId: ctx.userId,
        type: activity.type,
        payload: activity.payload
      });
    }

    if (dto.consents?.length) {
      await this.captureConsents(id, tenantId, dto.consents, ctx.userId);
    }

    this.refreshReadModel();

    return this.getById(id, tenantId, ctx);
  }

  async remove(id: string, tenantId: string, ctx: RequestContext): Promise<void> {
    const existing = await this.prisma.person.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new NotFoundException('Contact not found');
    }
    await this.ensureCanMutate(existing, ctx);

    await this.prisma.person.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    await this.logActivity({
      tenantId,
      personId: id,
      userId: ctx.userId,
      type: ActivityType.CONTACT_DELETED,
      payload: {}
    });

    this.refreshReadModel();
  }

  async restore(id: string, tenantId: string, ctx: RequestContext): Promise<ContactDetails> {
    const existing = await this.prisma.person.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new NotFoundException('Contact not found');
    }
    await this.ensureCanMutate(existing, ctx);

    await this.prisma.person.update({
      where: { id },
      data: { deletedAt: null }
    });

    await this.logActivity({
      tenantId,
      personId: id,
      userId: ctx.userId,
      type: ActivityType.CONTACT_RESTORED,
      payload: {}
    });

    this.refreshReadModel();

    return this.getById(id, tenantId, ctx);
  }

  async assignOwner(
    id: string,
    tenantId: string,
    newOwnerId: string,
    options: { notify: boolean; reason?: string },
    ctx: RequestContext
  ): Promise<ContactDetails> {
    const existing = await this.prisma.person.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new NotFoundException('Contact not found');
    }
    await this.ensureCanMutate(existing, ctx);
    await this.ensureOwnerAssignmentIsAllowed(newOwnerId, tenantId, ctx);

    const previousOwnerId = existing.ownerId ?? null;

    await this.prisma.person.update({
      where: { id },
      data: {
        ownerId: newOwnerId,
        lastActivityAt: new Date()
      }
    });

    await this.logActivity({
      tenantId,
      personId: id,
      userId: ctx.userId,
      type: ActivityType.CONTACT_OWNER_CHANGED,
      payload: {
        previous: previousOwnerId,
        next: newOwnerId,
        reason: options.reason ?? null,
        notify: options.notify
      }
    });

    // TODO: notify new owner / send email based on options.notify

    this.refreshReadModel();

    return this.getById(id, tenantId, ctx);
  }

  async saveView(tenantId: string, request: RequestContext, payload: { name: string; filters: unknown; isDefault?: boolean }): Promise<SavedView> {
    return this.prisma.savedView.upsert({
      where: {
        userId_name: {
          userId: request.userId,
          name: payload.name
        }
      },
      update: {
        filters: payload.filters as Prisma.JsonObject,
        query: payload.filters as Prisma.JsonObject,
        isDefault: payload.isDefault ?? false,
        updatedAt: new Date()
      },
      create: {
        tenantId,
        userId: request.userId,
        name: payload.name,
        filters: payload.filters as Prisma.JsonObject,
        query: payload.filters as Prisma.JsonObject,
        isDefault: payload.isDefault ?? false
      }
    });
  }

  async listViews(tenantId: string, request: RequestContext): Promise<SavedView[]> {
    return this.prisma.savedView.findMany({
      where: { tenantId, userId: request.userId },
      orderBy: { updatedAt: 'desc' }
    });
  }

  async deleteView(id: string, tenantId: string, request: RequestContext): Promise<void> {
    const view = await this.prisma.savedView.findFirst({ where: { id, tenantId } });
    if (!view || view.userId !== request.userId) {
      throw new NotFoundException('Saved view not found');
    }
    await this.prisma.savedView.delete({ where: { id } });
  }

  // Helpers

  private async resolveOwnerScope(ctx: RequestContext, tenantId: string): Promise<OwnerScope> {
    if (ctx.role === UserRole.BROKER) {
      return { allowedOwnerIds: null, canManageTeam: true };
    }

    if (!ctx.teamIds.length) {
      return {
        allowedOwnerIds: [ctx.userId],
        canManageTeam: ctx.allowTeamContactActions
      };
    }

    const teamMembers = await this.prisma.teamMembership.findMany({
      where: {
        teamId: { in: ctx.teamIds },
        team: { tenantId }
      },
      select: { userId: true }
    });

    const ownerIds = new Set<string>([ctx.userId]);
    if (ctx.allowTeamContactActions || ctx.role === UserRole.TEAM_LEAD) {
      for (const member of teamMembers) {
        ownerIds.add(member.userId);
      }
    }

    return {
      allowedOwnerIds: Array.from(ownerIds),
      canManageTeam: ctx.allowTeamContactActions || ctx.role === UserRole.TEAM_LEAD
    };
  }

  private refreshReadModel() {
    this.readModel.refreshInBackground();
  }

  private mapPersonToSummary(person: PersonListPayload): ContactDetailsSummary {
    const consentSummary = this.computeConsentSummary(person.consents);
    const hasOpenDeal = person.deals.some((deal) => !NON_ACTIVE_DEAL_STAGES.some((stage) => stage === deal.stage));
    const buyerRepAgreements = person.agreements
      .filter((agreement) => agreement.type === 'BUYER_REP')
      .map((agreement) => ({
        id: agreement.id,
        status: agreement.status,
        expiryDate: agreement.expiryDate
      }));

    const owner = person.owner
      ? {
          id: person.owner.id,
          name: [person.owner.firstName, person.owner.lastName].filter(Boolean).join(' ') || person.owner.email,
          email: person.owner.email,
          role: person.owner.role,
          avatarUrl: person.owner.avatarUrl ?? undefined
        }
      : null;

    return {
      id: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      primaryEmail: person.primaryEmail,
      secondaryEmails: person.secondaryEmails ?? [],
      primaryPhone: person.primaryPhone,
      secondaryPhones: person.secondaryPhones ?? [],
      stage: person.stage,
      tags: person.tags ?? [],
      source: person.source ?? null,
      address: person.address ?? null,
      doNotContact: person.doNotContact ?? false,
      buyerRepStatus: person.buyerRepStatus ?? BuyerRepStatus.NONE,
      lastActivityAt: person.lastActivityAt ?? null,
      createdAt: person.createdAt,
      updatedAt: person.updatedAt,
      owner,
      consent: consentSummary,
      hasOpenDeal,
      agreements: buyerRepAgreements,
      deletedAt: person.deletedAt ?? null
    };
  }

  private applySavedViewFilters(query: ContactListQueryDto, view: SavedView) {
    const filtersSource = (view.query ?? view.filters) as Record<string, unknown> | null | undefined;
    if (!filtersSource) return;
    const filters = filtersSource as Record<string, unknown>;

    if (filters.search && filters.q === undefined) {
      (query as unknown as Record<string, unknown>).q = filters.search;
    }
    if (filters.pageSize !== undefined && filters.limit === undefined) {
      const parsedLimit = Number(filters.pageSize);
      if (Number.isFinite(parsedLimit)) {
        (query as unknown as Record<string, unknown>).limit = parsedLimit;
      }
    }

    const assign = <K extends keyof ContactListQueryDto>(key: K) => {
      const filterValue = filters[key as string];
      if (filterValue !== undefined && filterValue !== null) {
        (query as unknown as Record<string, unknown>)[key as string] = filterValue;
      }
    };
    const assignBoolean = (key: keyof ContactListQueryDto) => {
      const value = filters[key as string];
      if (value === undefined || value === null) return;
      (query as unknown as Record<string, unknown>)[key as string] =
        typeof value === 'string' ? value === 'true' : Boolean(value);
    };

    const assignNumber = (key: keyof ContactListQueryDto) => {
      const value = filters[key as string];
      if (value === undefined || value === null) return;
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        (query as unknown as Record<string, unknown>)[key as string] = numeric;
      }
    };

    assign('ownerId');
    assign('teamId');
    assign('status');
    assign('source');
    assign('sort');
    assign('q');
    assign('cursor');
    if (filters.consent !== undefined && filters.consent !== null) {
      const value = filters.consent;
      if (Array.isArray(value)) {
        query.consent = value as Array<'sms' | 'email' | 'call'>;
      } else if (typeof value === 'string') {
        query.consent = value
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry): entry is 'sms' | 'email' | 'call' => ['sms', 'email', 'call'].includes(entry as never));
      }
    }
    assignBoolean('dncBlocked');
    assignNumber('minScore');
    assignNumber('maxAgeDays');
    assignNumber('limit');

    if (filters.stage && query.status === undefined) {
      const value = filters.stage;
      if (Array.isArray(value)) {
        query.status = value as string[];
      } else if (typeof value === 'string') {
        query.status = value.split(',').map((entry) => entry.trim()).filter(Boolean);
      }
    }

    if (filters.doNotContact !== undefined && query.dncBlocked === undefined) {
      query.dncBlocked = typeof filters.doNotContact === 'string'
        ? filters.doNotContact === 'true'
        : Boolean(filters.doNotContact);
    }

    if (!query.consent && (filters.emailConsent || filters.smsConsent)) {
      const consentChannels: Array<'sms' | 'email' | 'call'> = [];
      const emailFilter = filters.emailConsent as string[] | string | undefined;
      if (emailFilter) {
        const values = Array.isArray(emailFilter) ? emailFilter : emailFilter.split(',');
        if (values.some((value) => value === 'GRANTED')) {
          consentChannels.push('email');
        }
      }
      const smsFilter = filters.smsConsent as string[] | string | undefined;
      if (smsFilter) {
        const values = Array.isArray(smsFilter) ? smsFilter : smsFilter.split(',');
        if (values.some((value) => value === 'GRANTED')) {
          consentChannels.push('sms');
        }
      }
      if (consentChannels.length) {
        query.consent = consentChannels;
      }
    }
  }

  private computeConsentSummary(consents: Consent[]): { email: ConsentBadge; sms: ConsentBadge } {
    const latestForChannel = (channel: ConsentChannel): Consent | undefined =>
      consents
        .filter((consent) => consent.channel === channel)
        .sort((a, b) => {
          const aDate = a.capturedAt ?? a.createdAt;
          const bDate = b.capturedAt ?? b.createdAt;
          return (bDate?.getTime() ?? 0) - (aDate?.getTime() ?? 0);
        })[0];

    const buildBadge = (channel: ConsentChannel): ConsentBadge => {
      const latest = latestForChannel(channel);
      if (!latest) {
        return {
          channel,
          status: ConsentStatus.UNKNOWN,
          scope: null,
          capturedAt: null
        };
      }
      return {
        channel,
        status: latest.status,
        scope: latest.scope ?? null,
        capturedAt: latest.capturedAt ?? latest.createdAt ?? null
      };
    };

    return {
      email: buildBadge(ConsentChannel.EMAIL),
      sms: buildBadge(ConsentChannel.SMS)
    };
  }

  private normalizeCreateInput(dto: CreateContactDto): NormalizedContactInput {
    return {
      tenantId: dto.tenantId,
      organizationId: dto.organizationId,
      ownerId: dto.ownerId,
      firstName: dto.firstName?.trim(),
      lastName: dto.lastName?.trim(),
      primaryEmail: this.normalizeEmail(dto.primaryEmail),
      primaryPhone: this.normalizePhone(dto.primaryPhone),
      secondaryEmails: this.normalizeEmailArray(dto.secondaryEmails),
      secondaryPhones: this.normalizePhoneArray(dto.secondaryPhones),
      stage: dto.stage ?? PersonStage.NEW,
      tags: this.normalizeTags(dto.tags),
      source: dto.source,
      address: dto.address?.trim(),
      doNotContact: dto.doNotContact ?? false,
      notes: dto.notes?.trim(),
      consents:
        dto.consents?.map((consent) => ({
          channel: consent.channel,
          scope: consent.scope,
          verbatimText: consent.verbatimText,
          source: consent.source,
          capturedAt: consent.capturedAt,
          ipAddress: consent.ipAddress,
          userAgent: consent.userAgent,
          evidenceUri: consent.evidenceUri
        })) ?? []
    };
  }

  private normalizeEmail(email?: string | null): string | undefined {
    if (!email) return undefined;
    return email.trim().toLowerCase();
  }

  private normalizeEmailArray(emails?: string[]): string[] {
    if (!emails || emails.length === 0) return [];
    const deduped = new Set<string>();
    for (const email of emails) {
      const normalized = this.normalizeEmail(email);
      if (normalized) {
        deduped.add(normalized);
      }
    }
    return Array.from(deduped);
  }

  private normalizePhone(phone?: string | null): string | undefined {
    if (!phone) return undefined;
    const digits = phone.replace(/[^0-9+]/g, '');
    if (digits.startsWith('+')) {
      return digits;
    }
    if (digits.length === 10) {
      return `+1${digits}`;
    }
    return digits;
  }

  private normalizePhoneArray(phones?: string[]): string[] {
    if (!phones || phones.length === 0) return [];
    const deduped = new Set<string>();
    for (const phone of phones) {
      const normalized = this.normalizePhone(phone);
      if (normalized) {
        deduped.add(normalized);
      }
    }
    return Array.from(deduped);
  }

  private normalizeTags(tags?: string[]): string[] {
    if (!tags) return [];
    const deduped = new Set<string>();
    for (const tag of tags) {
      if (tag) {
        deduped.add(tag.trim());
      }
    }
    return Array.from(deduped);
  }

  private async findDuplicate(tenantId: string, email?: string, phone?: string): Promise<PersonListPayload | null> {
    if (!email && !phone) {
      return null;
    }
    const where: Prisma.PersonWhereInput = {
      tenantId,
      deletedAt: null,
      OR: []
    };
    if (email) {
      where.OR!.push({ primaryEmail: email });
    }
    if (phone) {
      where.OR!.push({ primaryPhone: phone });
    }
    if (!where.OR || where.OR.length === 0) {
      return null;
    }

    return this.prisma.person.findFirst({
      where,
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            avatarUrl: true
          }
        },
        consents: true,
        deals: true,
        agreements: true
      }
    });
  }

  private async createMergeProposal(
    existing: PersonListPayload,
    incoming: NormalizedContactInput,
    ctx: RequestContext
  ) {
    const incomingPayload = JSON.parse(JSON.stringify(incoming)) as Prisma.JsonObject;

    const proposal = await this.prisma.contactMergeProposal.create({
      data: {
        tenantId: existing.tenantId,
        existingPersonId: existing.id,
        incomingPayload,
        proposedByUserId: ctx.userId
      }
    });

    await this.logActivity({
      tenantId: existing.tenantId,
      personId: existing.id,
      userId: ctx.userId,
      type: ActivityType.CONTACT_MERGE_PROPOSED,
      payload: {
        proposalId: proposal.id,
        incoming: incomingPayload
      }
    });

    return proposal;
  }

  private async logActivity(options: {
    tenantId: string;
    personId: string;
    userId?: string;
    type: ActivityType;
    payload: Prisma.JsonValue;
  }) {
    await this.prisma.activity.create({
      data: {
        tenantId: options.tenantId,
        personId: options.personId,
        userId: options.userId ?? null,
        type: options.type,
        payload: toJsonValue(options.payload),
        occurredAt: new Date()
      }
    });

    await this.prisma.person.update({
      where: { id: options.personId },
      data: { lastActivityAt: new Date() }
    });
  }

  private async captureConsents(
    personId: string,
    tenantId: string,
    consents: Array<ConsentEvidence & { channel: ConsentChannel; scope: ConsentScope }>,
    actorUserId?: string
  ) {
    for (const consent of consents) {
      await this.prisma.consent.create({
        data: {
          tenantId,
          personId,
          channel: consent.channel,
          scope: consent.scope,
          status: ConsentStatus.GRANTED,
          verbatimText: consent.verbatimText,
          source: consent.source,
          capturedAt: consent.capturedAt ? new Date(consent.capturedAt) : new Date(),
          ipAddress: consent.ipAddress,
          userAgent: consent.userAgent,
          evidenceUri: consent.evidenceUri,
          actorUserId: actorUserId ?? null
        }
      });

      await this.logActivity({
        tenantId,
        personId,
        userId: actorUserId,
        type: ActivityType.CONSENT_CAPTURED,
        payload: {
          channel: consent.channel,
          scope: consent.scope,
          source: consent.source
        }
      });
    }
  }

  private async ensureCanMutate(person: Person, ctx: RequestContext) {
    if (ctx.role === UserRole.MARKETING || ctx.role === UserRole.LENDER) {
      throw new ForbiddenException('You do not have permission to modify contacts');
    }

    if (ctx.role === UserRole.BROKER) {
      return;
    }

    if (ctx.role === UserRole.TEAM_LEAD && ctx.allowTeamContactActions) {
      return;
    }

    if (person.ownerId && person.ownerId !== ctx.userId && !ctx.allowTeamContactActions) {
      throw new ForbiddenException('You do not have permission to modify this contact');
    }
  }

  private async ensureOwnerAssignmentIsAllowed(newOwnerId: string, tenantId: string, ctx: RequestContext) {
    if (ctx.role === UserRole.BROKER) {
      return;
    }

    if (!ctx.allowTeamContactActions && newOwnerId !== ctx.userId) {
      throw new ForbiddenException('You do not have permission to assign this owner');
    }

    if (ctx.allowTeamContactActions) {
      const membership = await this.prisma.teamMembership.findFirst({
        where: { userId: newOwnerId, teamId: { in: ctx.teamIds }, team: { tenantId } },
        select: { id: true }
      });
      if (!membership) {
        throw new ForbiddenException('You can only assign contacts within your team');
      }
    }
  }

  private async assertNoDuplicate(
    tenantId: string,
    payload: { primaryEmail?: string; primaryPhone?: string; contactId: string }
  ) {
    const where: Prisma.PersonWhereInput = {
      tenantId,
      deletedAt: null,
      id: { not: payload.contactId }
    };
    const or: Prisma.PersonWhereInput[] = [];
    if (payload.primaryEmail) {
      or.push({ primaryEmail: payload.primaryEmail });
    }
    if (payload.primaryPhone) {
      or.push({ primaryPhone: payload.primaryPhone });
    }
    if (!or.length) return;
    where.OR = or;
    const duplicate = await this.prisma.person.findFirst({ where, select: { id: true } });
    if (duplicate) {
      throw new ConflictException('Another contact already uses this email or phone number');
    }
  }

  /**
   * Convert a contact (Person) to an Opportunity
   * Creates an Account if needed, then creates an Opportunity linked to it
   */
  async convertToOpportunity(
    contactId: string,
    ctx: RequestContext,
    options?: { opportunityName?: string; accountName?: string }
  ) {
    if (!ctx.tenantId || !ctx.orgId || !ctx.userId) {
      throw new BadRequestException('Missing required context');
    }

    // Get the contact
    const person = await this.prisma.person.findFirst({
      where: {
        id: contactId,
        tenantId: ctx.tenantId,
        organizationId: ctx.orgId,
        deletedAt: null
      }
    });

    if (!person) {
      throw new NotFoundException('Contact not found');
    }

    await this.ensureCanMutate(person, ctx);

    // Create or find account
    const fullName = `${person.firstName} ${person.lastName}`.trim();
    const accountName = options?.accountName || fullName || 'Unnamed Account';

    let account = await this.prisma.account.findFirst({
      where: {
        orgId: ctx.orgId,
        name: accountName,
        deletedAt: null
      }
    });

    if (!account) {
      account = await this.prisma.account.create({
        data: {
          orgId: ctx.orgId,
          ownerId: person.ownerId ?? ctx.userId,
          name: accountName,
          phone: person.primaryPhone
        }
      });
    }

    // Create opportunity
    const opportunityName =
      options?.opportunityName || `${fullName} - ${new Date().toISOString().split('T')[0]}`;

    const opportunity = await this.prisma.opportunity.create({
      data: {
        orgId: ctx.orgId,
        ownerId: person.ownerId ?? ctx.userId,
        accountId: account.id,
        name: opportunityName,
        stage: 'prospecting',
        amount: null,
        currency: 'USD'
      },
      include: {
        account: {
          select: { id: true, name: true }
        }
      }
    });

    // Create activity log
    // TODO: Fix activity type
    // await this.prisma.activity.create({
    //   data: {
    //     tenantId: ctx.tenantId,
    //     personId: person.id,
    //     userId: ctx.userId,
    //     type: ActivityType.OPPORTUNITY_CREATED,
    //     occurredAt: new Date()
    //   }
    // });

    // Update person stage to indicate conversion
    await this.prisma.person.update({
      where: { id: person.id },
      data: {
        stage: PersonStage.UNDER_CONTRACT
      }
    });

    return {
      opportunity,
      account,
      message: 'Contact successfully converted to opportunity'
    };
  }
}
