import { apiFetch } from '../api';

export type ContractInstanceStatus = 'DRAFT' | 'OUT_FOR_SIGNATURE' | 'SIGNED' | 'VOIDED';

export type ContractTemplateSummary = {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  jurisdiction?: string | null;
  propertyType?: string | null;
  side?: string | null;
  version?: number;
  templateUrl?: string | null;
};

export type ContractPartySummary = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  primaryEmail?: string | null;
  primaryPhone?: string | null;
};

export type ContractInstanceRecord = {
  id: string;
  organizationId: string;
  templateId: string;
  orgListingId?: string | null;
  orgTransactionId?: string | null;
  buyerPersonId?: string | null;
  sellerPersonId?: string | null;
  buyerPerson?: ContractPartySummary | null;
  sellerPerson?: ContractPartySummary | null;
  title: string;
  status: ContractInstanceStatus;
  editableKeys?: string[];
  fieldValues: Record<string, unknown>;
  draftS3Key?: string | null;
  signedS3Key?: string | null;
  draftUrl?: string | null;
  signedUrl?: string | null;
  recommendationReason?: string | null;
  template?: Pick<ContractTemplateSummary, 'id' | 'name' | 'code' | 'version' | 'propertyType' | 'side'> | null;
  envelope?: unknown | null;
  createdAt: string;
  updatedAt: string;
  missingRequired?: string[];
};

export async function listContractTemplates(
  orgId: string,
  params: { propertyType?: string; side?: string; jurisdiction?: string; active?: string } = {}
): Promise<ContractTemplateSummary[]> {
  const search = new URLSearchParams();
  if (params.propertyType) search.set('propertyType', params.propertyType);
  if (params.side) search.set('side', params.side);
  if (params.jurisdiction) search.set('jurisdiction', params.jurisdiction);
  if (params.active) search.set('active', params.active);
  const query = search.toString();
  const path = query
    ? `organizations/${orgId}/contracts/templates?${query}`
    : `organizations/${orgId}/contracts/templates`;
  const templates = await apiFetch<ContractTemplateSummary[]>(path);
  return templates ?? [];
}

export async function searchContractTemplates(
  orgId: string,
  params: {
    query?: string;
    propertyType?: string;
    side?: string;
    jurisdiction?: string;
    includeUrl?: boolean;
  } = {}
): Promise<ContractTemplateSummary[]> {
  const search = new URLSearchParams();
  if (params.query) search.set('query', params.query);
  if (params.propertyType) search.set('propertyType', params.propertyType);
  if (params.side) search.set('side', params.side);
  if (params.jurisdiction) search.set('jurisdiction', params.jurisdiction);
  if (params.includeUrl !== undefined) search.set('includeUrl', params.includeUrl ? 'true' : 'false');
  const query = search.toString();
  const path = query
    ? `organizations/${orgId}/contracts/templates/search?${query}`
    : `organizations/${orgId}/contracts/templates/search`;
  const templates = await apiFetch<ContractTemplateSummary[]>(path);
  return templates ?? [];
}

export async function listContractInstances(
  orgId: string,
  params: { propertyId?: string; transactionId?: string; contactId?: string; status?: string } = {}
): Promise<ContractInstanceRecord[]> {
  const search = new URLSearchParams();
  if (params.propertyId) search.set('propertyId', params.propertyId);
  if (params.transactionId) search.set('transactionId', params.transactionId);
  if (params.contactId) search.set('contactId', params.contactId);
  if (params.status) search.set('status', params.status);
  const query = search.toString();
  const path = query ? `organizations/${orgId}/contracts/instances?${query}` : `organizations/${orgId}/contracts/instances`;
  const instances = await apiFetch<ContractInstanceRecord[]>(path);
  return instances ?? [];
}

export async function getContractInstance(orgId: string, contractInstanceId: string): Promise<ContractInstanceRecord> {
  return apiFetch<ContractInstanceRecord>(`organizations/${orgId}/contracts/instances/${contractInstanceId}`);
}

export async function createContractInstance(
  orgId: string,
  payload: {
    templateId: string;
    propertyId?: string;
    transactionId?: string;
    buyerPersonId?: string;
    sellerPersonId?: string;
    title?: string;
    recommendationReason?: string;
    overrideFieldValues?: Record<string, unknown>;
  }
): Promise<ContractInstanceRecord> {
  return apiFetch<ContractInstanceRecord>(`organizations/${orgId}/contracts/instances`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateContractInstance(
  orgId: string,
  contractInstanceId: string,
  payload: {
    title?: string;
    fieldValues?: Record<string, unknown>;
  }
): Promise<ContractInstanceRecord> {
  return apiFetch<ContractInstanceRecord>(`organizations/${orgId}/contracts/instances/${contractInstanceId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}
