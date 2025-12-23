import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { DocumentCommentsSidebar } from '@/components/documents/DocumentCommentsSidebar'
import { DocumentVersionList } from '@/components/documents/DocumentVersionList'
import { DocumentReviewStatusBadge } from '@/components/documents/DocumentReviewStatusBadge'
import { updateFileReviewStatus, type ReviewStatus } from '@/lib/api/documents-collab'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/use-toast'

export default function DocumentViewerPage() {
  const { fileId } = useParams<{ fileId: string }>()
  const { activeOrgId } = useAuth()
  const { toast } = useToast()
  const [status, setStatus] = useState<ReviewStatus>('NONE')
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    // placeholder: if you have file fetch, use it to set status; otherwise default NONE
  }, [fileId])

  const handleStatus = async (next: ReviewStatus) => {
    if (!activeOrgId || !fileId) return
    setUpdating(true)
    try {
      await updateFileReviewStatus(activeOrgId, fileId, next)
      setStatus(next)
    } catch (err) {
      toast({ title: 'Failed to update review status', variant: 'destructive' })
    } finally {
      setUpdating(false)
    }
  }

  if (!fileId) {
    return <div className="text-sm text-muted-foreground">No document selected.</div>
  }

  return (
    <div className="flex h-[calc(100vh-80px)]">
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold">Document {fileId}</h1>
            <div className="flex items-center gap-2">
              <DocumentReviewStatusBadge status={status} />
              <span className="text-xs text-muted-foreground">Review status</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => handleStatus('IN_REVIEW')}
              disabled={updating}
              className="rounded border px-2 py-1 hover:bg-muted"
            >
              Send for review
            </button>
            <button
              onClick={() => handleStatus('APPROVED')}
              disabled={updating}
              className="rounded border px-2 py-1 hover:bg-muted"
            >
              Approve
            </button>
            <button
              onClick={() => handleStatus('REJECTED')}
              disabled={updating}
              className="rounded border px-2 py-1 hover:bg-muted text-red-600"
            >
              Reject
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-auto p-4 space-y-3">
            <div className="rounded border p-4 bg-white text-sm text-muted-foreground">
              {/* Placeholder — integrate your actual file viewer here (PDF iframe etc.) */}
              Document viewer placeholder. Replace with PDF/image viewer.
            </div>
            <DocumentVersionList fileId={fileId} />
          </div>
          <DocumentCommentsSidebar fileId={fileId} />
        </div>
      </div>
    </div>
  )
}
