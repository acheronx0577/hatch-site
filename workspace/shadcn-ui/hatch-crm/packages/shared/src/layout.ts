export type FieldDef = {
  field: string;
  label?: string;
  width?: number;
};

export const FIELD_MAP: Record<string, FieldDef[]> = {
  accounts: [
    { field: 'name', label: 'Account Name' },
    { field: 'website', label: 'Website' },
    { field: 'industry', label: 'Industry' },
    { field: 'phone', label: 'Phone' },
    { field: 'owner', label: 'Owner' },
    { field: 'annualRevenue', label: 'Annual Revenue' },
    { field: 'createdAt', label: 'Created' },
    { field: 'updatedAt', label: 'Updated' }
  ],
  opportunities: [
    { field: 'name', label: 'Opportunity' },
    { field: 'stage', label: 'Stage' },
    { field: 'amount', label: 'Amount' },
    { field: 'currency', label: 'Currency' },
    { field: 'closeDate', label: 'Close Date' },
    { field: 'owner', label: 'Owner' },
    { field: 'account', label: 'Account' },
    { field: 'transaction', label: 'Transaction' },
    { field: 'createdAt', label: 'Created' },
    { field: 'updatedAt', label: 'Updated' }
  ],
  contacts: [
    { field: 'firstName', label: 'First Name' },
    { field: 'lastName', label: 'Last Name' },
    { field: 'primaryEmail', label: 'Email' },
    { field: 'primaryPhone', label: 'Phone' },
    { field: 'stage', label: 'Stage' }
  ],
  leads: [
    { field: 'firstName', label: 'First Name' },
    { field: 'lastName', label: 'Last Name' },
    { field: 'email', label: 'Email' },
    { field: 'phone', label: 'Phone' },
    { field: 'stage', label: 'Stage' },
    { field: 'pipelineName', label: 'Pipeline' },
    { field: 'source', label: 'Source' },
    { field: 'owner', label: 'Owner' },
    { field: 'scoreTier', label: 'Score Tier' },
    { field: 'score', label: 'Score' },
    { field: 'lastActivityAt', label: 'Last Activity' },
    { field: 'createdAt', label: 'Created' }
  ],
  cases: [
    { field: 'subject', label: 'Subject' },
    { field: 'status', label: 'Status' },
    { field: 'priority', label: 'Priority' },
    { field: 'origin', label: 'Origin' },
    { field: 'ownerId', label: 'Owner' },
    { field: 'createdAt', label: 'Created' },
    { field: 'updatedAt', label: 'Updated' }
  ]
};
