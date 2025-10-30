import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

import PipelineBoard from '@/components/crm/PipelineBoard'
import { getLeads, getPipelines, type LeadSummary, type Pipeline } from '@/lib/api/hatch'
import { useToast } from '@/components/ui/use-toast'

const DEFAULT_LIMIT = 100

export default function BrokerCRMPage() {
  const { toast } = useToast()
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [leads, setLeads] = useState<LeadSummary[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const [pipelineData, leadResponse] = await Promise.all([
        getPipelines(),
        getLeads({ limit: DEFAULT_LIMIT })
      ])
      setPipelines(pipelineData)
      setLeads(leadResponse.items)
    } catch (error) {
      console.error('Failed to load CRM data', error)
      toast({
        title: 'Failed to load pipeline',
        description: error instanceof Error ? error.message : 'Unexpected error',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  if (loading && pipelines.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading pipeline…
      </div>
    )
  }

  if (pipelines.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
        No pipelines found for this tenant. Configure buyer/seller pipelines in the admin console to begin managing leads.
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <PipelineBoard pipelines={pipelines} initialLeads={leads} onRefresh={fetchData} />
    </div>
  )
}
