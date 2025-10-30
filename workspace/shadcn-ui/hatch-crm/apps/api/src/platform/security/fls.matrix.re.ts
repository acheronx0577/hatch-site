export const RE_FLS: Record<string, { readable: string[]; writable: string[]; sensitive?: string[] }> = {
  re_offers: {
    readable: ['id', 'tenantId', 'listingId', 'personId', 'dealId', 'amount', 'status', 'terms', 'metadata', 'contingencies', 'createdAt', 'updatedAt'],
    writable: ['personId', 'amount', 'terms', 'metadata', 'contingencies'],
    sensitive: ['amount', 'terms', 'metadata']
  },
  re_transactions: {
    readable: ['id', 'tenantId', 'personId', 'listingId', 'opportunityId', 'stage', 'milestoneChecklist', 'commissionSnapshot', 'createdAt', 'updatedAt'],
    writable: ['stage', 'milestoneChecklist'],
    sensitive: ['commissionSnapshot']
  },
  re_listings: {
    readable: ['id', 'tenantId', 'personId', 'opportunityId', 'status', 'price', 'createdAt', 'updatedAt'],
    writable: ['status'],
    sensitive: ['price']
  },
  commission_plans: {
    readable: ['id', 'orgId', 'name', 'brokerSplit', 'agentSplit', 'tiers', 'createdAt'],
    writable: ['name', 'brokerSplit', 'agentSplit', 'tiers'],
    sensitive: ['brokerSplit', 'agentSplit', 'tiers']
  },
  payouts: {
    readable: ['id', 'orgId', 'transactionId', 'opportunityId', 'payeeId', 'grossAmount', 'brokerAmount', 'agentAmount', 'status', 'dueOn', 'paidAt', 'createdAt'],
    writable: ['orgId', 'transactionId', 'opportunityId', 'payeeId', 'grossAmount', 'brokerAmount', 'agentAmount', 'status', 'dueOn', 'paidAt'],
    sensitive: ['grossAmount', 'brokerAmount', 'agentAmount']
  }
};
