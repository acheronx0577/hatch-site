import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/contexts/AuthContext'
import { createPlaybook, listPlaybooks, togglePlaybook } from '@/lib/api/playbooks'
import AutomationAiModal from './AutomationAiModal'

export const PlaybooksList: React.FC = () => {
  const { activeOrgId } = useAuth()
  const [playbooks, setPlaybooks] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)

  useEffect(() => {
    if (!activeOrgId) return
    setLoading(true)
    listPlaybooks(activeOrgId)
      .then(setPlaybooks)
      .finally(() => setLoading(false))
  }, [activeOrgId])

  const handleNew = async () => {
    if (!activeOrgId) return
    const created = await createPlaybook(activeOrgId, {
      name: 'New Playbook',
      description: 'Automation',
      triggers: [{ type: 'DOCUMENT_EVALUATED' }],
      actions: [{ type: 'SEND_NOTIFICATION', params: { title: 'Automation fired' } }]
    })
    setPlaybooks((prev) => [created, ...prev])
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    if (!activeOrgId) return
    await togglePlaybook(activeOrgId, id, enabled)
    setPlaybooks((prev) => prev.map((p) => (p.id === id ? { ...p, enabled } : p)))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-semibold tracking-tight text-slate-900">Playbooks</h1>
          <p className="text-sm text-slate-600">Automate broker workflows with triggers and actions.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAiOpen(true)}>
            Generate with AI
          </Button>
          <Button onClick={handleNew}>New Playbook</Button>
        </div>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {playbooks.map((playbook) => (
          <Card key={playbook.id} className="h-full">
            <CardHeader className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">{playbook.name}</CardTitle>
                <p className="text-xs text-muted-foreground">{playbook.description}</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Enabled</span>
                <Switch checked={playbook.enabled} onCheckedChange={(v) => handleToggle(playbook.id, v)} />
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Triggers: {playbook.triggers?.map((t: any) => t.type).join(', ') || 'None'}
              </p>
              <p className="text-xs text-muted-foreground">
                Actions: {playbook.actions?.map((a: any) => a.type).join(', ') || 'None'}
              </p>
              <Button asChild variant="outline" size="sm" className="mt-2">
                <Link to={`/broker/playbooks/${playbook.id}`}>Edit</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <AutomationAiModal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onCreated={(id) => setPlaybooks((prev) => prev)}
      />
    </div>
  )
}

export default PlaybooksList
