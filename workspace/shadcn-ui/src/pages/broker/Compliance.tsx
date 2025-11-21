import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, formatDistanceToNow, subDays } from 'date-fns'
import { Download, RefreshCcw } from 'lucide-react'
import { motion } from 'framer-motion'
import { usePageAnimations } from '@/hooks/usePageAnimations'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ComplianceAgreementsResponse,
  ComplianceConsentsResponse,
  ComplianceDisclaimersResponse,
  ComplianceListingsResponse,
  ComplianceOverride,
  ComplianceStatusResponse,
  createComplianceOverride,
  exportComplianceStatus,
  getComplianceAgreements,
  getComplianceConsents,
  getComplianceDisclaimers,
  getComplianceListings,
  getComplianceOverrides,
  getComplianceStatus
} from '@/lib/api/hatch'

const TENANT_ID = import.meta.env.VITE_TENANT_ID || 'tenant-hatch'

type FiltersState = {
  start: string
  end: string
  agents: string
  teams: string
  mls: string
}

const formatPercent = (value: number) =>
  new Intl.NumberFormat(undefined, { style: 'percent', minimumFractionDigits: 1 }).format(
    Number.isFinite(value) ? value : 0
  )

const formatNumber = (value: number) => new Intl.NumberFormat().format(value)

const parseCsv = (value: string) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

export default function ComplianceCenter() {
  const { pageVariants, buttonHoverVariant, getInitialState } = usePageAnimations()
  const initialRangeEnd = new Date()
  const initialRangeStart = subDays(initialRangeEnd, 30)

  const [filters, setFilters] = useState<FiltersState>({
    start: format(initialRangeStart, 'yyyy-MM-dd'),
    end: format(initialRangeEnd, 'yyyy-MM-dd'),
    agents: '',
    teams: '',
    mls: ''
  })

  const [status, setStatus] = useState<ComplianceStatusResponse | null>(null)
  const [agreements, setAgreements] = useState<ComplianceAgreementsResponse | null>(null)
  const [consents, setConsents] = useState<ComplianceConsentsResponse | null>(null)
  const [listings, setListings] = useState<ComplianceListingsResponse | null>(null)
  const [disclaimers, setDisclaimers] = useState<ComplianceDisclaimersResponse | null>(null)
  const [overrides, setOverrides] = useState<ComplianceOverride[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const buildOptions = useCallback(
    () => ({
      start: filters.start,
      end: filters.end,
      agentIds: parseCsv(filters.agents),
      teamIds: parseCsv(filters.teams),
      mlsIds: parseCsv(filters.mls)
    }),
    [filters]
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const options = buildOptions()
      const [statusRes, agreementsRes, consentsRes, listingsRes, disclaimersRes, overridesRes] =
        await Promise.all([
          getComplianceStatus(TENANT_ID, options),
          getComplianceAgreements(TENANT_ID, options),
          getComplianceConsents(TENANT_ID, options),
          getComplianceListings(TENANT_ID, options),
          getComplianceDisclaimers(TENANT_ID, options),
          getComplianceOverrides(TENANT_ID)
        ])

      setStatus(statusRes)
      setAgreements(agreementsRes)
      setConsents(consentsRes)
      setListings(listingsRes)
      setDisclaimers(disclaimersRes)
      setOverrides(overridesRes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load compliance data')
    } finally {
      setLoading(false)
    }
  }, [buildOptions])

  useEffect(() => {
    void load()
  }, [load])

  const rangeLabel = useMemo(() => {
    if (!status) return ''
    const start = new Date(status.range.start)
    const end = new Date(status.range.end)
    return `${format(start, 'MMM d, yyyy')} — ${format(end, 'MMM d, yyyy')}`
  }, [status])

  const handleExport = async () => {
    try {
      setExporting(true)
      const blob = await exportComplianceStatus(TENANT_ID, buildOptions())
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `compliance-status-${filters.start}-to-${filters.end}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export compliance snapshot')
    } finally {
      setExporting(false)
    }
  }

  const handleOverrideQuietHours = async () => {
    try {
      await createComplianceOverride({
        tenantId: TENANT_ID,
        context: 'quiet_hours',
        reasonText: 'Manual override from Compliance Center'
      })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log override')
    }
  }

  if (loading && !status) {
    return (
      <div className="p-6 space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32 mt-2" />
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-24 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error && !status) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Compliance Center</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-red-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!status) {
    return null
  }

  const consentSummary = consents?.summary ?? status.metrics.consentHealth

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Compliance Center</h1>
          <p className="text-sm text-slate-600">Answer “Are we safe?” in one view.</p>
          <p className="text-xs text-slate-500">{rangeLabel}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCcw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            <Button size="sm" onClick={handleExport} disabled={exporting}>
              <Download className="mr-2 h-4 w-4" /> Export PDF
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <CardTitle className="text-base font-semibold text-slate-800">Filters</CardTitle>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <div>
              <label className="text-xs text-slate-500">Start date</label>
              <Input
                type="date"
                value={filters.start}
                onChange={(event) => setFilters((prev) => ({ ...prev, start: event.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">End date</label>
              <Input
                type="date"
                value={filters.end}
                onChange={(event) => setFilters((prev) => ({ ...prev, end: event.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Agent IDs (comma separated)</label>
              <Input
                value={filters.agents}
                onChange={(event) => setFilters((prev) => ({ ...prev, agents: event.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Team IDs</label>
              <Input
                value={filters.teams}
                onChange={(event) => setFilters((prev) => ({ ...prev, teams: event.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">MLS Profiles</label>
              <Input
                value={filters.mls}
                onChange={(event) => setFilters((prev) => ({ ...prev, mls: event.target.value }))}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button onClick={load} disabled={loading}>
            Apply Filters
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Buyer-rep coverage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold text-slate-900">
                {formatPercent(status.metrics.buyerRepCoverage.percentage)}
              </span>
              <span className="text-sm text-slate-500">
                {formatNumber(status.metrics.buyerRepCoverage.numerator)} of{' '}
                {formatNumber(status.metrics.buyerRepCoverage.denominator)} kept tours
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Consent health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-700">SMS</span>
              <Badge variant={consentSummary.sms.health >= 0.8 ? 'secondary' : 'outline'}>
                {formatPercent(consentSummary.sms.health)}
              </Badge>
            </div>
            <div className="grid grid-cols-3 text-xs text-slate-500">
              <span>Granted</span>
              <span>Revoked</span>
              <span>Unknown</span>
            </div>
            <div className="grid grid-cols-3 text-xs font-medium text-slate-600">
              <span>{formatNumber(consentSummary.sms.granted)}</span>
              <span>{formatNumber(consentSummary.sms.revoked)}</span>
              <span>{formatNumber(consentSummary.sms.unknown)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-700">Email</span>
              <Badge variant={consentSummary.email.health >= 0.8 ? 'secondary' : 'outline'}>
                {formatPercent(consentSummary.email.health)}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Clear Cooperation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-700">Active timers</span>
              <span className="text-lg font-semibold text-slate-900">
                {formatNumber(status.metrics.clearCooperation.total)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-amber-600">
              <span>Yellow (24h)</span>
              <span>{formatNumber(status.metrics.clearCooperation.yellow)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-rose-600">
              <span>Red (overdue)</span>
              <span>{formatNumber(status.metrics.clearCooperation.red)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Due within 24h</span>
              <span>{formatNumber(status.metrics.clearCooperation.dueSoon)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">IDX compliance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-700">Failures (7d)</span>
              <span className="text-lg font-semibold text-slate-900">
                {formatNumber(status.metrics.idxCompliance.failuresLast7Days)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Total checks</span>
              <span>{formatNumber(status.metrics.idxCompliance.totalChecksLast7Days)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Messaging readiness</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span>10DLC brand & campaigns</span>
              <Badge variant={status.metrics.messagingReadiness.tenDlcApproved ? 'secondary' : 'destructive'}>
                {status.metrics.messagingReadiness.tenDlcApproved ? 'Approved' : 'Action required'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>DMARC alignment</span>
              <Badge variant={status.metrics.messagingReadiness.dmarcAligned ? 'secondary' : 'destructive'}>
                {status.metrics.messagingReadiness.dmarcAligned ? 'Aligned' : 'Review needed'}
              </Badge>
            </div>
            <div className="text-xs text-slate-500">
              Last override:{' '}
              {status.metrics.messagingReadiness.lastOverride
                ? formatDistanceToNow(new Date(status.metrics.messagingReadiness.lastOverride.occurredAt), {
                    addSuffix: true
                  })
                : '—'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Quiet hours</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {status.quietHours ? (
              <>
                <div className="flex items-center justify-between">
                  <span>Window</span>
                  <span>
                    {status.quietHours.startHour}:00 → {status.quietHours.endHour}:00 ({status.quietHours.timezone})
                  </span>
                </div>
                <Button size="sm" variant="outline" onClick={handleOverrideQuietHours}>
                  Log quiet-hours override
                </Button>
              </>
            ) : (
              <span className="text-slate-500">Quiet hours not configured.</span>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-800">Buyer-rep exceptions</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {!agreements ? (
            <Skeleton className="h-40 w-full" />
          ) : agreements.rows.length === 0 ? (
            <p className="text-sm text-slate-500">No kept tours in this window.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-2">Tour</th>
                  <th className="px-4 py-2">Contact</th>
                  <th className="px-4 py-2">Agent</th>
                  <th className="px-4 py-2">Listing</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Agreement</th>
                </tr>
              </thead>
              <tbody>
                {agreements.rows.map((row) => (
                  <tr key={row.tourId} className="border-b border-slate-100">
                    <td className="px-4 py-2">
                      {format(new Date(row.startAt), 'MMM d, yyyy p')}
                    </td>
                    <td className="px-4 py-2">{row.person.name}</td>
                    <td className="px-4 py-2">{row.agent?.name ?? 'Unassigned'}</td>
                    <td className="px-4 py-2">{row.listing?.address ?? '—'}</td>
                    <td className="px-4 py-2">
                      <Badge
                        variant={
                          row.status === 'MISSING'
                            ? 'destructive'
                            : row.status === 'EXPIRED'
                              ? 'outline'
                              : 'secondary'
                        }
                      >
                        {row.status.toLowerCase()}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {row.agreement
                        ? `${row.agreement.id.slice(0, 8)} • eff ${row.agreement.effectiveDate ? format(new Date(row.agreement.effectiveDate), 'MM/dd/yy') : '—'} • exp ${row.agreement.expiryDate ? format(new Date(row.agreement.expiryDate), 'MM/dd/yy') : '—'}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-800">Consent revocations</CardTitle>
        </CardHeader>
        <CardContent>
          {!consents ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div>
                  SMS health:{' '}
                  <Badge variant={consentSummary.sms.health >= 0.8 ? 'secondary' : 'destructive'}>
                    {formatPercent(consentSummary.sms.health)}
                  </Badge>
                </div>
                <div>
                  Email health:{' '}
                  <Badge variant={consentSummary.email.health >= 0.8 ? 'secondary' : 'destructive'}>
                    {formatPercent(consentSummary.email.health)}
                  </Badge>
                </div>
                <div>
                  Opt-out spike:{' '}
                  <Badge variant={consents.anomalies.optOutSpike.detected ? 'destructive' : 'secondary'}>
                    {consents.anomalies.optOutSpike.detected ? 'Alert' : 'Normal'}
                  </Badge>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-4 py-2">Contact</th>
                      <th className="px-4 py-2">Channel</th>
                      <th className="px-4 py-2">Scope</th>
                      <th className="px-4 py-2">Revoked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consents.recentRevocations.map((record) => (
                      <tr key={record.id} className="border-b border-slate-100">
                        <td className="px-4 py-2">{record.person.name}</td>
                        <td className="px-4 py-2">{record.channel}</td>
                        <td className="px-4 py-2">{record.scope}</td>
                        <td className="px-4 py-2 text-xs text-slate-500">
                          {record.revokedAt ? formatDistanceToNow(new Date(record.revokedAt), { addSuffix: true }) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {consents.recentRevocations.length === 0 ? (
                  <p className="px-4 py-2 text-sm text-slate-500">No revocations in the past week.</p>
                ) : null}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-800">Clear Cooperation timers</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {!listings ? (
            <Skeleton className="h-32 w-full" />
          ) : listings.rows.length === 0 ? (
            <p className="text-sm text-slate-500">No active timers.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-2">Listing</th>
                  <th className="px-4 py-2">MLS</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Due</th>
                  <th className="px-4 py-2">Risk</th>
                </tr>
              </thead>
              <tbody>
                {listings.rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="px-4 py-2">{row.listing?.address ?? '—'}</td>
                    <td className="px-4 py-2">{row.mlsProfile?.name ?? '—'}</td>
                    <td className="px-4 py-2">
                      <Badge
                        variant={
                          row.status === 'RED'
                            ? 'destructive'
                            : row.status === 'YELLOW'
                              ? 'outline'
                              : 'secondary'
                        }
                      >
                        {row.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {row.dueAt ? formatDistanceToNow(new Date(row.dueAt), { addSuffix: true }) : '—'}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">{row.riskReason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-800">IDX disclaimer policies & failures</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">Policies</h3>
            {!disclaimers ? (
              <Skeleton className="h-24 w-full" />
            ) : disclaimers.policies.length === 0 ? (
              <p className="text-sm text-slate-500">No policies configured.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {disclaimers.policies.map((policy) => (
                  <li key={policy.id} className="rounded-md border border-slate-100 p-3">
                    <div className="font-medium text-slate-800">{policy.mlsProfile.name}</div>
                    <div className="text-xs text-slate-500">Placement: {policy.requiredPlacement}</div>
                    <div className="text-xs text-slate-500">Reviewed: {format(new Date(policy.lastReviewedAt), 'MMM d, yyyy')}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">Recent failures</h3>
            {!disclaimers ? (
              <Skeleton className="h-24 w-full" />
            ) : disclaimers.failures.length === 0 ? (
              <p className="text-sm text-slate-500">No failures in the last 50 attempts.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {disclaimers.failures.map((failure) => (
                  <li key={failure.id} className="rounded-md border border-slate-100 p-3">
                    <div className="font-medium text-slate-800">
                      {failure.mlsProfile?.name ?? 'Unknown MLS'} • {failure.result ?? 'Failure'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {formatDistanceToNow(new Date(failure.occurredAt), { addSuffix: true })}
                    </div>
                    <div className="text-xs text-slate-500">{failure.listing?.address ?? 'Unknown listing'}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-800">Override log</CardTitle>
        </CardHeader>
        <CardContent>
          {!overrides ? (
            <Skeleton className="h-24 w-full" />
          ) : overrides.length === 0 ? (
            <p className="text-sm text-slate-500">No overrides recorded.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {overrides.map((override) => (
                <li key={override.id} className="rounded-md border border-slate-100 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800">{override.context}</span>
                    <span className="text-xs text-slate-500">
                      {formatDistanceToNow(new Date(override.occurredAt), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {override.actor ? `By ${override.actor.name} (${override.actor.email})` : 'System'}
                  </div>
                  {override.reasonText ? (
                    <div className="mt-1 text-xs text-slate-600">{override.reasonText}</div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
