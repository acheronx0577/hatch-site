import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { LoadingState } from '@/components/ui/loading-state'
import { ErrorState } from '@/components/ui/error-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/contexts/AuthContext'
import { fetchAuditLogs, type AuditLogEntry } from '@/lib/api/audit'

const ACTION_TYPES = [
  'LOGIN',
  'LOGOUT',
  'ROLE_CHANGED',
  'MLS_SYNC_TRIGGERED',
  'ACCOUNTING_SYNC_TRIGGERED',
  'NOTIFICATION_PREFS_UPDATED',
  'AI_PERSONA_RUN',
  'AI_PERSONA_CONFIG_CHANGED',
  'ONBOARDING_STATE_CHANGED',
  'OFFBOARDING_STATE_CHANGED',
  'COMPLIANCE_STATUS_CHANGED',
  'OTHER'
]

export default function BrokerAuditLogPage() {
  const { activeOrgId, isBroker, user } = useAuth()
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userFilter, setUserFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const relativeFormatter = useMemo(() => new Intl.RelativeTimeFormat('en', { numeric: 'auto' }), [])

  const formatRelativeTime = (date: Date) => {
    const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000)
    const absSeconds = Math.abs(diffSeconds)

    if (absSeconds < 60) return relativeFormatter.format(diffSeconds, 'second')
    const diffMinutes = Math.round(diffSeconds / 60)
    if (Math.abs(diffMinutes) < 60) return relativeFormatter.format(diffMinutes, 'minute')
    const diffHours = Math.round(diffMinutes / 60)
    if (Math.abs(diffHours) < 24) return relativeFormatter.format(diffHours, 'hour')
    const diffDays = Math.round(diffHours / 24)
    if (Math.abs(diffDays) < 30) return relativeFormatter.format(diffDays, 'day')
    const diffMonths = Math.round(diffDays / 30)
    if (Math.abs(diffMonths) < 12) return relativeFormatter.format(diffMonths, 'month')
    const diffYears = Math.round(diffMonths / 12)
    return relativeFormatter.format(diffYears, 'year')
  }

  const canView = useMemo(() => {
    if (isBroker) return true
    return user?.globalRole === 'SUPER_ADMIN'
  }, [isBroker, user?.globalRole])

  useEffect(() => {
    let mounted = true
    if (!activeOrgId || !canView) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)

    fetchAuditLogs(activeOrgId, {
      limit: 100,
      userId: userFilter.trim() || undefined,
      actionType: actionFilter || undefined
    })
      .then((data) => {
        if (!mounted) return
        setLogs(data)
      })
      .catch((err) => {
        if (!mounted) return
        console.error(err)
        setError('Failed to load audit logs.')
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [activeOrgId, canView, userFilter, actionFilter])

  if (!activeOrgId) {
    return <ErrorState message="Select an organization to view audit history." />
  }

  if (!canView) {
    return <ErrorState message="You are not authorized to view the audit log." />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Security</p>
        <h1 className="text-[30px] font-semibold tracking-tight text-slate-900">Audit Log</h1>
        <p className="text-sm text-slate-600">
          Review sensitive actions across your brokerage, including MLS syncs, accounting events, AI runs, and preference changes.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <CardTitle className="text-base font-semibold">Filters</CardTitle>
          <div className="flex w-full flex-col gap-3 md:flex-row">
            <div className="flex-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">User ID</label>
              <Input
                value={userFilter}
                onChange={(event) => setUserFilter(event.target.value)}
                placeholder="Filter by user id"
                className="mt-1"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Action type</label>
              <Select value={actionFilter || 'ALL'} onValueChange={(value) => setActionFilter(value === 'ALL' ? '' : value)}>
                <SelectTrigger className="mt-1 h-11 rounded-full">
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="ALL">All actions</SelectItem>
                  {ACTION_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="ghost"
              onClick={() => {
                setUserFilter('')
                setActionFilter('')
              }}
            >
              Reset
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingState message="Loading audit events..." />
          ) : error ? (
            <ErrorState message={error} />
          ) : logs.length === 0 ? (
            <div className="py-6 text-sm text-muted-foreground">No audit events recorded yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Summary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const createdAt = new Date(log.createdAt)
                  const timestampTitle = createdAt.toLocaleString()
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="text-slate-700">
                        <span title={timestampTitle}>{formatRelativeTime(createdAt)}</span>
                      </TableCell>
                      <TableCell className="text-slate-600">{log.userId ?? 'System'}</TableCell>
                      <TableCell>
                        <Badge variant="neutral">{log.actionType}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[480px] truncate text-sm text-slate-700" title={log.summary}>
                        {log.summary}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">
        Need to investigate further? Visit the{' '}
        <Link to="/broker/mission-control" className="text-brand-blue-600 hover:underline">
          Mission Control dashboard
        </Link>{' '}
        for additional insights.
      </div>
    </div>
  )
}
