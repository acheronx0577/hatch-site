import { apiClient } from './client'

export type OrgForm = {
  id: string
  title: string
  jurisdiction: string
  s3Key: string | null
  createdAt: string
  orgFileId?: string | null
  fileObjectId?: string | null
  fileName?: string | null
  description?: string | null
  downloadPath?: string | null
}

export async function fetchOrgForms(orgId: string): Promise<OrgForm[]> {
  const res = await apiClient.get(`/organizations/${orgId}/forms`)
  return res.data
}
