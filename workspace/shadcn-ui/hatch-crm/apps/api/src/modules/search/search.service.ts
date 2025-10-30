import { Injectable, Logger } from '@nestjs/common';
import { DealStage, ListingStatus, OfferStatus, PersonStage, Prisma } from '@hatch/db';

import { CanService } from '../../platform/security/can.service';
import { FlsService } from '../../platform/security/fls.service';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestContext } from '../common/request-context';
import { SearchRequestDto, SearchResponseDto, SearchHitDto } from './dto';

type SupportedType =
  | 'contacts'
  | 'leads'
  | 'accounts'
  | 'opportunities'
  | 'cases'
  | 're_listings'
  | 're_offers'
  | 're_transactions';

interface CursorPayload {
  score: number;
  updatedAt: string;
  object: SupportedType;
  id: string;
}

interface RawHit {
  object: SupportedType;
  id: string;
  orgId: string | null;
  ownerId: string | null;
  title: string;
  subtitle?: string;
  snippetSource?: string;
  score: number;
  updatedAt: Date;
}

const DEFAULT_TYPES: SupportedType[] = [
  'contacts',
  'leads',
  'accounts',
  'opportunities',
  'cases',
  're_listings',
  're_offers',
  're_transactions'
];

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fls: FlsService,
    private readonly can: CanService
  ) {}

  async search(ctx: RequestContext, req: SearchRequestDto): Promise<SearchResponseDto> {
    const query = (req.q ?? '').trim();
    if (!query) {
      return { items: [], nextCursor: null, facets: { byType: {} } };
    }

    const startedAt = Date.now();

    const limit = Math.min(Math.max(req.limit ?? 25, 1), 200);
    const rawTypes = Array.isArray(req.types)
      ? req.types
      : typeof (req.types as unknown) === 'string'
      ? ((req.types as unknown as string)
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean))
      : undefined;
    const requestedTypes = (rawTypes ?? DEFAULT_TYPES) as string[];
    const types = requestedTypes.filter((type): type is SupportedType =>
      DEFAULT_TYPES.includes(type as SupportedType)
    );
    if (types.length === 0) {
      types.push(...DEFAULT_TYPES);
    }

    const perTypeTake = Math.max(limit * 3, 30);

    const cursor = req.cursor ? this.decodeCursor(req.cursor) : null;

    const batches = await Promise.all(
      types.map((type) => this.fetchForType(ctx, type, query, req, perTypeTake))
    );

    const merged = batches.flat();
    const tokens = this.tokenise(query);

    const curated: RawHit[] = [];
    const seen = new Set<string>();

    for (const raw of merged) {
      const key = `${raw.object}:${raw.id}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      raw.score = this.computeScore(raw, tokens);
      curated.push(raw);
    }

    curated.sort((a, b) => this.compareHits(b, a));

    const sliced: RawHit[] = [];
    for (const hit of curated) {
      if (!this.isAfterCursor(hit, cursor)) {
        continue;
      }
      sliced.push(hit);
      if (sliced.length > limit) {
        break;
      }
    }

    const page = sliced.slice(0, limit);
    const next = sliced.length > limit ? sliced[limit] : null;

    const items: SearchHitDto[] = page.map((hit) => ({
      object: hit.object,
      id: hit.id,
      title: hit.title,
      subtitle: hit.subtitle,
      snippet: this.safeHighlight(hit.snippetSource ?? hit.subtitle ?? hit.title, tokens),
      score: hit.score,
      updatedAt: hit.updatedAt.toISOString()
    }));

    const facets: Record<string, number> = {};
    for (const item of items) {
      facets[item.object] = (facets[item.object] ?? 0) + 1;
    }

    const response: SearchResponseDto = {
      items,
      nextCursor: next
        ? this.encodeCursor({
            score: next.score,
            updatedAt: next.updatedAt.toISOString(),
            object: next.object,
            id: next.id
          })
        : null,
      facets: { byType: facets }
    };

    const elapsedMs = Date.now() - startedAt;
    this.logger.log(
      `search qLength=${query.length} types=${types.join(',')} limit=${limit} results=${items.length} durationMs=${elapsedMs}`
    );

    return response;
  }

  private async fetchForType(
    ctx: RequestContext,
    type: SupportedType,
    q: string,
    req: SearchRequestDto,
    take: number
  ): Promise<RawHit[]> {
    switch (type) {
      case 'contacts':
        return this.fetchPersons(ctx, q, req, take, 'contacts');
      case 'leads':
        return this.fetchPersons(ctx, q, req, take, 'leads');
      case 'accounts':
        return this.fetchAccounts(ctx, q, req, take);
      case 'opportunities':
        return this.fetchOpportunities(ctx, q, req, take);
      case 'cases':
        return this.fetchCases(ctx, q, req, take);
      case 're_listings':
        return this.fetchListings(ctx, q, req, take);
      case 're_offers':
        return this.fetchOffers(ctx, q, req, take);
      case 're_transactions':
        return this.fetchDeals(ctx, q, req, take);
      default:
        return [];
    }
  }

  private async fetchPersons(
    ctx: RequestContext,
    q: string,
    req: SearchRequestDto,
    take: number,
    object: 'contacts' | 'leads'
  ): Promise<RawHit[]> {
    if (!ctx.orgId || !ctx.tenantId) {
      return [];
    }

    const isLead = object === 'leads';
    const where: Prisma.PersonWhereInput = {
      tenantId: ctx.tenantId,
      organizationId: ctx.orgId
    };

    if (req.ownerId) {
      where.ownerId = req.ownerId;
    }

    if (isLead) {
      where.stage = { in: [PersonStage.NEW, PersonStage.NURTURE] };
    } else {
      where.stage = { notIn: [PersonStage.NEW, PersonStage.NURTURE] };
    }

    const personStage = this.parsePersonStage(req.stage);
    if (personStage) {
      where.stage = personStage;
    }

    if (q) {
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { primaryEmail: { contains: q, mode: 'insensitive' } },
        { primaryPhone: { contains: q, mode: 'insensitive' } }
      ];
    }

    const records = await this.prisma.person.findMany({
      where,
      take,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
    });

    const hits: RawHit[] = [];
    for (const record of records) {
      const allowed = await this.can.can(ctx, 'read', isLead ? 'leads' : 'contacts', {
        orgId: record.organizationId ?? ctx.orgId,
        ownerId: record.ownerId ?? undefined,
        id: record.id
      });
      if (!allowed) continue;

      const visible = await this.fls.filterRead(ctx, isLead ? 'leads' : 'contacts', {
        firstName: record.firstName,
        lastName: record.lastName,
        primaryEmail: record.primaryEmail ?? undefined,
        primaryPhone: record.primaryPhone ?? undefined,
        stage: record.stage
      });

      const titleParts = [
        visible.firstName ?? record.firstName ?? '',
        visible.lastName ?? record.lastName ?? ''
      ].filter(Boolean);
      const title = titleParts.length > 0 ? titleParts.join(' ') : visible.primaryEmail ?? visible.primaryPhone ?? 'Unnamed person';

      const subtitle = visible.primaryEmail ?? visible.primaryPhone ?? undefined;

      hits.push({
        object,
        id: record.id,
        orgId: ctx.orgId,
        ownerId: record.ownerId ?? null,
        title,
        subtitle,
        snippetSource: [visible.primaryEmail, visible.primaryPhone].filter(Boolean).join(' • '),
        score: 0,
        updatedAt: record.updatedAt
      });
    }

    return hits;
  }

  private async fetchAccounts(
    ctx: RequestContext,
    q: string,
    req: SearchRequestDto,
    take: number
  ): Promise<RawHit[]> {
    if (!ctx.orgId) {
      return [];
    }

    const where: Prisma.AccountWhereInput = {
      orgId: ctx.orgId,
      deletedAt: null
    };

    if (req.ownerId) {
      where.ownerId = req.ownerId;
    }

    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { website: { contains: q, mode: 'insensitive' } },
        { industry: { contains: q, mode: 'insensitive' } }
      ];
    }

    const records = await this.prisma.account.findMany({
      where,
      take,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
    });

    const hits: RawHit[] = [];
    for (const record of records) {
      const allowed = await this.can.can(ctx, 'read', 'accounts', {
        orgId: record.orgId,
        ownerId: record.ownerId ?? undefined,
        id: record.id
      });
      if (!allowed) continue;

      const visible = await this.fls.filterRead(ctx, 'accounts', {
        name: record.name,
        website: record.website ?? undefined,
        industry: record.industry ?? undefined,
        phone: record.phone ?? undefined
      });

      hits.push({
        object: 'accounts',
        id: record.id,
        orgId: record.orgId,
        ownerId: record.ownerId ?? null,
        title: visible.name ?? record.name,
        subtitle: visible.website ?? visible.industry ?? visible.phone ?? undefined,
        snippetSource: [visible.industry, visible.website, visible.phone].filter(Boolean).join(' • '),
        score: 0,
        updatedAt: record.updatedAt
      });
    }

    return hits;
  }

  private async fetchOpportunities(
    ctx: RequestContext,
    q: string,
    req: SearchRequestDto,
    take: number
  ): Promise<RawHit[]> {
    if (!ctx.orgId) {
      return [];
    }

    const where: Prisma.OpportunityWhereInput = {
      orgId: ctx.orgId,
      deletedAt: null
    };

    if (req.ownerId) {
      where.ownerId = req.ownerId;
    }

    if (req.stage) {
      where.stage = req.stage;
    }

    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { stage: { contains: q, mode: 'insensitive' } }
      ];
    }

    const records = await this.prisma.opportunity.findMany({
      where,
      take,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
    });

    const hits: RawHit[] = [];
    for (const record of records) {
      const allowed = await this.can.can(ctx, 'read', 'opportunities', {
        orgId: record.orgId,
        ownerId: record.ownerId ?? undefined,
        id: record.id
      });
      if (!allowed) continue;

      const visible = await this.fls.filterRead(ctx, 'opportunities', {
        name: record.name,
        stage: record.stage,
        amount: record.amount?.toNumber?.() ?? record.amount
      });

      const subtitleParts: string[] = [];
      if (visible.stage ?? record.stage) subtitleParts.push(visible.stage ?? record.stage);
      if (visible.amount !== undefined) {
        subtitleParts.push(`$${Number(visible.amount).toLocaleString()}`);
      }

      hits.push({
        object: 'opportunities',
        id: record.id,
        orgId: record.orgId,
        ownerId: record.ownerId ?? null,
        title: visible.name ?? record.name,
        subtitle: subtitleParts.join(' • ') || undefined,
        snippetSource: subtitleParts.join(' • '),
        score: 0,
        updatedAt: record.updatedAt
      });
    }

    return hits;
  }

  private async fetchCases(
    ctx: RequestContext,
    q: string,
    req: SearchRequestDto,
    take: number
  ): Promise<RawHit[]> {
    if (!ctx.orgId) {
      return [];
    }

    const where: Prisma.CaseWhereInput = {
      orgId: ctx.orgId,
      deletedAt: null
    };

    if (req.ownerId) {
      where.ownerId = req.ownerId;
    }

    if (req.status) {
      where.status = req.status;
    }

    if (q) {
      where.OR = [
        { subject: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { origin: { contains: q, mode: 'insensitive' } }
      ];
    }

    const records = await this.prisma.case.findMany({
      where,
      take,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
    });

    const hits: RawHit[] = [];
    for (const record of records) {
      const allowed = await this.can.can(ctx, 'read', 'cases', {
        orgId: record.orgId,
        ownerId: record.ownerId ?? undefined,
        id: record.id
      });
      if (!allowed) continue;

      const visible = await this.fls.filterRead(ctx, 'cases', {
        subject: record.subject,
        status: record.status,
        priority: record.priority ?? undefined,
        origin: record.origin ?? undefined,
        description: record.description ?? undefined
      });

      hits.push({
        object: 'cases',
        id: record.id,
        orgId: record.orgId,
        ownerId: record.ownerId ?? null,
        title: visible.subject ?? record.subject,
        subtitle: visible.status ?? record.status,
        snippetSource: visible.description ?? visible.origin ?? record.description ?? undefined,
        score: 0,
        updatedAt: record.updatedAt
      });
    }

    return hits;
  }

  private async fetchListings(
    ctx: RequestContext,
    q: string,
    req: SearchRequestDto,
    take: number
  ): Promise<RawHit[]> {
    if (!ctx.tenantId) {
      return [];
    }

    const where: Prisma.ListingWhereInput = {
      tenantId: ctx.tenantId
    };

    const listingStatus = this.parseListingStatus(req.status);
    if (listingStatus) {
      where.status = listingStatus;
    }

    if (q) {
      where.OR = [
        { addressLine1: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
        { state: { contains: q, mode: 'insensitive' } },
        { postalCode: { contains: q, mode: 'insensitive' } },
        { mlsId: { contains: q, mode: 'insensitive' } }
      ];
    }

    const records = await this.prisma.listing.findMany({
      where,
      take,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
    });

    const hits: RawHit[] = [];
    for (const record of records) {
      const allowed = await this.can.can(ctx, 'read', 're_listings', {
        orgId: ctx.orgId,
        ownerId: null,
        id: record.id
      });
      if (!allowed) continue;

      const visible = await this.fls.filterRead(ctx, 're_listings', {
        addressLine1: record.addressLine1,
        city: record.city,
        state: record.state,
        status: record.status,
        price: record.price?.toNumber?.() ?? record.price
      });

      const title =
        visible.addressLine1 ??
        [record.addressLine1, record.city, record.state].filter(Boolean).join(', ');

      const subtitleParts: string[] = [];
      if (visible.status ?? record.status) subtitleParts.push(visible.status ?? record.status);
      if (visible.price !== undefined) {
        subtitleParts.push(`$${Number(visible.price).toLocaleString()}`);
      }

      hits.push({
        object: 're_listings',
        id: record.id,
        orgId: ctx.orgId ?? null,
        ownerId: null,
        title,
        subtitle: subtitleParts.join(' • ') || undefined,
        snippetSource: [record.city, record.state, record.postalCode].filter(Boolean).join(', '),
        score: 0,
        updatedAt: record.updatedAt
      });
    }

    return hits;
  }

  private async fetchOffers(
    ctx: RequestContext,
    q: string,
    req: SearchRequestDto,
    take: number
  ): Promise<RawHit[]> {
    if (!ctx.tenantId) {
      return [];
    }

    const where: Prisma.OfferWhereInput = {
      tenantId: ctx.tenantId
    };

    const offerStatus = this.parseOfferStatus(req.status);
    if (offerStatus) {
      where.status = offerStatus;
    }

    if (q) {
      where.OR = [
        { listing: { addressLine1: { contains: q, mode: 'insensitive' } } },
        { listing: { city: { contains: q, mode: 'insensitive' } } },
        { person: { firstName: { contains: q, mode: 'insensitive' } } },
        { person: { lastName: { contains: q, mode: 'insensitive' } } }
      ];
    }

    const records = await this.prisma.offer.findMany({
      where,
      take,
      include: {
        listing: true,
        person: true
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
    });

    const hits: RawHit[] = [];
    for (const record of records) {
      const allowed = await this.can.can(ctx, 'read', 're_offers', {
        orgId: ctx.orgId,
        ownerId: null,
        id: record.id
      });
      if (!allowed) continue;

      const buyerName = [record.person?.firstName, record.person?.lastName].filter(Boolean).join(' ');
      const listingAddress =
        record.listing?.addressLine1 ??
        [record.listing?.city, record.listing?.state].filter(Boolean).join(', ');

      hits.push({
        object: 're_offers',
        id: record.id,
        orgId: ctx.orgId ?? null,
        ownerId: null,
        title: buyerName || 'Offer',
        subtitle: listingAddress || undefined,
        snippetSource: [record.status, listingAddress].filter(Boolean).join(' • '),
        score: 0,
        updatedAt: record.updatedAt
      });
    }

    return hits;
  }

  private async fetchDeals(
    ctx: RequestContext,
    q: string,
    req: SearchRequestDto,
    take: number
  ): Promise<RawHit[]> {
    if (!ctx.tenantId) {
      return [];
    }

    const where: Prisma.DealWhereInput = {
      tenantId: ctx.tenantId
    };

    const dealStage = this.parseDealStage(req.stage);
    if (dealStage) {
      where.stage = dealStage;
    }

    if (q) {
      where.OR = [
        { listing: { addressLine1: { contains: q, mode: 'insensitive' } } },
        { listing: { city: { contains: q, mode: 'insensitive' } } },
        { person: { firstName: { contains: q, mode: 'insensitive' } } },
        { person: { lastName: { contains: q, mode: 'insensitive' } } }
      ];
    }

    const records = await this.prisma.deal.findMany({
      where,
      include: {
        listing: true,
        person: true
      },
      take,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
    });

    const hits: RawHit[] = [];
    for (const record of records) {
      const allowed = await this.can.can(ctx, 'read', 're_transactions', {
        orgId: ctx.orgId,
        ownerId: null,
        id: record.id
      });
      if (!allowed) continue;

      const buyerName = [record.person?.firstName, record.person?.lastName].filter(Boolean).join(' ');
      const listingAddress =
        record.listing?.addressLine1 ??
        [record.listing?.city, record.listing?.state].filter(Boolean).join(', ');

      hits.push({
        object: 're_transactions',
        id: record.id,
        orgId: ctx.orgId ?? null,
        ownerId: null,
        title: buyerName || listingAddress || 'Transaction',
        subtitle: record.stage,
        snippetSource: [record.stage, listingAddress].filter(Boolean).join(' • '),
        score: 0,
        updatedAt: record.updatedAt
      });
    }

    return hits;
  }

  private computeScore(hit: RawHit, tokens: string[]): number {
    if (!tokens.length) {
      return 1;
    }
    const haystack = `${hit.title} ${hit.subtitle ?? ''} ${hit.snippetSource ?? ''}`.toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (!token) continue;
      const occurrences = haystack.split(token).length - 1;
      if (occurrences > 0) {
        score += occurrences * 2;
      }
    }
    return score > 0 ? score : 1;
  }

  private tokenise(q: string): string[] {
    return q
      .split(/\s+/)
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);
  }

  private parsePersonStage(value?: string): PersonStage | undefined {
    return this.parseEnum(PersonStage, value);
  }

  private parseDealStage(value?: string): DealStage | undefined {
    return this.parseEnum(DealStage, value);
  }

  private parseListingStatus(value?: string): ListingStatus | undefined {
    return this.parseEnum(ListingStatus, value);
  }

  private parseOfferStatus(value?: string): OfferStatus | undefined {
    return this.parseEnum(OfferStatus, value);
  }

  private parseEnum<E>(
    enumeration: Record<string, E>,
    value?: string
  ): E | undefined {
    if (!value) {
      return undefined;
    }
    const normalised = value.trim().toUpperCase();
    return enumeration[normalised] ?? undefined;
  }

  private safeHighlight(text: string | undefined, tokens: string[]): string | undefined {
    if (!text) {
      return undefined;
    }
    const escapedText = this.escapeHtml(text);
    if (!tokens.length) {
      return escapedText;
    }
    try {
      const escapedTokens = tokens
        .filter(Boolean)
        .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
      if (!escapedTokens) {
        return escapedText;
      }
      const regex = new RegExp(`(${escapedTokens})`, 'gi');
      return escapedText.replace(regex, '<mark>$1</mark>');
    } catch {
      return escapedText;
    }
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (char) => {
      switch (char) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        case '\'':
          return '&#39;';
        default:
          return char;
      }
    });
  }

  private compareHits(a: RawHit, b: RawHit): number {
    if (a.score !== b.score) {
      return a.score - b.score;
    }
    const aTime = a.updatedAt.getTime();
    const bTime = b.updatedAt.getTime();
    if (aTime !== bTime) {
      return aTime - bTime;
    }
    if (a.object !== b.object) {
      return a.object.localeCompare(b.object);
    }
    return a.id.localeCompare(b.id);
  }

  private isAfterCursor(hit: RawHit, cursor: CursorPayload | null): boolean {
    if (!cursor) {
      return true;
    }
    if (hit.score > cursor.score) {
      return false;
    }
    if (hit.score < cursor.score) {
      return true;
    }

    const hitTime = hit.updatedAt.toISOString();
    if (hitTime > cursor.updatedAt) {
      return false;
    }
    if (hitTime < cursor.updatedAt) {
      return true;
    }

    if (hit.object !== cursor.object) {
      return hit.object.localeCompare(cursor.object) > 0;
    }

    if (hit.id <= cursor.id) {
      return false;
    }
    return true;
  }

  private encodeCursor(payload: CursorPayload): string {
    return Buffer.from(
      `${payload.score}|${payload.updatedAt}|${payload.object}|${payload.id}`,
      'utf8'
    ).toString('base64');
  }

  private decodeCursor(value: string): CursorPayload | null {
    try {
      const decoded = Buffer.from(value, 'base64').toString('utf8');
      const [scoreRaw, updatedAt, object, id] = decoded.split('|');
      if (!scoreRaw || !updatedAt || !object || !id) {
        return null;
      }
      return {
        score: Number(scoreRaw),
        updatedAt,
        object: object as SupportedType,
        id
      };
    } catch {
      return null;
    }
  }
}
