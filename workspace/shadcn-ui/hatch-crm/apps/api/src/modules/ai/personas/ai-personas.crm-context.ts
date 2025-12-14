import type { Prisma } from '@prisma/client';

import type { PrismaService } from '@/modules/prisma/prisma.service';

const CRM_CONTEXT_LIMIT = 8000;
const PERSONA_CONTEXT_LIMIT = 6000;

type LeadWithNotes = Prisma.PersonGetPayload<{
  select: {
    id: true;
    firstName: true;
    lastName: true;
    primaryEmail: true;
    primaryPhone: true;
    stage: true;
    leadScore: true;
    lastActivityAt: true;
    createdAt: true;
    source: true;
    leadNotes: {
      orderBy: { createdAt: 'desc' };
      take: 3;
      select: { body: true };
    };
  };
}>;

type RawLead = {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  stage: string | null;
  leadScore: number | null;
  lastContactAt: Date | null;
  createdAt: Date;
  source: string | null;
  notes: string | null;
};

type ScoredLead = RawLead & {
  priorityScore: number;
  priorityReasons: string[];
};

function scoreLead(lead: RawLead, now: Date): ScoredLead {
  const reasons: string[] = [];
  let score = 0;

  const baseScore = lead.leadScore ?? 0;
  score += baseScore;

  const daysSinceCreated = (now.getTime() - lead.createdAt.getTime()) / (1000 * 60 * 60 * 24);

  let daysSinceContact = daysSinceCreated;
  if (lead.lastContactAt) {
    daysSinceContact = (now.getTime() - lead.lastContactAt.getTime()) / (1000 * 60 * 60 * 24);
  }

  const stage = (lead.stage ?? '').toUpperCase();
  if (stage.includes('HOT') || stage.includes('ACTIVE')) {
    score += 20;
    reasons.push('Active / hot stage');
  } else if (stage.includes('WARM')) {
    score += 10;
    reasons.push('Warm stage');
  }

  if (daysSinceCreated <= 2) {
    score += 15;
    reasons.push('Very new lead');
  } else if (daysSinceCreated <= 7) {
    score += 8;
    reasons.push('New this week');
  }

  if (daysSinceContact >= 7 && baseScore >= 50) {
    score += 12;
    reasons.push('High score but no recent contact');
  } else if (daysSinceContact >= 14) {
    score += 8;
    reasons.push('No contact for 2+ weeks');
  }

  const source = (lead.source ?? '').toLowerCase();
  if (source.includes('referral')) {
    score += 10;
    reasons.push('Referral lead');
  } else if (source.includes('portal') || source.includes('zillow')) {
    score += 5;
    reasons.push('Portal lead');
  }

  if (lead.notes && /(ready|urgent|move soon|offer)/i.test(lead.notes)) {
    score += 10;
    reasons.push('Notes indicate high intent');
  }

  return {
    ...lead,
    priorityScore: score,
    priorityReasons: reasons
  };
}

export async function buildEchoCrmContext(
  prisma: PrismaService,
  tenantId: string | undefined
): Promise<string> {
  if (!tenantId) {
    return 'NO_CRM_DATA';
  }

  const leads = await prisma.person.findMany({
    where: { tenantId, deletedAt: null },
    orderBy: [
      { leadScore: 'desc' },
      { lastActivityAt: 'asc' }
    ],
    take: 50,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      primaryEmail: true,
      primaryPhone: true,
      stage: true,
      leadScore: true,
      lastActivityAt: true,
      createdAt: true,
      source: true,
      leadNotes: {
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: { body: true }
      }
    }
  });

  if (!leads.length) {
    return 'NO_CRM_DATA';
  }

  const rawLeads: RawLead[] = leads.map(mapLeadForScoring);
  const now = new Date();
  const scoredLeads: ScoredLead[] = rawLeads.map((lead) => scoreLead(lead, now));

  scoredLeads.sort((a, b) => b.priorityScore - a.priorityScore);

  const payload = {
    generatedAt: now.toISOString(),
    leads: scoredLeads.map((lead) => ({
      id: lead.id,
      name: lead.fullName,
      stage: lead.stage,
      leadScore: lead.leadScore,
      priorityScore: lead.priorityScore,
      lastContactAt: lead.lastContactAt,
      createdAt: lead.createdAt,
      source: lead.source,
      priorityReasons: lead.priorityReasons,
      notesPreview: lead.notes?.slice(0, 160) ?? null
    }))
  };

  return JSON.stringify(payload, null, 2).slice(0, CRM_CONTEXT_LIMIT);
}

function mapLeadForScoring(lead: LeadWithNotes): RawLead {
  const fullName = `${lead.firstName ?? ''} ${lead.lastName ?? ''}`.trim();
  const notes = lead.leadNotes.map((note) => note.body).join(' ').trim();

  return {
    id: lead.id,
    fullName: fullName || null,
    email: lead.primaryEmail ?? null,
    phone: lead.primaryPhone ?? null,
    stage: lead.stage ?? null,
    leadScore: lead.leadScore ?? null,
    lastContactAt: lead.lastActivityAt ?? null,
    createdAt: lead.createdAt,
    source: lead.source ?? null,
    notes: notes || null
  };
}

/**
 * Enhanced Echo context with opportunities, transactions, and key metrics
 */
export async function buildEnhancedEchoContext(
  prisma: PrismaService,
  orgId: string | undefined
): Promise<string> {
  if (!orgId) return 'NO_CRM_DATA';

  const now = new Date();
  const next30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [
    leads,
    opportunities,
    transactions,
    listings,
    agentStats
  ] = await Promise.all([
    // Top priority leads
    prisma.lead.findMany({
      where: { organizationId: orgId },
      orderBy: [{ aiScore: 'desc' }, { createdAt: 'desc' }],
      take: 20,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        aiScore: true,
        createdAt: true,
        source: true
      }
    }),
    // Active opportunities
    prisma.opportunity.findMany({
      where: { orgId },
      orderBy: { amount: 'desc' },
      take: 15,
      select: {
        id: true,
        name: true,
        stage: true,
        amount: true,
        closeDate: true,
        account: { select: { name: true } }
      }
    }),
    // Upcoming closings
    prisma.orgTransaction.findMany({
      where: {
        organizationId: orgId,
        closingDate: { gte: now, lte: next30Days }
      },
      orderBy: { closingDate: 'asc' },
      take: 10,
      select: {
        id: true,
        status: true,
        closingDate: true,
        isCompliant: true,
        listing: {
          select: { addressLine1: true, city: true, listPrice: true }
        }
      }
    }),
    // Pending approval listings
    prisma.orgListing.findMany({
      where: {
        organizationId: orgId,
        status: 'PENDING_BROKER_APPROVAL'
      },
      take: 10,
      select: {
        id: true,
        addressLine1: true,
        city: true,
        listPrice: true,
        agentProfile: {
          select: { user: { select: { firstName: true, lastName: true } } }
        }
      }
    }),
    // Agent compliance summary
    prisma.agentProfile.groupBy({
      by: ['isCompliant', 'riskLevel'],
      where: { organizationId: orgId },
      _count: { _all: true }
    })
  ]);

  const context = {
    generatedAt: now.toISOString(),
    summary: {
      totalLeads: leads.length,
      highPriorityLeads: leads.filter(l => (l.aiScore ?? 0) >= 75).length,
      activeOpportunities: opportunities.length,
      upcomingClosings: transactions.length,
      pendingApprovals: listings.length,
      nonCompliantAgents: agentStats.find(s => !s.isCompliant)?._count._all ?? 0
    },
    priorityLeads: leads.slice(0, 10).map(l => ({
      id: l.id,
      name: l.name ?? 'Unknown',
      email: l.email,
      status: l.status,
      score: l.aiScore,
      daysSinceCreated: Math.floor((now.getTime() - l.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
      source: l.source
    })),
    topOpportunities: opportunities.slice(0, 8).map(o => ({
      id: o.id,
      name: o.name,
      account: o.account?.name,
      stage: o.stage,
      amount: o.amount,
      closeDate: o.closeDate
    })),
    upcomingClosings: transactions.map(t => ({
      id: t.id,
      address: `${t.listing?.addressLine1 ?? ''}, ${t.listing?.city ?? ''}`.trim(),
      closingDate: t.closingDate,
      price: t.listing?.listPrice,
      isCompliant: t.isCompliant
    })),
    pendingApprovals: listings.map(l => ({
      id: l.id,
      address: `${l.addressLine1}, ${l.city}`,
      price: l.listPrice,
      agent: `${l.agentProfile?.user?.firstName ?? ''} ${l.agentProfile?.user?.lastName ?? ''}`.trim()
    }))
  };

  return JSON.stringify(context, null, 2).slice(0, CRM_CONTEXT_LIMIT);
}

/**
 * Lumen context for personalized email drafting
 */
export async function buildLumenContext(
  prisma: PrismaService,
  orgId: string | undefined,
  contactQuery?: string
): Promise<string> {
  if (!orgId) return 'NO_CONTACT_DATA';

  // If specific contact mentioned, try to find them
  let contact = null;
  if (contactQuery) {
    contact = await prisma.person.findFirst({
      where: {
        tenantId: orgId,
        OR: [
          { firstName: { contains: contactQuery, mode: 'insensitive' } },
          { lastName: { contains: contactQuery, mode: 'insensitive' } },
          { primaryEmail: { contains: contactQuery, mode: 'insensitive' } }
        ]
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        primaryEmail: true,
        primaryPhone: true,
        stage: true,
        leadScore: true,
        lastActivityAt: true,
        source: true,
        leadNotes: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { body: true, createdAt: true }
        }
      }
    });
  }

  if (contact) {
    const context = {
      contact: {
        name: `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim(),
        email: contact.primaryEmail,
        phone: contact.primaryPhone,
        stage: contact.stage,
        score: contact.leadScore,
        lastContact: contact.lastActivityAt,
        source: contact.source,
        recentNotes: contact.leadNotes.map(n => ({
          text: n.body,
          date: n.createdAt
        }))
      }
    };
    return JSON.stringify(context, null, 2).slice(0, PERSONA_CONTEXT_LIMIT);
  }

  // Otherwise return high-scored leads for general drafting
  const highScoredLeads = await prisma.lead.findMany({
    where: { organizationId: orgId },
    orderBy: { aiScore: 'desc' },
    take: 10,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      status: true,
      aiScore: true,
      createdAt: true,
      source: true
    }
  });

  const context = {
    highScoredLeads: highScoredLeads.map(l => ({
      name: l.name ?? 'Unknown',
      email: l.email,
      phone: l.phone,
      status: l.status,
      score: l.aiScore,
      source: l.source,
      createdAt: l.createdAt
    }))
  };

  return JSON.stringify(context, null, 2).slice(0, PERSONA_CONTEXT_LIMIT);
}

/**
 * Nova context for transaction coordination
 */
export async function buildNovaContext(
  prisma: PrismaService,
  orgId: string | undefined
): Promise<string> {
  if (!orgId) return 'NO_TRANSACTION_DATA';

  const now = new Date();
  const next14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [transactions, listings] = await Promise.all([
    prisma.orgTransaction.findMany({
      where: {
        organizationId: orgId,
        status: { in: ['UNDER_CONTRACT', 'CONTINGENT'] }
      },
      orderBy: { closingDate: 'asc' },
      take: 15,
      select: {
        id: true,
        status: true,
        closingDate: true,
        isCompliant: true,
        requiresAction: true,
        listing: {
          select: {
            addressLine1: true,
            city: true,
            listPrice: true
          }
        },
        documents: {
          select: {
            orgFile: {
              select: {
                documentType: true,
                complianceStatus: true
              }
            }
          }
        }
      }
    }),
    prisma.orgListing.findMany({
      where: {
        organizationId: orgId,
        status: 'ACTIVE',
        expiresAt: { not: null, lte: next14Days }
      },
      take: 10,
      select: {
        id: true,
        addressLine1: true,
        city: true,
        expiresAt: true
      }
    })
  ]);

  const context = {
    generatedAt: now.toISOString(),
    activeTransactions: transactions.map(t => ({
      id: t.id,
      address: `${t.listing?.addressLine1 ?? ''}, ${t.listing?.city ?? ''}`.trim(),
      status: t.status,
      closingDate: t.closingDate,
      daysUntilClosing: t.closingDate
        ? Math.floor((t.closingDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null,
      isCompliant: t.isCompliant,
      requiresAction: t.requiresAction,
      documents: {
        total: t.documents.length,
        pending: t.documents.filter(d => d.orgFile.complianceStatus === 'PENDING').length,
        failed: t.documents.filter(d => d.orgFile.complianceStatus === 'FAILED').length
      }
    })),
    expiringListings: listings.map(l => ({
      id: l.id,
      address: `${l.addressLine1}, ${l.city}`,
      expiresAt: l.expiresAt,
      daysUntilExpiration: l.expiresAt
        ? Math.floor((l.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null
    }))
  };

  return JSON.stringify(context, null, 2).slice(0, PERSONA_CONTEXT_LIMIT);
}

/**
 * Haven context for listing copywriting
 */
export async function buildHavenContext(
  prisma: PrismaService,
  orgId: string | undefined,
  listingQuery?: string
): Promise<string> {
  if (!orgId) return 'NO_LISTING_DATA';

  // If specific listing mentioned, try to find it
  let listing = null;
  if (listingQuery) {
    listing = await prisma.orgListing.findFirst({
      where: {
        organizationId: orgId,
        OR: [
          { addressLine1: { contains: listingQuery, mode: 'insensitive' } },
          { mlsNumber: { contains: listingQuery, mode: 'insensitive' } },
          { id: listingQuery }
        ]
      },
      select: {
        id: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        postalCode: true,
        mlsNumber: true,
        listPrice: true,
        bedrooms: true,
        bathrooms: true,
        squareFeet: true,
        propertyType: true,
        status: true,
        listedAt: true
      }
    });
  }

  if (listing) {
    const context = {
      listing: {
        address: `${listing.addressLine1}${listing.addressLine2 ? `, ${listing.addressLine2}` : ''}, ${listing.city}, ${listing.state} ${listing.postalCode}`,
        mlsNumber: listing.mlsNumber,
        price: listing.listPrice,
        bedrooms: listing.bedrooms,
        bathrooms: listing.bathrooms,
        squareFeet: listing.squareFeet,
        propertyType: listing.propertyType,
        status: listing.status,
        listedAt: listing.listedAt
      }
    };
    return JSON.stringify(context, null, 2).slice(0, PERSONA_CONTEXT_LIMIT);
  }

  // Otherwise return recent active listings for general copywriting
  const recentListings = await prisma.orgListing.findMany({
    where: {
      organizationId: orgId,
      status: { in: ['ACTIVE', 'DRAFT', 'PENDING_BROKER_APPROVAL'] }
    },
    orderBy: { updatedAt: 'desc' },
    take: 5,
    select: {
      id: true,
      addressLine1: true,
      city: true,
      listPrice: true,
      bedrooms: true,
      bathrooms: true,
      squareFeet: true,
      status: true
    }
  });

  const context = {
    recentListings: recentListings.map(l => ({
      id: l.id,
      address: `${l.addressLine1}, ${l.city}`,
      price: l.listPrice,
      beds: l.bedrooms,
      baths: l.bathrooms,
      sqft: l.squareFeet,
      status: l.status
    }))
  };

  return JSON.stringify(context, null, 2).slice(0, PERSONA_CONTEXT_LIMIT);
}

/**
 * Atlas context for market analysis
 * NOTE: Atlas now queries EXTERNAL market data (MLS feeds), not internal org data
 */
export async function buildAtlasContext(
  prisma: PrismaService,
  orgId: string | undefined
): Promise<string> {
  try {
    console.log('[ATLAS] buildAtlasContext called');

    // MLS data is external market data, not org-specific
    // Query it regardless of orgId

    const now = new Date();
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const last90Days = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Query external MLS data with geography filtering
    // Default to Naples, FL market - can be configured per org in the future
    const marketCity = 'Naples';
    const marketState = 'FL';

    console.log(`[ATLAS] Building context for market: ${marketCity}, ${marketState}`);

  const [activeListings, recentSales, priceStats] = await Promise.all([
    // Active MLS inventory (external data)
    prisma.mlsListing.findMany({
      where: {
        status: 'ACTIVE',
        city: marketCity,
        state: marketState
      },
      orderBy: { listingDate: 'desc' },
      take: 50, // Limit to recent listings for context window
      select: {
        id: true,
        addressLine1: true,
        city: true,
        state: true,
        listPrice: true,
        bedrooms: true,
        bathrooms: true,
        squareFeet: true,
        propertyType: true,
        listingDate: true,
        daysOnMarket: true,
        mlsSource: true
      }
    }),
    // Recent comparable sales (external data)
    prisma.marketComparable.findMany({
      where: {
        saleDate: { gte: last90Days },
        city: marketCity,
        state: marketState
      },
      orderBy: { saleDate: 'desc' },
      take: 30,
      select: {
        id: true,
        addressLine1: true,
        city: true,
        salePrice: true,
        originalListPrice: true,
        bedrooms: true,
        bathrooms: true,
        squareFeet: true,
        propertyType: true,
        saleDate: true,
        daysOnMarket: true,
        mlsSource: true
      }
    }),
    // Price statistics from MLS listings
    prisma.mlsListing.aggregate({
      where: {
        status: 'ACTIVE',
        listPrice: { not: null },
        city: marketCity,
        state: marketState
      },
      _avg: { listPrice: true },
      _min: { listPrice: true },
      _max: { listPrice: true },
      _count: { id: true }
    })
  ]);

  console.log(`[ATLAS] Found ${activeListings.length} active listings, ${recentSales.length} recent sales`);

  // Calculate average days on market from listings that have the data
  const validDaysOnMarket = activeListings
    .filter(l => l.daysOnMarket != null)
    .map(l => l.daysOnMarket!);

  const avgDaysOnMarket =
    validDaysOnMarket.length > 0
      ? Math.floor(validDaysOnMarket.reduce((sum, days) => sum + days, 0) / validDaysOnMarket.length)
      : 0;

  // Group by property type
  const listingsByType = activeListings.reduce(
    (acc, listing) => {
      const type = listing.propertyType ?? 'UNKNOWN';
      if (!acc[type]) {
        acc[type] = { count: 0, totalValue: 0 };
      }
      acc[type].count++;
      acc[type].totalValue += Number(listing.listPrice ?? 0);
      return acc;
    },
    {} as Record<string, { count: number; totalValue: number }>
  );

  const context = {
    generatedAt: now.toISOString(),
    marketSummary: {
      activeListings: activeListings.length,
      recentSales30Days: recentSales.filter(
        t => t.saleDate && t.saleDate >= last30Days
      ).length,
      recentSales90Days: recentSales.length,
      avgListPrice: priceStats._avg.listPrice
        ? Math.floor(Number(priceStats._avg.listPrice))
        : null,
      minListPrice: priceStats._min.listPrice
        ? Number(priceStats._min.listPrice)
        : null,
      maxListPrice: priceStats._max.listPrice
        ? Number(priceStats._max.listPrice)
        : null,
      avgDaysOnMarket
    },
    inventoryByType: Object.entries(listingsByType).map(([type, data]) => ({
      propertyType: type,
      count: data.count,
      avgPrice: data.count > 0 ? Math.floor(data.totalValue / data.count) : 0
    })),
    recentSales: recentSales.slice(0, 10).map(comp => ({
      address: `${comp.addressLine1}, ${comp.city}`,
      saleDate: comp.saleDate,
      salePrice: comp.salePrice,
      originalListPrice: comp.originalListPrice,
      beds: comp.bedrooms,
      baths: comp.bathrooms,
      sqft: comp.squareFeet,
      propertyType: comp.propertyType,
      daysOnMarket: comp.daysOnMarket,
      mlsSource: comp.mlsSource
    })),
    topListings: activeListings
      .sort((a, b) => Number(b.listPrice ?? 0) - Number(a.listPrice ?? 0))
      .slice(0, 5)
      .map(l => ({
        address: `${l.addressLine1}, ${l.city}, ${l.state}`,
        price: l.listPrice,
        beds: l.bedrooms,
        baths: l.bathrooms,
        sqft: l.squareFeet,
        daysOnMarket: l.daysOnMarket,
        mlsSource: l.mlsSource
      }))
  };

    const result = JSON.stringify(context, null, 2).slice(0, PERSONA_CONTEXT_LIMIT);
    console.log(`[ATLAS] Context built successfully. Length: ${result.length} chars`);
    return result;
  } catch (error) {
    console.error('[ATLAS] Error building context:', error);
    console.error('[ATLAS] Error stack:', error instanceof Error ? error.stack : 'N/A');
    throw error; // Re-throw so service layer can catch and log
  }
}

/**
 * Mission Control metrics available to all personas
 * Lightweight summary of key business metrics
 */
export async function buildMissionControlMetrics(
  prisma: PrismaService,
  orgId: string | undefined
): Promise<string> {
  if (!orgId) return 'NO_METRICS_DATA';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [
    leadCount,
    opportunityStats,
    activeListingsCount,
    pendingApprovalsCount,
    transactionStats
  ] = await Promise.all([
    // Lead metrics
    prisma.lead.count({
      where: { organizationId: orgId }
    }),
    // Opportunity metrics
    prisma.opportunity.aggregate({
      where: { orgId },
      _count: true,
      _sum: { amount: true }
    }),
    // Active listings
    prisma.orgListing.count({
      where: {
        organizationId: orgId,
        status: 'ACTIVE'
      }
    }),
    // Pending approvals
    prisma.orgListing.count({
      where: {
        organizationId: orgId,
        status: 'PENDING_BROKER_APPROVAL'
      }
    }),
    // Transaction metrics
    prisma.orgTransaction.aggregate({
      where: {
        organizationId: orgId,
        closingDate: { gte: today }
      },
      _count: { id: true }
    })
  ]);

  const metrics = {
    leads: {
      total: leadCount
    },
    opportunities: {
      total: opportunityStats._count,
      totalValue: opportunityStats._sum.amount
        ? Number(opportunityStats._sum.amount)
        : 0
    },
    listings: {
      active: activeListingsCount,
      pendingApproval: pendingApprovalsCount
    },
    transactions: {
      upcoming: transactionStats._count.id
    }
  };

  return JSON.stringify(metrics, null, 2);
}
