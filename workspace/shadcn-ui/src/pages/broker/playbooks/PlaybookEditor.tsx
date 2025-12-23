import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/contexts/AuthContext'
import { getPlaybook, listPlaybookRuns, savePlaybook, togglePlaybook } from '@/lib/api/playbooks'

export const PlaybookEditor: React.FC = () => {
  const { playbookId } = useParams<{ playbookId: string }>()
  const { activeOrgId } = useAuth()
  const [playbook, setPlaybook] = useState<any | null>(null)
  const [triggersJson, setTriggersJson] = useState('')
  const [actionsJson, setActionsJson] = useState('')
  const [runs, setRuns] = useState<any[]>([])

  useEffect(() => {
    if (!activeOrgId || !playbookId) return
    getPlaybook(activeOrgId, playbookId).then((pb) => {
      setPlaybook(pb)
      setTriggersJson(JSON.stringify(pb.triggers ?? [], null, 2))
      setActionsJson(JSON.stringify(pb.actions ?? [], null, 2))
    })
    listPlaybookRuns(activeOrgId, playbookId).then(setRuns)
  }, [activeOrgId, playbookId])

  const handleSave = async () => {
    if (!activeOrgId || !playbookId) return
    const triggers = JSON.parse(triggersJson || '[]')
    const actions = JSON.parse(actionsJson || '[]')
    const updated = await savePlaybook(activeOrgId, playbookId, { ...playbook, triggers, actions })
    setPlaybook(updated)
  }

  if (!playbook) return <p className="text-sm text-muted-foreground">Loading playbook…</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[30px] font-semibold tracking-tight text-slate-900">Edit Playbook</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Enabled</span>
          <Switch
            checked={playbook.enabled}
            onCheckedChange={async (v) => {
              await togglePlaybook(activeOrgId!, playbookId!, v)
              setPlaybook((prev: any) => ({ ...prev, enabled: v }))
            }}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={playbook.name}
            onChange={(e) => setPlaybook({ ...playbook, name: e.target.value })}
            placeholder="Playbook name"
          />
          <Textarea
            value={playbook.description ?? ''}
            onChange={(e) => setPlaybook({ ...playbook, description: e.target.value })}
            placeholder="Description"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Triggers (JSON)</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea rows={10} value={triggersJson} onChange={(e) => setTriggersJson(e.target.value)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Actions (JSON)</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea rows={12} value={actionsJson} onChange={(e) => setActionsJson(e.target.value)} />
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button onClick={handleSave}>Save</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Runs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {runs.length === 0 ? (
            <p className="text-muted-foreground">No runs yet.</p>
          ) : (
            runs.map((run) => (
              <div key={run.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                <div>
                  <p className="font-medium text-xs">{run.triggerType}</p>
                  <p className="text-xs text-muted-foreground">{run.actionSummary ?? '—'}</p>
                </div>
                <div className="text-xs text-muted-foreground text-right">
                  <p className={run.success ? 'text-green-600' : 'text-red-600'}>{run.success ? 'OK' : 'Failed'}</p>
                  <p>{new Date(run.startedAt).toLocaleString()}</p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default PlaybookEditor
