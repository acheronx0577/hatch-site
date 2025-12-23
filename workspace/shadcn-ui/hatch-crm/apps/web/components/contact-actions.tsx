"use client";

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { CalendarClock, NotebookPen, ShieldCheck, Target } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

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
  const queryClient = useQueryClient();
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

  const currentStageLabel = useMemo(() => {
    return stageOptions.find((option) => option.value === stageValue)?.label ?? 'Select a stage';
  }, [stageOptions, stageValue]);

  const leadType = lead.leadType ?? 'UNKNOWN';

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
        void queryClient.invalidateQueries({ queryKey: ['insights'] });
        router.refresh();
      } catch (error) {
        showError(error);
        setMessage(null);
      }
    });
  };

  const handleLeadTypeChange = (value: string) => {
    const nextType = value === 'BUYER' || value === 'SELLER' || value === 'UNKNOWN' ? value : null;
    if (!nextType || nextType === leadType) return;

    startTransition(async () => {
      try {
        await updateLead(lead.id, { leadType: nextType });
        setMessage('Lead type updated');
        clearError();
        void queryClient.invalidateQueries({ queryKey: ['insights'] });
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
        void queryClient.invalidateQueries({ queryKey: ['insights'] });
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
        void queryClient.invalidateQueries({ queryKey: ['insights'] });
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
        void queryClient.invalidateQueries({ queryKey: ['insights'] });
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
    <div className="space-y-6">
      {banner && <ErrorBanner {...banner} onDismiss={clearError} />}

      <div className="rounded-xl border border-slate-200/60 bg-white px-4 py-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Target className="h-4 w-4 text-brand-500" />
              Move stage
            </p>
            <p className="text-xs text-slate-500">Align this lead with the next best milestone.</p>
          </div>
          <span className="inline-flex items-center rounded-full border border-slate-200/60 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
            {currentStageLabel}
          </span>
        </div>
        <select
          value={stageValue}
          onChange={(event) => handleStageChange(event.target.value)}
          disabled={isPending}
          className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {stageOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-xl border border-slate-200/60 bg-white px-4 py-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Target className="h-4 w-4 text-brand-500" />
              Lead type
            </p>
            <p className="text-xs text-slate-500">Buyer/seller orientation used for routing and reporting.</p>
          </div>
          <span className="inline-flex items-center rounded-full border border-slate-200/60 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
            {leadType === 'UNKNOWN' ? 'Unknown' : leadType === 'BUYER' ? 'Buyer' : 'Seller'}
          </span>
        </div>
        <select
          value={leadType}
          onChange={(event) => handleLeadTypeChange(event.target.value)}
          disabled={isPending}
          className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="UNKNOWN">Unknown</option>
          <option value="BUYER">Buyer</option>
          <option value="SELLER">Seller</option>
        </select>
      </div>

      <div className="rounded-xl border border-slate-200/60 bg-white px-4 py-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          Communication consent
        </p>
        <p className="mt-1 text-xs text-slate-500">Capture opt-in before sending campaigns.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <ConsentToggle
            label="Email"
            checked={emailConsent?.status === 'GRANTED'}
            onChange={(checked) => handleConsentToggle('EMAIL', checked)}
            loading={isPending}
          />
          <ConsentToggle
            label="SMS"
            checked={smsConsent?.status === 'GRANTED'}
            onChange={(checked) => handleConsentToggle('SMS', checked)}
            loading={isPending}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200/60 bg-white px-4 py-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <NotebookPen className="h-4 w-4 text-brand-500" />
            Add note
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Document the latest coaching insight or conversation snippet.
          </p>
          <textarea
            rows={4}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Summarize your touchpoint..."
            className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <button
            type="button"
            onClick={handleAddNote}
            disabled={isPending || !note.trim()}
            className="mt-3 inline-flex w-full items-center justify-center rounded-full bg-brand-600/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Log note
          </button>
        </div>

        <div className="rounded-xl border border-slate-200/60 bg-white px-4 py-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <CalendarClock className="h-4 w-4 text-brand-500" />
            Create task
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Queue the next outreach or follow-up reminder.
          </p>
          <input
            type="text"
            value={taskTitle}
            onChange={(event) => setTaskTitle(event.target.value)}
            placeholder="Follow-up action"
            className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Due by
            <input
              type="datetime-local"
              value={taskDueAt}
              onChange={(event) => setTaskDueAt(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <button
            type="button"
            onClick={handleCreateTask}
            disabled={isPending || !taskTitle.trim()}
            className="mt-3 inline-flex w-full items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Create task
          </button>
        </div>
      </div>

      {message && (
        <div className="rounded-full bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-700">
          {message}
        </div>
      )}

      <Link
        href="/deal-desk"
        className="inline-flex w-full items-center justify-center rounded-full border border-brand-200 bg-white px-4 py-2 text-sm font-semibold text-brand-600 transition hover:bg-brand-50"
      >
        Create offer in Deal Desk
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
    <button
      type="button"
      disabled={loading}
      onClick={() => onChange(!checked)}
      className={clsx(
        'inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition',
        checked
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-slate-200 bg-slate-100 text-slate-500 hover:border-brand-200 hover:text-brand-600',
        loading && 'opacity-60'
      )}
    >
      <span className={clsx('h-2 w-2 rounded-full', checked ? 'bg-emerald-500' : 'bg-slate-300')} />
      <span>{label}</span>
      <span className="text-[11px] font-medium text-slate-500">
        {checked ? 'Opted in' : 'Opt-in needed'}
      </span>
    </button>
  );
}
