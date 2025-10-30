"use client";

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';

import { ErrorBanner } from '@/components/error-banner';
import { useApiError } from '@/hooks/use-api-error';
import {
  CreateLeadTaskPayload,
  LeadDetail,
  Pipeline,
  createLeadNote,
  createLeadTask,
  updateLead
} from '@/lib/api';

interface LeadActionsProps {
  lead: LeadDetail;
  pipelines: Pipeline[];
}

export default function ContactActions({ lead, pipelines }: LeadActionsProps) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueAt, setTaskDueAt] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { banner, showError, clearError } = useApiError();

  const currentStageMeta = useMemo(() => {
    const resolvedPipelineId = lead.pipelineId ?? lead.stage?.pipelineId ?? null;
    const resolvedStageId = lead.stage?.id ?? lead.stageId ?? null;

    if (resolvedPipelineId && resolvedStageId) {
      return { pipelineId: resolvedPipelineId, stageId: resolvedStageId };
    }

    const fallbackPipeline = pipelines[0];
    if (fallbackPipeline?.stages.length) {
      return { pipelineId: fallbackPipeline.id, stageId: fallbackPipeline.stages[0].id };
    }

    return { pipelineId: '', stageId: '' };
  }, [lead.pipelineId, lead.stage?.id, lead.stage?.pipelineId, lead.stageId, pipelines]);

  const stageValue = `${currentStageMeta.pipelineId}:${currentStageMeta.stageId}`;

  const stageOptions = useMemo(() => {
    return pipelines.flatMap((pipeline) =>
      pipeline.stages.map((stage) => ({
        value: `${pipeline.id}:${stage.id}`,
        label: `${pipeline.name} · ${stage.name}`
      }))
    );
  }, [pipelines]);

  const handleStageChange = (value: string) => {
    if (value === stageValue) return;
    const [pipelineId, stageId] = value.split(':');
    if (!pipelineId || !stageId) return;
    startTransition(async () => {
      try {
        await updateLead(lead.id, {
          pipelineId: pipelineId || undefined,
          stageId: stageId || undefined
        });
        setMessage('Stage updated');
        clearError();
        router.refresh();
      } catch (error) {
        showError(error);
        setMessage(null);
      }
    });
  };

  const handleConsentToggle = (type: 'EMAIL' | 'SMS', checked: boolean) => {
    startTransition(async () => {
      try {
        await updateLead(lead.id, type === 'EMAIL' ? { consentEmail: checked } : { consentSMS: checked });
        setMessage(`${type} consent ${checked ? 'granted' : 'revoked'}`);
        clearError();
        router.refresh();
      } catch (error) {
        showError(error);
        setMessage(null);
      }
    });
  };

  const handleAddNote = () => {
    if (!note.trim()) return;
    startTransition(async () => {
      try {
        await createLeadNote(lead.id, note.trim());
        setNote('');
        setMessage('Note added');
        clearError();
        router.refresh();
      } catch (error) {
        showError(error);
        setMessage(null);
      }
    });
  };

  const handleCreateTask = () => {
    if (!taskTitle.trim()) return;
    const payload: CreateLeadTaskPayload = {
      title: taskTitle.trim()
    };
    if (taskDueAt) {
      payload.dueAt = new Date(taskDueAt).toISOString();
    }
    startTransition(async () => {
      try {
        await createLeadTask(lead.id, payload);
        setTaskTitle('');
        setTaskDueAt('');
        setMessage('Task created');
        clearError();
        router.refresh();
      } catch (error) {
        showError(error);
        setMessage(null);
      }
    });
  };

  const emailConsent = lead.consents.find((consent) => consent.channel === 'EMAIL');
  const smsConsent = lead.consents.find((consent) => consent.channel === 'SMS');

  return (
    <div className="space-y-4">
      {banner && <ErrorBanner {...banner} onDismiss={clearError} />}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Pipeline controls</h2>
        <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Move to stage
          <select
            value={stageValue}
            onChange={(event) => handleStageChange(event.target.value)}
            disabled={isPending}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            {stageOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Capture consent</h2>
        <div className="mt-3 space-y-2 text-sm text-slate-600">
          <ConsentToggle
            label="Email consent"
            checked={emailConsent?.status === 'GRANTED'}
            onChange={(checked) => handleConsentToggle('EMAIL', checked)}
            loading={isPending}
          />
          <ConsentToggle
            label="SMS consent"
            checked={smsConsent?.status === 'GRANTED'}
            onChange={(checked) => handleConsentToggle('SMS', checked)}
            loading={isPending}
          />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Add note</h2>
        <textarea
          rows={4}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Document the latest conversation or coaching note."
          className="mt-2 w-full rounded border border-slate-300 p-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="button"
          onClick={handleAddNote}
          disabled={isPending || !note.trim()}
          className="mt-2 w-full rounded bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow disabled:opacity-60"
        >
          Log note
        </button>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Create task</h2>
        <input
          type="text"
          value={taskTitle}
          onChange={(event) => setTaskTitle(event.target.value)}
          placeholder="Follow-up action"
          className="mt-2 w-full rounded border border-slate-300 p-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <label className="mt-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Due
          <input
            type="datetime-local"
            value={taskDueAt}
            onChange={(event) => setTaskDueAt(event.target.value)}
            className="mt-1 w-full rounded border border-slate-300 p-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </label>
        <button
          type="button"
          onClick={handleCreateTask}
          disabled={isPending || !taskTitle.trim()}
          className="mt-2 w-full rounded bg-slate-800 px-3 py-2 text-sm font-semibold text-white shadow disabled:opacity-60"
        >
          Create task
        </button>
      </section>

      {message && (
        <p className="text-xs text-slate-500">{message}</p>
      )}

      <Link
        href="/deal-desk"
        className="block rounded border border-brand-200 bg-brand-50 px-3 py-2 text-center text-sm font-semibold text-brand-700 shadow-sm hover:bg-brand-100"
      >
        Create Offer
      </Link>
    </div>
  );
}

interface ConsentToggleProps {
  label: string;
  checked: boolean;
  loading: boolean;
  onChange: (checked: boolean) => void;
}

function ConsentToggle({ label, checked, loading, onChange }: ConsentToggleProps) {
  return (
    <label className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2">
      <span>{label}</span>
      <button
        type="button"
        disabled={loading}
        onClick={() => onChange(!checked)}
        className={clsx(
          'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold transition',
          checked ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600',
          loading && 'opacity-60'
        )}
      >
        {checked ? 'Granted' : 'Revoked'}
      </button>
    </label>
  );
}
