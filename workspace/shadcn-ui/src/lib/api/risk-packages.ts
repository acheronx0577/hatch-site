import { apiFetch } from './hatch';

export type RiskPackageId = string;

export type RiskPackageGroup = string;

export type RiskPackageDefinition = {
  id: RiskPackageId;
  name: string;
  description: string;
  group: RiskPackageGroup;
  signalMultipliers: Record<string, number>;
  categoryCaps?: Record<string, number>;
  categoryDefaultMultiplier?: number;
  categoryMultipliers?: Record<string, number>;
  isCustom?: boolean;
};

export type RiskPackagesResponse = {
  activePackageIds: RiskPackageId[];
  packages: RiskPackageDefinition[];
  updatedAt?: string;
};

export async function fetchRiskPackages(orgId: string) {
  return apiFetch<RiskPackagesResponse>(`organizations/${orgId}/ai-broker/risk-packages`);
}

export async function updateRiskPackages(orgId: string, payload: { activePackageIds: RiskPackageId[] }) {
  return apiFetch<RiskPackagesResponse>(`organizations/${orgId}/ai-broker/risk-packages`, {
    method: 'PUT',
    body: payload
  });
}

export type CreateCustomRiskPackagePayload = {
  name: string;
  description?: string;
  group?: string;
  signalMultipliers: Record<string, number>;
  categoryCaps?: Record<string, number>;
  categoryDefaultMultiplier?: number;
  categoryMultipliers?: Record<string, number>;
};

export async function createCustomRiskPackage(orgId: string, payload: CreateCustomRiskPackagePayload) {
  return apiFetch<RiskPackagesResponse>(`organizations/${orgId}/ai-broker/risk-packages/custom`, {
    method: 'POST',
    body: payload
  });
}

export type UpdateCustomRiskPackagePayload = Partial<CreateCustomRiskPackagePayload>;

export async function updateCustomRiskPackage(orgId: string, packageId: string, payload: UpdateCustomRiskPackagePayload) {
  const sanitizedId = packageId.replace(/^\/+/, '');
  return apiFetch<RiskPackagesResponse>(`organizations/${orgId}/ai-broker/risk-packages/custom/${sanitizedId}`, {
    method: 'PATCH',
    body: payload
  });
}

export async function deleteCustomRiskPackage(orgId: string, packageId: string) {
  const sanitizedId = packageId.replace(/^\/+/, '');
  return apiFetch<RiskPackagesResponse>(`organizations/${orgId}/ai-broker/risk-packages/custom/${sanitizedId}`, {
    method: 'DELETE'
  });
}

export async function recomputeOrgRisk(orgId: string) {
  return apiFetch<{ processed: number; updated: number; errors: number }>(`organizations/${orgId}/ai-broker/recompute-risk`, {
    method: 'POST'
  });
}
