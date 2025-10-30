export const CASES_FLS: Record<
  string,
  { readable: string[]; writable: string[]; sensitive?: string[] }
> = {
  cases: {
    readable: [
      'id',
      'subject',
      'status',
      'priority',
      'origin',
      'description',
      'accountId',
      'contactId',
      'ownerId',
      'createdAt',
      'updatedAt'
    ],
    writable: ['subject', 'status', 'priority', 'origin', 'description', 'accountId', 'contactId']
  }
};
