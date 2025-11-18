'use client';

import { useState } from 'react';

import { captureConsent, sendSms } from '@/lib/api';

interface ContactActionsProps {
  contact: any;
  tenantId: string;
}

export default function ContactActions({ contact, tenantId }: ContactActionsProps) {
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [consentText, setConsentText] = useState('Text me updates about tours');
  const [loading, setLoading] = useState(false);

  const defaultUserId = process.env.NEXT_PUBLIC_DEFAULT_USER_ID ?? contact.ownerId ?? 'user-agent';
  const consents = contact.consents ?? [];
  const smsConsent = consents.find(
    (consent: any) => consent.channel === 'SMS' && consent.status === 'GRANTED'
  );

  async function handleSendSms() {
    try {
      setLoading(true);
      await sendSms({
        tenantId,
        personId: contact.id,
        userId: defaultUserId,
        from: '+14150000000',
        to: contact.primaryPhone,
        body: message,
        scope: 'PROMOTIONAL'
      });
      setStatus('SMS sent successfully');
      setMessage('');
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCaptureConsent() {
    try {
      setLoading(true);
      await captureConsent(contact.id, {
        tenantId,
        personId: contact.id,
        channel: 'SMS',
        scope: 'PROMOTIONAL',
        verbatimText: consentText,
        source: 'agent_console'
      });
      setStatus('Consent captured');
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700">Quick Actions</h2>
      <div className="mt-4 space-y-4 text-sm">
        <div>
          <label className="text-xs font-semibold uppercase text-slate-500">SMS Message</label>
          <textarea
            className="mt-1 w-full rounded border border-slate-200 bg-white p-2 text-slate-900"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={4}
          />
          <button
            type="button"
            disabled={loading || !contact.primaryPhone}
            onClick={handleSendSms}
            className="mt-2 w-full rounded bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Send SMS {smsConsent ? '' : '(requires consent)'}
          </button>
        </div>

        {!smsConsent && (
          <div className="rounded border border-dashed border-amber-400 p-3">
            <p className="text-xs font-semibold uppercase text-amber-600">Consent Needed</p>
            <textarea
              className="mt-2 w-full rounded border border-slate-200 bg-white p-2 text-slate-900"
              value={consentText}
              onChange={(event) => setConsentText(event.target.value)}
            />
            <button
              type="button"
              onClick={handleCaptureConsent}
              disabled={loading}
              className="mt-2 w-full rounded border border-amber-500 px-3 py-2 text-sm font-semibold text-amber-600"
            >
              Capture SMS Consent
            </button>
          </div>
        )}

        {status && <p className="text-xs text-slate-500">{status}</p>}
      </div>
    </div>
  );
}
