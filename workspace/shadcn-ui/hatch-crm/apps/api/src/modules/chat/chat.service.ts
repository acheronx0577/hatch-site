import { Injectable, Logger } from '@nestjs/common'
import { ChatContextType, PlaybookActionType } from '@hatch/db'
import { randomUUID } from 'crypto'
import { PrismaService } from '@/modules/prisma/prisma.service'
import { AiEmployeesService } from '@/modules/ai-employees/ai-employees.service'
import { GlobalSearchService } from '@/modules/search/global-search.service'
import { TimelineService } from '@/modules/timelines/timeline.service'
import { PlaybookRunnerService, type PlaybookActionExecutionResult } from '@/modules/playbooks/playbook-runner.service'

const PLAYBOOK_ACTION_CATALOG: Array<{
  type: PlaybookActionType
  description: string
  required: string[]
  optional?: string[]
  example?: Record<string, unknown>
}> = [
  {
    type: PlaybookActionType.CREATE_TASK,
    description: 'Create a follow-up or remediation task for an agent',
    required: ['agentProfileId', 'title'],
    optional: ['description', 'listingId', 'transactionId']
  },
  {
    type: PlaybookActionType.ASSIGN_LEAD,
    description: 'Assign a lead to an agent and notify them',
    required: ['leadId', 'agentProfileId'],
    optional: ['userId']
  },
  {
    type: PlaybookActionType.SEND_NOTIFICATION,
    description: 'Send an in-app notification to a broker or agent',
    required: ['title'],
    optional: ['message', 'userId']
  },
  {
    type: PlaybookActionType.SEND_EMAIL,
    description: 'Send a quick email update to a user',
    required: ['toUserId', 'subject', 'body']
  },
  {
    type: PlaybookActionType.FLAG_ENTITY,
    description: 'Flag a listing, transaction, or lease for review',
    required: [],
    optional: ['listingId', 'transactionId', 'leaseId']
  },
  {
    type: PlaybookActionType.UPDATE_ENTITY_STATUS,
    description: 'Update a listing/transaction/lease status',
    required: ['entity', 'id', 'status']
  },
  {
    type: PlaybookActionType.START_PLAYBOOK,
    description: 'Kick off another playbook by id',
    required: ['targetPlaybookId']
  },
  {
    type: PlaybookActionType.RUN_AI_PERSONA,
    description: 'Delegate to another AI persona with context',
    required: ['personaId'],
    optional: ['userId']
  }
]

const ACTION_TYPE_LOOKUP = new Map<string, PlaybookActionType>()
for (const action of PLAYBOOK_ACTION_CATALOG) {
  const type = action.type
  ACTION_TYPE_LOOKUP.set(type, type)
  ACTION_TYPE_LOOKUP.set(type.toLowerCase(), type)
  ACTION_TYPE_LOOKUP.set(type.replace(/[_\s-]+/g, '').toLowerCase(), type)
}

type PlannedAction = {
  type: PlaybookActionType
  params?: Record<string, unknown>
  summary?: string
}

type ChatActionMetadata = PlaybookActionExecutionResult & { summary?: string }

type EnsureSessionInput = {
  title?: string
  contextType?: 'GENERAL' | 'LEAD' | 'LISTING' | 'TRANSACTION'
  contextId?: string
  contextSnapshot?: Record<string, unknown>
}

type ContextField = { label: string; value: string }
type ContextDocument = {
  id: string
  name: string
  fileId?: string | null
  documentType?: string | null
  complianceStatus?: string | null
  href?: string | null
}

type ChatContextPanel = {
  title: string
  subtitle?: string | null
  href?: string | null
  fields: ContextField[]
  documents?: ContextDocument[]
}

@Injectable()
export class ChatService {
  private readonly log = new Logger(ChatService.name)
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiEmployees: AiEmployeesService,
    private readonly search: GlobalSearchService,
    private readonly timelines: TimelineService,
    private readonly playbooks: PlaybookRunnerService
  ) {}

  async listSessions(orgId: string, userId: string) {
    return (this.prisma as any).chatSession.findMany({
      where: { organizationId: orgId, userId },
      orderBy: { updatedAt: 'desc' }
    })
  }

  async createSession(orgId: string, userId: string, title?: string) {
    return (this.prisma as any).chatSession.create({
      data: {
        organizationId: orgId,
        userId,
        title: title ?? null,
        contextType: ChatContextType.LEGACY,
        contextKey: `LEGACY:${randomUUID()}`
      }
    })
  }

  async ensureSession(orgId: string, userId: string, input: EnsureSessionInput) {
    const contextType = this.normalizeContextType(input.contextType)
    const contextId = input.contextId?.trim() ? input.contextId.trim() : undefined
    const contextKey = this.buildContextKey(contextType, contextId)
    const title = input.title?.trim() ? input.title.trim() : this.defaultTitleForContext(contextType)

    const update: Record<string, unknown> = {
      contextType,
      contextId: contextId ?? null
    }
    if (title !== undefined) update.title = title
    if (input.contextSnapshot !== undefined) update.contextSnapshot = input.contextSnapshot as any

    return (this.prisma as any).chatSession.upsert({
      where: { organizationId_userId_contextKey: { organizationId: orgId, userId, contextKey } },
      update,
      create: {
        organizationId: orgId,
        userId,
        title: title ?? null,
        contextType,
        contextId: contextId ?? null,
        contextKey,
        contextSnapshot: (input.contextSnapshot as any) ?? undefined
      }
    })
  }

  async getMessages(sessionId: string, orgId: string, userId: string) {
    await this.assertSession(sessionId, orgId, userId)
    return (this.prisma as any).chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' }
    })
  }

  async getSessionContext(sessionId: string, orgId: string, userId: string) {
    const session = await this.assertSession(sessionId, orgId, userId)
    const panel = await this.buildContextPanel(orgId, session)
    return {
      sessionId: session.id,
      title: session.title ?? null,
      contextType: session.contextType,
      contextId: session.contextId ?? null,
      contextKey: session.contextKey,
      panel,
      contextSnapshot: (session.contextSnapshot as any) ?? null
    }
  }

  async sendMessage(orgId: string, userId: string, sessionId: string, content: string) {
    const session = await this.assertSession(sessionId, orgId, userId)
    await (this.prisma as any).chatMessage.create({
      data: { sessionId, role: 'user', content }
    })

    const activeContext = await this.buildContextPanel(orgId, session)
    const context = await this.buildContext(orgId, userId, content, activeContext)
    const ai = await this.aiEmployees.runPersona('hatchAssistant' as any, {
      organizationId: orgId,
      userId,
      input: { content, context, availableActions: context.availableActions }
    })
    const reply =
      ai?.rawText ??
      (ai as any)?.aiResponse?.message ??
      (ai as any)?.structured?.message ??
      'I do not have enough context to answer right now.'

    const plannedActions = this.extractActions(ai)
    const actionPayload = this.buildActionPayload(content, context)
    let actionResults: PlaybookActionExecutionResult[] = []
    if (plannedActions.length > 0) {
      try {
        actionResults = await this.playbooks.runActions(orgId, plannedActions, actionPayload)
      } catch (error) {
        actionResults = plannedActions.map((action) => ({
          type: action.type,
          params: action.params,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Action execution failed'
        }))
      }
    }

    const actionsForMetadata = this.mergeActionResults(plannedActions, actionResults)

    await (this.prisma as any).chatMessage.create({
      data: {
        sessionId,
        role: 'assistant',
        content: reply,
        metadata: { ...(context ?? {}), actions: actionsForMetadata, actionContext: actionPayload }
      }
    })

    // bump updatedAt
    await (this.prisma as any).chatSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() }
    })

    return this.getMessages(sessionId, orgId, userId)
  }

  private async assertSession(sessionId: string, orgId: string, userId: string) {
    const session = await (this.prisma as any).chatSession.findFirst({
      where: { id: sessionId, organizationId: orgId, userId }
    })
    if (!session) {
      throw new Error('Session not found or unauthorized')
    }
    return session
  }

  private async buildContext(orgId: string, userId: string, content: string, activeContext?: ChatContextPanel | null) {
    const availableActions = this.describePlaybookActions()
    let tcInsights: Record<string, unknown> | null = null
    let nurtureDraft: Record<string, unknown> | null = null
    try {
      // simple heuristic: run global search and pick top hits
      const searchResults = await this.search.search(orgId, { q: content })
      const allResults = searchResults?.results ?? []
      const top = allResults.slice(0, 5)
      const legalFormsContext = allResults
        .filter((item) => item.type === 'knowledge_doc')
        .slice(0, 5)
        .map((item) => ({
          id: item.id,
          title: item.title,
          snippet: (item.metadata as any)?.content ?? item.subtitle ?? '',
          route: item.route
        }))
      const timelines = []
      for (const item of top) {
        if (item.type && item.id) {
          if (['listing', 'lead', 'transaction', 'rental'].includes(item.type)) {
            const tl = await this.timelines.getTimeline(orgId, item.type as any, item.id)
            timelines.push({ entityType: item.type, entityId: item.id, timeline: tl.timeline })
          }
        }
      }
      const transactionCandidate = top.find((item) => item.type === 'transaction')
      if (transactionCandidate?.id) {
        tcInsights = await this.runTransactionCoordinator(orgId, userId, transactionCandidate.id)
      }
      const leadCandidate = top.find((item) => item.type === 'lead')
      if (leadCandidate?.id && this.isFollowUpIntent(content)) {
        nurtureDraft = await this.runLeadNurtureWriter(orgId, userId, leadCandidate.id)
      }
      if (legalFormsContext.length > 0) {
        this.log.log(
          `legalFormsContext hits (${legalFormsContext.length}): ${legalFormsContext
            .map((hit) => hit.title)
            .join(', ')}`
        )
      }
      return { activeContext: activeContext ?? null, topResults: top, timelines, availableActions, tcInsights, nurtureDraft, legalFormsContext }
    } catch (err) {
      return { activeContext: activeContext ?? null, availableActions, tcInsights, nurtureDraft }
    }
  }

  private normalizeContextType(value?: string): ChatContextType {
    const candidate = value?.trim().toUpperCase()
    switch (candidate) {
      case 'LEAD':
        return ChatContextType.LEAD
      case 'LISTING':
        return ChatContextType.LISTING
      case 'TRANSACTION':
        return ChatContextType.TRANSACTION
      case 'GENERAL':
        return ChatContextType.GENERAL
      default:
        return ChatContextType.GENERAL
    }
  }

  private buildContextKey(contextType: ChatContextType, contextId?: string) {
    switch (contextType) {
      case ChatContextType.GENERAL:
        return 'GENERAL'
      case ChatContextType.LEAD: {
        if (!contextId) throw new Error('contextId is required for lead chat sessions')
        return `LEAD:${contextId}`
      }
      case ChatContextType.LISTING: {
        if (!contextId) throw new Error('contextId is required for listing chat sessions')
        return `LISTING:${contextId}`
      }
      case ChatContextType.TRANSACTION: {
        if (!contextId) throw new Error('contextId is required for transaction chat sessions')
        return `TRANSACTION:${contextId}`
      }
      default:
        return `LEGACY:${randomUUID()}`
    }
  }

  private defaultTitleForContext(contextType: ChatContextType) {
    switch (contextType) {
      case ChatContextType.TRANSACTION:
        return 'Transaction'
      case ChatContextType.LISTING:
        return 'Listing'
      case ChatContextType.LEAD:
        return 'Lead'
      case ChatContextType.GENERAL:
        return 'General'
      default:
        return 'Chat'
    }
  }

  private async buildContextPanel(orgId: string, session: any): Promise<ChatContextPanel | null> {
    const contextType: ChatContextType = session.contextType ?? ChatContextType.GENERAL
    const contextId: string | null = session.contextId ?? null
    const snapshot = (session.contextSnapshot as any) as ChatContextPanel | null | undefined

    if (contextType === ChatContextType.GENERAL) {
      return {
        title: 'General context',
        subtitle: 'Ask anything about your brokerage. Open Ask Hatch from a listing/transaction/lead to anchor the context.',
        href: null,
        fields: []
      }
    }

    if (contextType === ChatContextType.TRANSACTION && contextId) {
      const txn = await this.prisma.orgTransaction.findFirst({
        where: { id: contextId, organizationId: orgId },
        include: {
          listing: { select: { id: true, addressLine1: true, city: true, state: true, postalCode: true, listPrice: true } },
          agentProfile: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
          documents: {
            include: {
              orgFile: { select: { id: true, name: true, fileId: true, documentType: true, complianceStatus: true } }
            }
          }
        }
      })

      if (!txn) {
        return snapshot ?? {
          title: 'Transaction',
          subtitle: `Transaction ${contextId}`,
          href: `/broker/transactions?focus=${contextId}`,
          fields: []
        }
      }

      const address = txn.listing?.addressLine1
        ? `${txn.listing.addressLine1}${txn.listing.city ? `, ${txn.listing.city}` : ''}`
        : `Transaction ${txn.id}`

      const docs = (txn.documents ?? [])
        .map((doc) => doc.orgFile)
        .filter(Boolean)
        .slice(0, 8)
        .map<ContextDocument>((file) => ({
          id: file.id,
          name: file.name,
          fileId: file.fileId,
          documentType: file.documentType ?? null,
          complianceStatus: file.complianceStatus ?? null,
          href: `/broker/documents/${file.id}`
        }))

      const agent = txn.agentProfile?.user
        ? `${txn.agentProfile.user.firstName ?? ''} ${txn.agentProfile.user.lastName ?? ''}`.trim() || txn.agentProfile.user.email
        : null

      const fields: ContextField[] = [
        { label: 'Status', value: String(txn.status) },
        { label: 'Closing date', value: txn.closingDate ? new Date(txn.closingDate).toLocaleDateString() : '—' },
        { label: 'Buyer', value: txn.buyerName ?? '—' },
        { label: 'Seller', value: txn.sellerName ?? '—' }
      ]
      if (agent) fields.push({ label: 'Agent', value: agent })

      const compliance = txn.requiresAction || txn.isCompliant === false ? 'Needs attention' : 'OK'
      fields.push({ label: 'Compliance', value: compliance })

      return {
        title: address,
        subtitle: txn.listing?.listPrice ? `$${Number(txn.listing.listPrice).toLocaleString()} list` : null,
        href: `/broker/transactions?focus=${txn.id}`,
        fields,
        documents: docs
      }
    }

    if (contextType === ChatContextType.LISTING && contextId) {
      const listing = await this.prisma.orgListing.findFirst({
        where: { id: contextId, organizationId: orgId },
        include: {
          agentProfile: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
          documents: {
            include: {
              orgFile: { select: { id: true, name: true, fileId: true, documentType: true, complianceStatus: true } }
            }
          }
        }
      })

      if (!listing) {
        return snapshot ?? {
          title: 'Listing',
          subtitle: `Listing ${contextId}`,
          href: `/broker/properties/${contextId}`,
          fields: []
        }
      }

      const agent = listing.agentProfile?.user
        ? `${listing.agentProfile.user.firstName ?? ''} ${listing.agentProfile.user.lastName ?? ''}`.trim() ||
          listing.agentProfile.user.email
        : null

      const docs = (listing.documents ?? [])
        .map((doc) => doc.orgFile)
        .filter(Boolean)
        .slice(0, 8)
        .map<ContextDocument>((file) => ({
          id: file.id,
          name: file.name,
          fileId: file.fileId,
          documentType: file.documentType ?? null,
          complianceStatus: file.complianceStatus ?? null,
          href: `/broker/documents/${file.id}`
        }))

      const fields: ContextField[] = [
        { label: 'Status', value: String(listing.status) },
        { label: 'Price', value: listing.listPrice ? `$${Number(listing.listPrice).toLocaleString()}` : '—' }
      ]
      if (agent) fields.push({ label: 'Agent', value: agent })

      return {
        title: listing.addressLine1,
        subtitle: `${listing.city}, ${listing.state} ${listing.postalCode}`.trim(),
        href: `/broker/properties/${listing.id}`,
        fields,
        documents: docs
      }
    }

    if (contextType === ChatContextType.LEAD && contextId) {
      const person = await this.prisma.person.findFirst({
        where: { id: contextId, organizationId: orgId, deletedAt: null },
        include: { owner: { select: { firstName: true, lastName: true, email: true } } }
      })

      if (!person) {
        return snapshot ?? {
          title: 'Lead',
          subtitle: `Lead ${contextId}`,
          href: `/broker/crm/leads/${contextId}`,
          fields: []
        }
      }

      const owner = person.owner
        ? `${person.owner.firstName ?? ''} ${person.owner.lastName ?? ''}`.trim() || person.owner.email
        : null

      const fields: ContextField[] = [
        { label: 'Stage', value: String(person.stage) },
        { label: 'Lead type', value: String(person.leadType) },
        { label: 'Email', value: person.primaryEmail ?? '—' },
        { label: 'Phone', value: person.primaryPhone ?? '—' }
      ]
      if (owner) fields.push({ label: 'Owner', value: owner })

      return {
        title: `${person.firstName} ${person.lastName}`.trim() || 'Lead',
        subtitle: person.primaryEmail ?? null,
        href: `/broker/crm/leads/${person.id}`,
        fields
      }
    }

    return snapshot ?? null
  }

  private async runTransactionCoordinator(orgId: string, userId: string, transactionId: string) {
    try {
      const result = await this.aiEmployees.runPersona('transactionCoordinator', {
        organizationId: orgId,
        userId,
        transactionId,
        input: { reason: 'chat_context' }
      })
      return {
        transactionId,
        summary: result?.structured?.summary ?? null,
        actions: result?.actions ?? result?.structured?.actions ?? [],
        raw: result?.rawText ?? null
      }
    } catch {
      return null
    }
  }

  private async runLeadNurtureWriter(orgId: string, userId: string, leadId: string) {
    try {
      const result = await this.aiEmployees.runPersona('leadNurtureWriter', {
        organizationId: orgId,
        userId,
        leadId,
        input: { reason: 'chat_follow_up' }
      })
      return {
        leadId,
        draft: result?.structured ?? null,
        actions: result?.actions ?? result?.structured?.actions ?? [],
        raw: result?.rawText ?? null
      }
    } catch {
      return null
    }
  }

  private isFollowUpIntent(text: string) {
    const normalized = text.toLowerCase()
    return ['follow up', 'follow-up', 'email', 'reply', 'message lead'].some((term) => normalized.includes(term))
  }

  private extractActions(aiResult: any): PlannedAction[] {
    const rawActions =
      Array.isArray(aiResult?.actions) && aiResult.actions.length > 0
        ? aiResult.actions
        : Array.isArray(aiResult?.structured?.actions)
          ? aiResult.structured.actions
          : []

    return rawActions
      .map((entry: any) => {
        const normalizedType = this.normalizeActionType(entry?.type ?? entry?.actionType ?? entry?.tool)
        if (!normalizedType) return null
        const params = entry?.params && typeof entry.params === 'object' ? entry.params : {}
        const summary = typeof entry?.summary === 'string' ? entry.summary : undefined
        return { type: normalizedType, params, summary }
      })
      .filter(Boolean) as PlannedAction[]
  }

  private mergeActionResults(planned: PlannedAction[], results: PlaybookActionExecutionResult[]): ChatActionMetadata[] {
    if (!planned.length && !results.length) return []
    return planned.map((action, idx) => {
      const result = results[idx]
      return {
        type: action.type,
        params: action.params,
        summary: action.summary,
        status: result?.status ?? 'executed',
        error: result?.error
      }
    })
  }

  private buildActionPayload(content: string, context: Record<string, unknown>) {
    const payload: Record<string, unknown> = { prompt: content }
    const topResults = Array.isArray((context as any)?.topResults) ? (context as any).topResults : []
    const findFirst = (type: string) => topResults.find((item) => item?.type === type)
    const lead = findFirst('lead')
    const listing = findFirst('listing')
    const transaction = findFirst('transaction')
    const rental = findFirst('rental')

    if (lead?.id) payload.leadId = lead.id
    if (listing?.id) payload.listingId = listing.id
    if (transaction?.id) payload.transactionId = transaction.id
    if (rental?.id) payload.leaseId = rental.id

    return payload
  }

  private describePlaybookActions() {
    return PLAYBOOK_ACTION_CATALOG.map((action) => {
      const entry: Record<string, unknown> = {
        type: action.type,
        description: action.description,
        required: action.required,
        optional: action.optional ?? []
      }
      if (action.example) {
        entry.example = action.example
      }
      return entry
    })
  }

  private normalizeActionType(value: unknown): PlaybookActionType | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    if (!trimmed) return null
    const candidates = [
      trimmed,
      trimmed.toLowerCase(),
      trimmed.replace(/[_\s-]+/g, '').toLowerCase()
    ]
    for (const candidate of candidates) {
      const resolved = ACTION_TYPE_LOOKUP.get(candidate)
      if (resolved) return resolved
    }
    return null
  }
}
