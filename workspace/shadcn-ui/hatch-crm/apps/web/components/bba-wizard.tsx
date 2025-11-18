'use client';

import { useState } from 'react';

import { createAgreement, signAgreement } from '@/lib/api';

interface BbaWizardProps {
  tenantId: string;
  contacts: Array<{ id: string; firstName: string; lastName: string }>;
}

export default function BbaWizard({ tenantId, contacts }: BbaWizardProps) {
  const [personId, setPersonId] = useState(contacts[0]?.id ?? '');
  const [agreementId, setAgreementId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    setLoading(true);
    setStatus(null);
    try {
      const agreement = await createAgreement({
        tenantId,
        personId,
        type: 'BUYER_REP'
      });
      setAgreementId(agreement.id);
      setStatus('Agreement drafted. Send to consumer for e-sign.');
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSign() {
    if (!agreementId) return;
    setLoading(true);
    setStatus(null);
    try {
      await signAgreement(agreementId, {
        tenantId,
        actorUserId: process.env.NEXT_PUBLIC_DEFAULT_USER_ID ?? 'user-agent'
      });
      setStatus('Agreement signed. Tours can now be confirmed.');
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-semibold uppercase text-slate-500">Contact</label>
        <select
          className="mt-1 w-full rounded border border-slate-200 bg-white p-2 text-slate-900"
          value={personId}
          onChange={(event) => setPersonId(event.target.value)}
        >
          {contacts.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contact.firstName} {contact.lastName}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleCreate}
          disabled={loading}
          className="flex-1 rounded border border-brand-600 px-3 py-2 text-sm font-semibold text-brand-600 disabled:opacity-50"
        >
          Draft BBA
        </button>
        <button
          type="button"
          onClick={handleSign}
          disabled={loading || !agreementId}
          className="flex-1 rounded bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Mark Signed
        </button>
      </div>

      {status && <p className="text-xs text-slate-500">{status}</p>}
    </div>
  );
}
