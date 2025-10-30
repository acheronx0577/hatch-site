import { listAssignmentRules } from '@/lib/api/admin.rules';

import { RulesManager } from '../components/rules-manager';

export const dynamic = 'force-dynamic';

export default async function AssignmentRulesPage() {
  const data = await listAssignmentRules({ limit: 25 });
  return <RulesManager initialItems={data.items} initialNextCursor={data.nextCursor ?? null} type="assignment" />;
}
