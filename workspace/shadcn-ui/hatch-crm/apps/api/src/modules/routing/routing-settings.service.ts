import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LeadType } from '@hatch/db';

import { PrismaService } from '../prisma/prisma.service';
import { LeadRoutingOrgMode } from './dto/routing-settings.dto';

const ORG_ADDON_LEAD_ROUTING = 'lead_routing';
const APPROVAL_TEAM_NAME = 'Broker Approval Pool';

type LeadRoutingAddonMetadata = {
  version?: number;
  mode?: string;
  approvalTeamId?: string | null;
};

const normalizeMode = (value: unknown): LeadRoutingOrgMode => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return normalized === LeadRoutingOrgMode.APPROVAL_POOL ? LeadRoutingOrgMode.APPROVAL_POOL : LeadRoutingOrgMode.AUTOMATIC;
};

const normalizeTeamId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const leadTypeLabel = (value: LeadType): string => {
  if (value === LeadType.BUYER) return 'BUYER';
  if (value === LeadType.SELLER) return 'SELLER';
  return 'UNKNOWN';
};

type RoutingEventCandidate = {
  agentId?: string;
  fullName?: string;
  status?: string;
  score?: number;
  reasons?: string[];
};

const normalizeCandidates = (value: unknown): RoutingEventCandidate[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (entry && typeof entry === 'object' ? (entry as RoutingEventCandidate) : null))
    .filter(Boolean) as RoutingEventCandidate[];
};

@Injectable()
export class RoutingSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(input: { orgId: string; tenantId: string }) {
    const row = await this.prisma.organizationAddon.findUnique({
      where: {
        organizationId_key: {
          organizationId: input.orgId,
          key: ORG_ADDON_LEAD_ROUTING
        }
      },
      select: { enabled: true, metadata: true, updatedAt: true }
    });

    const metadata = (row?.metadata ?? {}) as LeadRoutingAddonMetadata;
    const mode = row?.enabled === false ? LeadRoutingOrgMode.AUTOMATIC : normalizeMode(metadata?.mode);
    const approvalTeamId = normalizeTeamId(metadata?.approvalTeamId);

    const approvalTeam = approvalTeamId
      ? await this.prisma.team.findFirst({
          where: { id: approvalTeamId, orgId: input.orgId, tenantId: input.tenantId },
          select: { id: true, name: true }
        })
      : null;

    return {
      mode,
      approvalTeamId: approvalTeam?.id ?? approvalTeamId,
      approvalTeamName: approvalTeam?.name ?? null,
      updatedAt: row?.updatedAt ?? null
    };
  }

  async updateSettings(input: { orgId: string; tenantId: string; mode: LeadRoutingOrgMode; approvalTeamId?: string | null }) {
    const existing = await this.getSettings({ orgId: input.orgId, tenantId: input.tenantId });

    let approvalTeamId = normalizeTeamId(input.approvalTeamId ?? existing.approvalTeamId);
    if (input.mode === LeadRoutingOrgMode.APPROVAL_POOL) {
      if (approvalTeamId) {
        const found = await this.prisma.team.findFirst({
          where: { id: approvalTeamId, orgId: input.orgId, tenantId: input.tenantId },
          select: { id: true }
        });
        if (!found) {
          throw new BadRequestException('Approval team not found for organization');
        }
      } else {
        approvalTeamId = await this.ensureApprovalPoolTeam({
          tenantId: input.tenantId,
          orgId: input.orgId
        });
      }
    }

    const metadata: LeadRoutingAddonMetadata = {
      version: 1,
      mode: input.mode,
      approvalTeamId
    };

    await this.prisma.organizationAddon.upsert({
      where: {
        organizationId_key: {
          organizationId: input.orgId,
          key: ORG_ADDON_LEAD_ROUTING
        }
      },
      create: {
        organizationId: input.orgId,
        key: ORG_ADDON_LEAD_ROUTING,
        enabled: true,
        metadata
      },
      update: {
        enabled: true,
        metadata
      }
    });

    return this.getSettings({ orgId: input.orgId, tenantId: input.tenantId });
  }

  async listApprovalQueue(input: { tenantId: string; orgId: string }) {
    const settings = await this.getSettings({ orgId: input.orgId, tenantId: input.tenantId });
    if (!settings.approvalTeamId) {
      return { items: [], total: 0 };
    }

    const now = new Date();
    const assignments = await this.prisma.assignment.findMany({
      where: {
        tenantId: input.tenantId,
        teamId: settings.approvalTeamId,
        agentId: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        person: {
          organizationId: input.orgId,
          ownerId: null,
          deletedAt: null
        }
      },
      include: {
        person: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            primaryEmail: true,
            primaryPhone: true,
            leadType: true,
            stage: true,
            source: true,
            createdAt: true
          }
        }
      },
      orderBy: { assignedAt: 'desc' },
      take: 100
    });

    const uniqueAssignments: typeof assignments = [];
    const seen = new Set<string>();
    for (const assignment of assignments) {
      if (seen.has(assignment.personId)) continue;
      seen.add(assignment.personId);
      uniqueAssignments.push(assignment);
    }

    const personIds = uniqueAssignments.map((assignment) => assignment.personId);

    const events = personIds.length
      ? await this.prisma.leadRouteEvent.findMany({
          where: {
            tenantId: input.tenantId,
            leadId: { in: personIds }
          },
          orderBy: { createdAt: 'desc' },
          distinct: ['leadId'],
          select: { leadId: true, candidates: true }
        })
      : [];

    const eventByLeadId = new Map(events.map((event) => [event.leadId, event]));

    const items = uniqueAssignments.map((assignment) => {
      const person = assignment.person;
      const leadName = [person.firstName, person.lastName].filter(Boolean).join(' ').trim() || 'Unknown lead';
      const event = eventByLeadId.get(assignment.personId);
      const candidatesRaw = normalizeCandidates((event?.candidates ?? []) as unknown);
      const ranked = candidatesRaw
        .filter((candidate) => (candidate.agentId ?? '').trim())
        .map((candidate) => ({
          agentId: candidate.agentId!.trim(),
          fullName: (candidate.fullName ?? candidate.agentId ?? '').trim(),
          status: (candidate.status ?? '').toUpperCase(),
          score: typeof candidate.score === 'number' ? candidate.score : null,
          reasons: Array.isArray(candidate.reasons) ? candidate.reasons.filter((r) => typeof r === 'string') : []
        }))
        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

      const recommended =
        ranked.find((candidate) => candidate.status === 'SELECTED') ??
        ranked[0] ??
        null;

      return {
        assignmentId: assignment.id,
        personId: assignment.personId,
        assignedAt: assignment.assignedAt.toISOString(),
        lead: {
          id: person.id,
          name: leadName,
          email: person.primaryEmail ?? null,
          phone: person.primaryPhone ?? null,
          leadType: leadTypeLabel(person.leadType),
          stage: String(person.stage ?? ''),
          source: person.source ?? null,
          createdAt: person.createdAt.toISOString()
        },
        recommended: recommended
          ? {
              agentId: recommended.agentId,
              fullName: recommended.fullName,
              score: recommended.score,
              reasons: recommended.reasons.slice(0, 5)
            }
          : null,
        candidates: ranked.slice(0, 5).map((candidate) => ({
          agentId: candidate.agentId,
          fullName: candidate.fullName,
          score: candidate.score,
          reasons: candidate.reasons.slice(0, 5)
        }))
      };
    });

    return { items, total: items.length };
  }

  async approveFromQueue(input: {
    tenantId: string;
    orgId: string;
    assignmentId: string;
    agentId?: string | null;
  }) {
    const settings = await this.getSettings({ orgId: input.orgId, tenantId: input.tenantId });
    if (!settings.approvalTeamId) {
      throw new BadRequestException('Approval pool is not configured for this organization.');
    }

    const assignment = await this.prisma.assignment.findUnique({
      where: { id: input.assignmentId },
      include: {
        person: { select: { id: true, tenantId: true, organizationId: true, ownerId: true } }
      }
    });

    if (!assignment || assignment.tenantId !== input.tenantId || assignment.teamId !== settings.approvalTeamId) {
      throw new NotFoundException('Queue item not found');
    }

    if (assignment.agentId) {
      throw new BadRequestException('Queue item has already been assigned');
    }

    if (assignment.person?.organizationId !== input.orgId) {
      throw new NotFoundException('Queue item not found');
    }

    const now = new Date();
    if (assignment.expiresAt && assignment.expiresAt <= now) {
      throw new BadRequestException('Queue item has expired');
    }

    if (assignment.person?.ownerId) {
      throw new BadRequestException('Lead is already assigned');
    }

    const resolvedAgentId = await this.resolveDecisionAgentId({
      tenantId: input.tenantId,
      leadId: assignment.personId,
      agentId: input.agentId ?? undefined
    });

    const agent = await this.prisma.user.findUnique({
      where: { id: resolvedAgentId },
      select: { id: true, tenantId: true, organizationId: true }
    });
    if (!agent || agent.tenantId !== input.tenantId || agent.organizationId !== input.orgId) {
      throw new BadRequestException('Agent not found in organization');
    }

    const agentProfile = await this.prisma.agentProfile.findUnique({
      where: { organizationId_userId: { organizationId: input.orgId, userId: resolvedAgentId } },
      select: { id: true, teamId: true }
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.assignment.updateMany({
        where: {
          tenantId: input.tenantId,
          personId: assignment.personId,
          teamId: settings.approvalTeamId,
          agentId: null,
          expiresAt: null,
          id: { not: assignment.id }
        },
        data: { expiresAt: now }
      });

      await tx.assignment.update({
        where: { id: assignment.id },
        data: {
          agentId: resolvedAgentId,
          teamId: agentProfile?.teamId ?? null
        }
      });

      await tx.person.update({
        where: { id: assignment.personId },
        data: { ownerId: resolvedAgentId }
      });

      if (agentProfile) {
        await tx.lead.updateMany({
          where: {
            organizationId: input.orgId,
            personId: assignment.personId,
            agentProfileId: null
          },
          data: { agentProfileId: agentProfile.id }
        });
      }
    });

    return { assignmentId: assignment.id, personId: assignment.personId, agentId: resolvedAgentId };
  }

  async rejectFromQueue(input: { tenantId: string; orgId: string; assignmentId: string }) {
    const settings = await this.getSettings({ orgId: input.orgId, tenantId: input.tenantId });
    if (!settings.approvalTeamId) {
      throw new BadRequestException('Approval pool is not configured for this organization.');
    }

    const assignment = await this.prisma.assignment.findUnique({
      where: { id: input.assignmentId },
      include: { person: { select: { organizationId: true } } }
    });
    if (!assignment || assignment.tenantId !== input.tenantId || assignment.teamId !== settings.approvalTeamId) {
      throw new NotFoundException('Queue item not found');
    }
    if (assignment.person?.organizationId !== input.orgId) {
      throw new NotFoundException('Queue item not found');
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.assignment.updateMany({
        where: {
          tenantId: input.tenantId,
          personId: assignment.personId,
          teamId: settings.approvalTeamId,
          agentId: null,
          expiresAt: null,
          id: { not: assignment.id }
        },
        data: { expiresAt: now }
      });

      await tx.assignment.update({
        where: { id: assignment.id },
        data: { expiresAt: now }
      });
    });

    return { assignmentId: assignment.id };
  }

  private async resolveDecisionAgentId(input: { tenantId: string; leadId: string; agentId?: string }) {
    if (input.agentId) {
      return input.agentId;
    }

    const event = await this.prisma.leadRouteEvent.findFirst({
      where: { tenantId: input.tenantId, leadId: input.leadId },
      orderBy: { createdAt: 'desc' },
      select: { candidates: true }
    });

    const candidatesRaw = normalizeCandidates((event?.candidates ?? []) as unknown);
    const normalized = candidatesRaw
      .filter((candidate) => (candidate.agentId ?? '').trim())
      .map((candidate) => ({
        agentId: candidate.agentId!.trim(),
        status: (candidate.status ?? '').toUpperCase(),
        score: typeof candidate.score === 'number' ? candidate.score : -1
      }))
      .sort((a, b) => b.score - a.score);

    const recommended =
      normalized.find((candidate) => candidate.status === 'SELECTED') ??
      normalized[0] ??
      null;

    if (!recommended) {
      throw new BadRequestException('No routing recommendation available for this lead');
    }

    return recommended.agentId;
  }

  private async ensureApprovalPoolTeam(input: { tenantId: string; orgId: string }) {
    const existing = await this.prisma.team.findFirst({
      where: { tenantId: input.tenantId, orgId: input.orgId, name: APPROVAL_TEAM_NAME },
      select: { id: true }
    });
    if (existing) return existing.id;

    const created = await this.prisma.team.create({
      data: {
        tenantId: input.tenantId,
        orgId: input.orgId,
        name: APPROVAL_TEAM_NAME
      },
      select: { id: true }
    });
    return created.id;
  }
}
