"use client";

import { FormEvent, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Sparkles, Upload } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  fetchOnboardingState,
  onboardingChat,
  onboardingConfigure,
  onboardingSkip,
  onboardingComplete,
  onboardingUpload,
  type OnboardingAction,
  type OnboardingUploadType
} from '@/lib/api/onboarding-assistant';

const steps = [
  { key: 'profile', label: 'Profile' },
  { key: 'branding', label: 'Branding' },
  { key: 'compliance', label: 'Compliance' },
  { key: 'commissions', label: 'Commissions' },
  { key: 'portal', label: 'Portal' },
  { key: 'invites', label: 'Invites' }
] as const;

const queryKey = ['onboarding', 'state'];

export function OnboardingAssistantView() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');

  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const commissionInputRef = useRef<HTMLInputElement | null>(null);
  const rosterInputRef = useRef<HTMLInputElement | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: fetchOnboardingState,
    staleTime: 30_000
  });

  const state = data?.state;
  const progress = data?.progress;

  const conversation = state?.conversationHistory ?? [];
  const pendingActions = useMemo(() => {
    const pending = state?.pendingConfig as any;
    if (!pending || typeof pending !== 'object') return [];
    const actions = (pending as any).actions;
    return Array.isArray(actions) ? (actions as OnboardingAction[]) : [];
  }, [state?.pendingConfig]);

  const chatMutation = useMutation({
    mutationFn: () => onboardingChat(message),
    onSuccess: async () => {
      setMessage('');
      await queryClient.invalidateQueries({ queryKey });
    }
  });

  const configureMutation = useMutation({
    mutationFn: (actions: OnboardingAction[]) => onboardingConfigure(actions),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    }
  });

  const skipMutation = useMutation({
    mutationFn: (step: string) => onboardingSkip(step),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    }
  });

  const completeMutation = useMutation({
    mutationFn: () => onboardingComplete(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    }
  });

  const uploadMutation = useMutation({
    mutationFn: ({ type, file }: { type: OnboardingUploadType; file: File }) => onboardingUpload(type, file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    }
  });

  const handleChatSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!message.trim()) return;
    await chatMutation.mutateAsync();
  };

  const triggerUpload = (type: OnboardingUploadType) => {
    switch (type) {
      case 'logo':
        logoInputRef.current?.click();
        return;
      case 'commission_schedule':
        commissionInputRef.current?.click();
        return;
      case 'agent_roster':
        rosterInputRef.current?.click();
        return;
    }
  };

  const handleUploadFile = async (type: OnboardingUploadType, file?: File | null) => {
    if (!file) return;
    await uploadMutation.mutateAsync({ type, file });
  };

  const completed = new Set(progress?.completedSteps ?? []);
  const skipped = new Set(progress?.skippedSteps ?? []);
  const currentStep = progress?.currentStep ?? 'welcome';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Platform Setup</p>
        <h1 className="text-3xl font-semibold text-slate-900">Hatch Setup Assistant</h1>
        <p className="text-sm text-slate-500">
          Configure your brokerage in minutes with an AI-guided onboarding flow.
        </p>
      </div>

      <Card className="rounded-2xl border border-slate-100 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {steps.map((step) => {
              const isDone = completed.has(step.key) || skipped.has(step.key);
              const isActive = currentStep === step.key;
              return (
                <div
                  key={step.key}
                  className={[
                    'rounded-full px-3 py-1 text-xs font-medium',
                    isActive ? 'bg-slate-900 text-white' : isDone ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-600'
                  ].join(' ')}
                >
                  {step.label}
                </div>
              );
            })}
          </div>
          <div className="text-sm text-slate-500">
            {progress ? (
              <>
                Progress <span className="font-semibold text-slate-900">{progress.percent}%</span>
              </>
            ) : (
              'Loading progress…'
            )}
          </div>
        </div>
      </Card>

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Unable to load onboarding state. Please retry shortly.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2 rounded-2xl border border-slate-100 bg-white p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-600" />
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Chat</h2>
              <p className="text-sm text-slate-500">Ask questions, confirm changes, or upload files.</p>
            </div>
          </div>

          <div className="mt-4 h-[420px] space-y-3 overflow-auto rounded-xl border border-slate-100 bg-slate-50 p-3">
            {isLoading ? (
              <div className="text-sm text-slate-500">Loading conversation…</div>
            ) : conversation.length === 0 ? (
              <div className="text-sm text-slate-500">
                Start by telling me your brokerage name (e.g. “Sunshine Realty Group”).
              </div>
            ) : (
              conversation.map((entry, index) => (
                <div
                  key={`${entry.role}-${index}`}
                  className={[
                    'max-w-[92%] rounded-2xl px-3 py-2 text-sm',
                    entry.role === 'assistant'
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'ml-auto bg-slate-900 text-white'
                  ].join(' ')}
                >
                  {entry.content}
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleChatSubmit} className="mt-4 space-y-3">
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Type a message…"
              className="min-h-[90px] border-slate-200"
              disabled={chatMutation.isPending}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={chatMutation.isPending || !message.trim()}>
                {chatMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Thinking
                  </>
                ) : (
                  'Send'
                )}
              </Button>

              <Button type="button" variant="outline" onClick={() => triggerUpload('logo')} disabled={uploadMutation.isPending}>
                <Upload className="mr-2 h-4 w-4" />
                Upload logo
              </Button>
              <Button type="button" variant="outline" onClick={() => triggerUpload('commission_schedule')} disabled={uploadMutation.isPending}>
                <Upload className="mr-2 h-4 w-4" />
                Upload commission schedule
              </Button>
              <Button type="button" variant="outline" onClick={() => triggerUpload('agent_roster')} disabled={uploadMutation.isPending}>
                <Upload className="mr-2 h-4 w-4" />
                Upload agent roster
              </Button>
            </div>

            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(event) => handleUploadFile('logo', event.target.files?.[0] ?? null)}
            />
            <input
              ref={commissionInputRef}
              type="file"
              accept="application/pdf,text/plain"
              className="hidden"
              onChange={(event) => handleUploadFile('commission_schedule', event.target.files?.[0] ?? null)}
            />
            <input
              ref={rosterInputRef}
              type="file"
              accept="text/csv,text/plain,application/vnd.ms-excel"
              className="hidden"
              onChange={(event) => handleUploadFile('agent_roster', event.target.files?.[0] ?? null)}
            />
          </form>
        </Card>

        <Card className="lg:col-span-3 rounded-2xl border border-slate-100 bg-white p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Preview & Pending Changes</h2>
              <p className="text-sm text-slate-500">Review AI-suggested configuration before applying.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={skipMutation.isPending || currentStep === 'welcome' || currentStep === 'done'}
                onClick={() => skipMutation.mutate(currentStep)}
              >
                Skip step
              </Button>
              <Button
                type="button"
                disabled={completeMutation.isPending || state?.status === 'completed'}
                onClick={() => completeMutation.mutate()}
              >
                Mark complete
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Pending Actions</p>
              {pendingActions.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">No pending changes. Ask the assistant to propose a setup step.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {pendingActions.map((action, idx) => (
                    <div key={`${action.type}-${action.target}-${idx}`} className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">
                          {action.type} {action.target ? `· ${action.target}` : ''}
                        </p>
                        <span className="text-xs text-slate-500">
                          {action.requiresConfirmation ? 'Needs confirmation' : 'Ready'}
                        </span>
                      </div>
                      {action.value !== undefined ? (
                        <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-slate-50 p-2 text-xs text-slate-700">
                          {JSON.stringify(action.value, null, 2)}
                        </pre>
                      ) : null}
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={configureMutation.isPending}
                      onClick={() => configureMutation.mutate(pendingActions)}
                    >
                      Apply pending changes
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={configureMutation.isPending}
                      onClick={() => configureMutation.mutate([])}
                    >
                      Discard
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Current State</p>
              {state ? (
                <div className="mt-2 space-y-2">
                  <div className="text-sm text-slate-700">
                    <span className="font-semibold text-slate-900">Step:</span> {state.currentStep}
                  </div>
                  <div className="text-sm text-slate-700">
                    <span className="font-semibold text-slate-900">Status:</span> {state.status}
                  </div>
                  <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-white p-2 text-xs text-slate-700">
                    {JSON.stringify(
                      {
                        completedSteps: state.completedSteps,
                        skippedSteps: state.skippedSteps
                      },
                      null,
                      2
                    )}
                  </pre>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-600">State unavailable.</p>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
