import React from 'react'
import { MissionControlView } from '@/components/mission-control/mission-control-view'
import { useAuth } from '@/contexts/AuthContext'

export default function MissionControlPage() {
  const { activeOrgId } = useAuth()
  const fallbackOrgId = import.meta.env.VITE_ORG_ID ?? 'org-hatch'
  const orgId = activeOrgId ?? fallbackOrgId

  if (!orgId) {
    return <div className="text-sm text-gray-600">Select an organization to load Mission Control.</div>
  }

  return (
    <div className="flex h-full flex-col gap-6">
      <MissionControlView orgId={orgId} />
    </div>
  )
}
