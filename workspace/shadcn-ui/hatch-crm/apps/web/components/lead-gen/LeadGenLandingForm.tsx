'use client';

import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getApiBaseUrl } from '@/lib/api';
import { getAttribution } from '@/lib/telemetry/attribution';
import { getAnonymousId } from '@/lib/telemetry/identity';

type FieldType = 'text' | 'email' | 'tel' | 'textarea';

type FormField = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
};

type FormSchema = {
  submitLabel?: string;
  fields?: FormField[];
  consent?: {
    email?: boolean;
    sms?: boolean;
    text?: string;
  };
};

export function LeadGenLandingForm(props: { orgId: string; slug: string; formSchema?: FormSchema | null }) {
  const schema = props.formSchema ?? {};
  const fields = useMemo<FormField[]>(() => {
    if (schema.fields && Array.isArray(schema.fields) && schema.fields.length > 0) {
      return schema.fields;
    }

    return [
      { name: 'name', label: 'Full name', type: 'text' },
      { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'phone', label: 'Phone', type: 'tel' },
      { name: 'message', label: 'Message', type: 'textarea' }
    ];
  }, [schema.fields]);

  const [values, setValues] = useState<Record<string, string>>({});
  const [consentEmail, setConsentEmail] = useState<boolean>(Boolean(schema.consent?.email));
  const [consentSms, setConsentSms] = useState<boolean>(Boolean(schema.consent?.sms));
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submitLabel = schema.submitLabel ?? 'Submit';

  const requiredMissing = useMemo(() => {
    return fields.some((field) => field.required && !(values[field.name] ?? '').trim());
  }, [fields, values]);

  const setFieldValue = (name: string, value: string) => setValues((prev) => ({ ...prev, [name]: value }));

  const handleSubmit = async () => {
    if (requiredMissing || status === 'submitting') return;
    setStatus('submitting');
    setError(null);

    const { utmSource, utmMedium, utmCampaign, gclid, fbclid } = getAttribution();

    const payload: any = {
      name: values.name?.trim() || undefined,
      email: values.email?.trim() || undefined,
      phone: values.phone?.trim() || undefined,
      message: values.message?.trim() || undefined,
      utmSource: utmSource ?? undefined,
      utmMedium: utmMedium ?? undefined,
      utmCampaign: utmCampaign ?? undefined,
      gclid: gclid ?? undefined,
      fbclid: fbclid ?? undefined,
      anonymousId: getAnonymousId(),
      pageUrl: typeof window !== 'undefined' ? window.location.href : undefined,
      referrer: typeof document !== 'undefined' ? document.referrer : undefined,
      marketingConsentEmail: consentEmail,
      marketingConsentSms: consentSms,
      website: ''
    };

    const apiBase = getApiBaseUrl();
    const url = `${apiBase}v1/lead-gen/public/organizations/${encodeURIComponent(props.orgId)}/landing-pages/${encodeURIComponent(props.slug)}/submit?mode=json`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include'
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Failed (${res.status})`);
      }
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Submission failed');
    }
  };

  if (status === 'success') {
    return (
      <div className="rounded-lg border bg-white p-6">
        <div className="text-base font-semibold">Thanks — we got it.</div>
        <div className="mt-1 text-sm text-muted-foreground">We’ll reach out shortly.</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white p-6">
      <div className="grid gap-3">
        {fields.map((field) => (
          <div key={field.name} className="grid gap-1.5">
            <div className="text-xs font-medium">
              {field.label}
              {field.required ? <span className="text-destructive"> *</span> : null}
            </div>
            {field.type === 'textarea' ? (
              <textarea
                value={values[field.name] ?? ''}
                onChange={(e) => setFieldValue(field.name, e.target.value)}
                className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            ) : (
              <Input
                value={values[field.name] ?? ''}
                onChange={(e) => setFieldValue(field.name, e.target.value)}
                type={field.type}
              />
            )}
          </div>
        ))}

        {(schema.consent?.email || schema.consent?.sms) && (
          <div className="grid gap-2 rounded-md bg-muted/40 p-3">
            {schema.consent?.text ? <div className="text-xs text-muted-foreground">{schema.consent.text}</div> : null}
            {schema.consent?.email ? (
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={consentEmail} onChange={(e) => setConsentEmail(e.target.checked)} />
                Marketing emails
              </label>
            ) : null}
            {schema.consent?.sms ? (
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={consentSms} onChange={(e) => setConsentSms(e.target.checked)} />
                Marketing SMS
              </label>
            ) : null}
          </div>
        )}

        {error ? <div className="text-xs text-destructive">{error}</div> : null}

        <Button onClick={handleSubmit} disabled={requiredMissing || status === 'submitting'}>
          {status === 'submitting' ? 'Submitting…' : submitLabel}
        </Button>
      </div>
    </div>
  );
}
