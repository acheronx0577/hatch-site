import { notFound } from 'next/navigation';

import TransactionClient from '@/components/re/transaction-client';
import { PersonaContextEmitter } from '@/components/personas/PersonaContextEmitter';
import { getReTransaction, getTransactionCommission } from '@/lib/api/re.transactions';

interface TransactionPageProps {
  params: { id: string };
}

export const dynamic = 'force-dynamic';

export default async function TransactionPage({ params }: TransactionPageProps) {
  const { id } = params;

  try {
    const [transaction, commission] = await Promise.all([
      getReTransaction(id),
      getTransactionCommission(id).catch(() => null)
    ]);

    const personaContext = {
      surface: 'transaction' as const,
      entityType: 'transaction' as const,
      entityId: transaction.id,
      summary: `${transaction.listing?.addressLine1 ?? 'Transaction'} · ${transaction.stage}`,
      metadata: {
        listingId: transaction.listingId,
        stage: transaction.stage,
        milestoneCount: transaction.milestoneChecklist.items.length,
        commissionReady: Boolean(commission)
      }
    };

    return (
      <>
        <PersonaContextEmitter context={personaContext} />
        <div className="space-y-6">
          <header className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-semibold text-slate-900">Transaction</h1>
            <p className="text-sm text-slate-500">
              Track escrow milestones, commission estimates, and trigger payouts.
            </p>
          </header>

          <TransactionClient transaction={transaction} initialCommission={commission} />
        </div>
      </>
    );
  } catch (error) {
    notFound();
  }
}
