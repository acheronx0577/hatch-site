import React, { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { FileText, MessageCircle } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/api/client'
import { fetchOrgForms, type OrgForm } from '@/lib/api/forms'
import { emitAskHatchOpen } from '@/lib/ask-hatch/events'

const DEFAULT_ORG_ID = import.meta.env.VITE_ORG_ID ?? 'org-hatch'

type JurisdictionKey = 'florida' | 'nabor' | 'fannieMae' | 'other'

function normalizeJurisdiction(value?: string | null): JurisdictionKey {
  if (!value) return 'other'
  const normalized = value.toLowerCase()
  if (normalized.includes('fannie')) return 'fannieMae'
  if (normalized.includes('nabor')) return 'nabor'
  if (normalized.includes('fl')) return 'florida'
  if (normalized.includes('florida')) return 'florida'
  return 'other'
}

function humanJurisdiction(key: JurisdictionKey) {
  switch (key) {
    case 'florida':
      return 'Florida'
    case 'nabor':
      return 'NABOR'
    case 'fannieMae':
      return 'Fannie Mae'
    default:
      return 'General'
  }
}

export default function FormsLibrary() {
  const { activeOrgId } = useAuth()
  const orgId = activeOrgId ?? DEFAULT_ORG_ID

  const { data, isLoading, error } = useQuery({
    queryKey: ['forms-library', orgId],
    queryFn: () => fetchOrgForms(orgId),
    enabled: Boolean(orgId)
  })

  const grouped = useMemo(() => {
    const bucket: Record<JurisdictionKey, OrgForm[]> = {
      florida: [],
      nabor: [],
      fannieMae: [],
      other: []
    }
    for (const form of data ?? []) {
      const key = normalizeJurisdiction(form.jurisdiction)
      bucket[key].push(form)
    }
    return bucket
  }, [data])

  const sections: Array<{ key: JurisdictionKey; forms: OrgForm[]; description: string }> = [
    {
      key: 'florida',
      forms: grouped.florida,
      description: 'Florida statewide contracts, addenda, and disclosures.'
    },
    {
      key: 'nabor',
      forms: grouped.nabor,
      description: 'NABOR-approved contracts and seller disclosures.'
    },
    {
      key: 'fannieMae',
      forms: grouped.fannieMae,
      description: 'Fannie Mae loan and REO forms.'
    },
    { key: 'other', forms: grouped.other, description: 'Other reference materials.' }
  ]

  const buildDownloadUrl = (form: OrgForm) => {
    if (form.downloadPath) {
      return `${apiClient.defaults.baseURL ?? ''}${form.downloadPath}`
    }
    if (form.fileObjectId) {
      return `${apiClient.defaults.baseURL ?? ''}/files/${form.fileObjectId}/download`
    }
    return null
  }

  const handleAskHatch = (form: OrgForm) => {
    emitAskHatchOpen({
      title: `Form · ${form.title}`,
      contextType: 'GENERAL'
    })
  }

  if (!orgId) {
    return <div className="text-sm text-muted-foreground">Select an organization to view forms.</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Resources</p>
          <h1 className="text-[30px] font-semibold tracking-tight text-slate-900">Forms Library</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Browse the ingested Florida, NABOR, and Fannie Mae forms. Open a form to preview/download,
          or ask Hatch for guidance with the built-in assistant.
        </p>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading forms…</div>}
      {error && (
        <div className="text-sm text-red-500">
          Unable to load forms. Please refresh or try again later.
        </div>
      )}

      {!isLoading &&
        !error &&
        sections.map((section) => (
          <Card key={section.key}>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>{humanJurisdiction(section.key)}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </div>
              <Badge variant="secondary">{section.forms.length} forms</Badge>
            </CardHeader>
            <CardContent>
              {section.forms.length === 0 ? (
                <div className="rounded border border-dashed bg-muted/50 px-4 py-6 text-sm text-muted-foreground">
                  No forms available in this group.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {section.forms.map((form) => {
                    const downloadUrl = buildDownloadUrl(form)
                    const viewerPath = form.orgFileId ? `/broker/documents/${form.orgFileId}` : null
                    return (
                      <div
                        key={form.id}
                        className="rounded-lg border bg-white p-4 shadow-sm flex flex-col gap-3"
                      >
                        <div className="flex items-start gap-3">
                          <div className="rounded-full bg-blue-50 p-2 text-blue-700">
                            <FileText className="h-5 w-5" />
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-semibold text-gray-900">{form.title}</div>
                            <div className="text-xs text-muted-foreground">
                              Added {new Date(form.createdAt).toLocaleDateString()}
                            </div>
                            {form.description && (
                              <div className="mt-1 text-xs text-muted-foreground">{form.description}</div>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline">{humanJurisdiction(normalizeJurisdiction(form.jurisdiction))}</Badge>
                          {form.fileName && <Badge variant="secondary">{form.fileName}</Badge>}
                        </div>
                        <div className="flex items-center gap-2">
                          {downloadUrl ? (
                            <Button asChild size="sm" className="flex-1">
                              <a href={downloadUrl} target="_blank" rel="noreferrer">
                                View Form
                              </a>
                            </Button>
                          ) : viewerPath ? (
                            <Button asChild size="sm" className="flex-1">
                              <Link to={viewerPath}>View Form</Link>
                            </Button>
                          ) : (
                            <Button size="sm" className="flex-1" disabled>
                              View Form
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex items-center gap-1"
                            onClick={() => handleAskHatch(form)}
                          >
                            <MessageCircle className="h-4 w-4" />
                            Ask Hatch
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        ))}

    </div>
  )
}
