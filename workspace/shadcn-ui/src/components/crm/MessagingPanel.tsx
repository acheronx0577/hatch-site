import { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Loader2, Mail, MessageSquare, Send, Copy, AlertTriangle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import {
  approveAiPendingAction,
  generateFollowUpEmail,
  generateFollowUpText,
  getLead,
  sendApprovedFollowUp,
  type FollowUpType,
  type LeadDetail,
  type LeadSummary
} from '@/lib/api/hatch'

export type MessagingPanelMessageType = 'email' | 'text'

type DraftState = { subject: string; body: string; pendingActionId: string | null; requiresApproval: boolean } | null

const FOLLOW_UP_ACTIONS: Array<{ key: FollowUpType; label: string }> = [
  { key: 'after_showing', label: 'After showing' },
  { key: 'just_checking_in', label: 'Check in' },
  { key: 'new_listing_match', label: 'New listing' },
  { key: 'cold_lead_reengagement', label: 'Re-engage' }
]

const formatMoney = (value?: number | null) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
  } catch {
    return `$${value}`
  }
}

export default function MessagingPanel({
  open,
  onOpenChange,
  leadId,
  lead,
  messageType,
  onMessageTypeChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  leadId: string
  lead: LeadSummary | null
  messageType: MessagingPanelMessageType
  onMessageTypeChange: (value: MessagingPanelMessageType) => void
}) {
  const { toast } = useToast()
  const [isGenerating, setIsGenerating] = useState(false)
  const [draft, setDraft] = useState<DraftState>(null)
  const [status, setStatus] = useState<string | null>(null)

  const { data: leadDetail, isLoading: leadLoading } = useQuery({
    queryKey: ['lead', leadId],
    queryFn: () => getLead(leadId),
    enabled: open && Boolean(leadId)
  })

  useEffect(() => {
    if (!open) {
      setIsGenerating(false)
      setDraft(null)
      setStatus(null)
    }
  }, [open])

  const effectiveLead: LeadSummary | LeadDetail | null = leadDetail ?? lead

  const leadName = useMemo(() => {
    const first = effectiveLead?.firstName ?? ''
    const last = effectiveLead?.lastName ?? ''
    const combined = `${first} ${last}`.trim()
    return combined || effectiveLead?.email || effectiveLead?.phone || 'Lead'
  }, [effectiveLead?.email, effectiveLead?.firstName, effectiveLead?.lastName, effectiveLead?.phone])

  const leadContext = useMemo(() => {
    if (!effectiveLead) return null
    const stage = effectiveLead.stage?.name ?? null
    const lastActivityAt = effectiveLead.lastActivityAt ?? effectiveLead.activityRollup?.lastTouchpointAt ?? null
    const fit = 'fit' in effectiveLead ? effectiveLead.fit : null
    const budgetMin = fit?.budgetMin ?? effectiveLead.budgetMin ?? null
    const budgetMax = fit?.budgetMax ?? effectiveLead.budgetMax ?? null
    const geo = fit?.geo ?? null
    const preapproved = fit?.preapproved ?? effectiveLead.preapproved ?? null
    return {
      stage,
      lastActivityAt,
      budgetMin,
      budgetMax,
      geo,
      preapproved
    }
  }, [effectiveLead])

  const generateDraft = async (followUpType: FollowUpType) => {
    setIsGenerating(true)
    setStatus(null)
    try {
      if (messageType === 'email') {
        const result = await generateFollowUpEmail({ leadId, followUpType })
        setDraft({
          subject: result.subject ?? '',
          body: result.body ?? '',
          pendingActionId: result.pendingActionId,
          requiresApproval: result.requiresApproval
        })
        setStatus(result.requiresApproval ? 'Draft created (requires approval before sending).' : 'Draft created.')
      } else {
        const result = await generateFollowUpText({ leadId, followUpType })
        setDraft({
          subject: '',
          body: result.text ?? '',
          pendingActionId: result.pendingActionId,
          requiresApproval: result.requiresApproval
        })
        setStatus(result.requiresApproval ? 'Draft created (requires approval before sending).' : 'Draft created.')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate draft'
      setStatus(message)
      toast({ title: 'Draft failed', description: message, variant: 'destructive' })
    } finally {
      setIsGenerating(false)
    }
  }

  const copyDraft = async () => {
    if (!draft) return
    const content = messageType === 'email' ? `Subject: ${draft.subject}\n\n${draft.body}` : draft.body
    try {
      await navigator.clipboard.writeText(content)
      toast({ title: 'Copied', description: 'Draft copied to clipboard.' })
    } catch (err) {
      toast({ title: 'Copy failed', description: err instanceof Error ? err.message : 'Clipboard unavailable', variant: 'destructive' })
    }
  }

  const approveAndSend = async () => {
    if (!draft?.pendingActionId) {
      toast({ title: 'Nothing to send', description: 'Generate a draft first.', variant: 'destructive' })
      return
    }
    setStatus('Approving and sending…')
    try {
      await approveAiPendingAction(draft.pendingActionId)
      const result = await sendApprovedFollowUp(draft.pendingActionId)
      toast({ title: 'Sent', description: `Message queued (id: ${result.messageId})` })
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Send failed'
      setStatus(message)
      toast({ title: 'Send failed', description: message, variant: 'destructive' })
    }
  }

  const isReadyToSend = Boolean(draft?.body?.trim()) && (!draft?.requiresApproval || Boolean(draft?.pendingActionId))

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-4 bg-background p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-slate-200 px-6 py-5 text-left">
          <SheetTitle className="text-xl">Message {leadName}</SheetTitle>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {leadLoading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading lead context…
              </span>
            ) : leadContext ? (
              <>
                {leadContext.stage ? <Badge variant="secondary">{leadContext.stage}</Badge> : null}
                {typeof leadContext.preapproved === 'boolean' ? (
                  <Badge variant={leadContext.preapproved ? 'default' : 'outline'}>
                    {leadContext.preapproved ? 'Pre-approved' : 'Not pre-approved'}
                  </Badge>
                ) : null}
                {leadContext.lastActivityAt ? (
                  <span>Last touch {formatDistanceToNow(new Date(leadContext.lastActivityAt), { addSuffix: true })}</span>
                ) : (
                  <span>No recent touch recorded</span>
                )}
              </>
            ) : (
              <span className="inline-flex items-center gap-2 text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                Lead context unavailable
              </span>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-auto px-6 py-5">
          <Tabs value={messageType} onValueChange={(value) => onMessageTypeChange(value as MessagingPanelMessageType)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="email">
                <Mail className="mr-2 h-4 w-4" /> Email
              </TabsTrigger>
              <TabsTrigger value="text">
                <MessageSquare className="mr-2 h-4 w-4" /> Text
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Quick draft with AI</p>
            <div className="flex flex-wrap gap-2">
              {FOLLOW_UP_ACTIONS.map((action) => (
                <Button
                  key={action.key}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void generateDraft(action.key)}
                  disabled={isGenerating}
                >
                  {action.label}
                </Button>
              ))}
            </div>
            {isGenerating ? (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <Loader2 className="h-4 w-4 animate-spin" /> Generating…
              </div>
            ) : null}
            {status ? <p className="text-xs text-slate-500">{status}</p> : null}
          </div>

          {messageType === 'email' ? (
            <div className="space-y-3">
              <div>
                <Label htmlFor="message-subject">Subject</Label>
                <Input
                  id="message-subject"
                  value={draft?.subject ?? ''}
                  onChange={(event) => setDraft((prev) => ({ ...(prev ?? { subject: '', body: '', pendingActionId: null, requiresApproval: false }), subject: event.target.value }))}
                  placeholder="Email subject…"
                />
              </div>
              <div>
                <Label htmlFor="message-body">Message</Label>
                <Textarea
                  id="message-body"
                  value={draft?.body ?? ''}
                  onChange={(event) => setDraft((prev) => ({ ...(prev ?? { subject: '', body: '', pendingActionId: null, requiresApproval: false }), body: event.target.value }))}
                  rows={10}
                  placeholder="Email body…"
                />
              </div>
            </div>
          ) : (
            <div>
              <Label htmlFor="message-text-body">Message</Label>
              <Textarea
                id="message-text-body"
                value={draft?.body ?? ''}
                onChange={(event) => setDraft((prev) => ({ ...(prev ?? { subject: '', body: '', pendingActionId: null, requiresApproval: false }), body: event.target.value }))}
                rows={5}
                maxLength={300}
                placeholder="Text message…"
              />
              <p className="mt-1 text-xs text-slate-500">{(draft?.body ?? '').length}/300 characters</p>
            </div>
          )}

          {leadContext ? (
            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Lead context</p>
              <ul className="space-y-1 text-xs text-slate-600">
                {leadContext.stage ? <li>Stage: {leadContext.stage}</li> : null}
                {leadContext.geo ? <li>Area: {leadContext.geo}</li> : null}
                {leadContext.budgetMin || leadContext.budgetMax ? (
                  <li>
                    Budget:{' '}
                    {[
                      formatMoney(leadContext.budgetMin) ?? '—',
                      formatMoney(leadContext.budgetMax) ?? '—'
                    ].join(' - ')}
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-6 py-4">
          <Button type="button" variant="outline" onClick={() => void copyDraft()} disabled={!draft?.body?.trim()}>
            <Copy className="mr-2 h-4 w-4" /> Copy
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void approveAndSend()} disabled={!isReadyToSend}>
              <Send className="mr-2 h-4 w-4" /> Send
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

