"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { HelpCircle, Loader2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  askDuringWalkthrough,
  getStepGuidance,
  validateWalkthroughStep,
  type StepGuidance,
  type StepValidation,
  type WalkthroughExpectedAction,
  type WalkthroughSession
} from '@/lib/api/training-assistant';

type HighlightRect = { top: number; left: number; width: number; height: number };

export function InteractiveWalkthrough(props: { session: WalkthroughSession; onExit?: () => void }) {
  const session = props.session;
  const [stepIndex, setStepIndex] = useState<number>(session.currentStep ?? 0);
  const [completedStepIds, setCompletedStepIds] = useState<string[]>([]);
  const [lastValidation, setLastValidation] = useState<StepValidation | null>(null);
  const [askText, setAskText] = useState('');
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [rect, setRect] = useState<HighlightRect | null>(null);

  const step = session.steps[stepIndex] ?? null;
  const stepKey = step ? `${session.sessionId}:${step.id}:${stepIndex}` : `${session.sessionId}:done`;

  useEffect(() => {
    setStepIndex(session.currentStep ?? 0);
    setCompletedStepIds([]);
    setLastValidation(null);
    setAskAnswer(null);
    setAskText('');
  }, [session.currentStep, session.sessionId]);

  const guidanceQuery = useQuery({
    queryKey: ['training', 'walkthrough', session.sessionId, stepIndex, completedStepIds.join('|')],
    queryFn: async (): Promise<StepGuidance> => {
      if (!step) {
        throw new Error('No active step');
      }
      return getStepGuidance({
        sessionId: session.sessionId,
        stepIndex,
        completedSteps: completedStepIds
      });
    },
    enabled: Boolean(step),
    staleTime: 0
  });

  const askMutation = useMutation({
    mutationFn: (question: string) => askDuringWalkthrough({ sessionId: session.sessionId, question })
  });

  const validateMutation = useMutation({
    mutationFn: (payload: { stepIndex: number; userAction: unknown; resultingState?: unknown }) =>
      validateWalkthroughStep({
        sessionId: session.sessionId,
        stepIndex: payload.stepIndex,
        userAction: payload.userAction,
        resultingState: payload.resultingState
      })
  });

  const isDone = stepIndex >= session.steps.length;

  useEffect(() => {
    setLastValidation(null);
    setAskAnswer(null);
    setAskText('');
  }, [stepKey]);

  const targetSelector = step?.targetSelector ?? '';

  const resolveTargetEl = useCallback(() => {
    if (!targetSelector) return null;
    try {
      return document.querySelector(targetSelector) as HTMLElement | null;
    } catch {
      return null;
    }
  }, [targetSelector]);

  const updateRect = useCallback(() => {
    const el = resolveTargetEl();
    if (!el) {
      setRect(null);
      return;
    }
    const box = el.getBoundingClientRect();
    setRect({
      top: Math.max(0, box.top),
      left: Math.max(0, box.left),
      width: Math.max(0, box.width),
      height: Math.max(0, box.height)
    });
  }, [resolveTargetEl]);

  useEffect(() => {
    if (!step) return;
    updateRect();
    const el = resolveTargetEl();
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }

    const onResize = () => updateRect();
    const onScroll = () => updateRect();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    const interval = window.setInterval(updateRect, 400);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
      window.clearInterval(interval);
    };
  }, [stepKey, resolveTargetEl, step, updateRect]);

  const exit = useCallback(() => {
    props.onExit?.();
  }, [props]);

  useEffect(() => {
    if (isDone) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        exit();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [exit, isDone, stepKey]);

  const tryAdvance = useCallback(
    async (action: WalkthroughExpectedAction & { value?: string }) => {
      if (!step) return;
      if (validateMutation.isPending) return;

      setLastValidation(null);

      const result = await validateMutation.mutateAsync({
        stepIndex,
        userAction: action,
        resultingState: undefined
      });

      setLastValidation(result);

      if (!result.passed) {
        return;
      }

      const next = typeof result.nextStep === 'number' ? result.nextStep : stepIndex + 1;
      setCompletedStepIds((prev) => (step && prev.includes(step.id) ? prev : step ? [...prev, step.id] : prev));
      setStepIndex(next);
      if (next >= session.steps.length) {
        props.onExit?.();
      }
    },
    [props, session.steps.length, step, stepIndex, validateMutation]
  );

  useEffect(() => {
    if (!step) return;

    const expected = step.expectedAction;
    const target = resolveTargetEl();
    if (!target) return;

    const handleClick = (event: MouseEvent) => {
      if (expected.type !== 'click') return;
      const node = event.target as Node | null;
      if (!node) return;
      if (!target.contains(node)) return;
      void tryAdvance({ type: 'click', target: expected.target });
    };

    const handleChange = (event: Event) => {
      const node = event.target as Node | null;
      if (!node) return;
      if (!target.contains(node)) return;

      if (expected.type === 'input') {
        const el = event.target as HTMLInputElement | HTMLTextAreaElement | null;
        const value = el && typeof (el as any).value === 'string' ? (el as any).value : '';
        const min = typeof expected.minLength === 'number' ? expected.minLength : 0;
        if (min > 0 && value.trim().length < min) return;
        void tryAdvance({ type: 'input', target: expected.target, value });
        return;
      }

      if (expected.type === 'form-complete') {
        const inputs = Array.from(target.querySelectorAll('input, textarea, select')) as Array<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >;
        const allFilled = inputs.length === 0 ? true : inputs.every((input) => String((input as any).value ?? '').trim().length > 0);
        if (!allFilled) return;
        void tryAdvance({ type: 'form-complete', target: expected.target });
      }
    };

    document.addEventListener('click', handleClick, true);
    document.addEventListener('change', handleChange, true);
    return () => {
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('change', handleChange, true);
    };
  }, [resolveTargetEl, step, stepKey, tryAdvance]);

  const tooltipPlacement = useMemo(() => {
    if (!rect || !step) {
      return { top: 16, left: 16, transform: 'none' as const };
    }
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const offset = 14;

    switch (step.tooltipPosition) {
      case 'top':
        return { top: rect.top - offset, left: centerX, transform: 'translate(-50%, -100%)' as const };
      case 'bottom':
        return { top: rect.top + rect.height + offset, left: centerX, transform: 'translate(-50%, 0)' as const };
      case 'left':
        return { top: centerY, left: rect.left - offset, transform: 'translate(-100%, -50%)' as const };
      case 'right':
      default:
        return { top: centerY, left: rect.left + rect.width + offset, transform: 'translate(0, -50%)' as const };
    }
  }, [rect, step]);

  const highlightClass = useMemo(() => {
    switch (step?.highlightType) {
      case 'pulse':
        return 'ring-4 ring-indigo-400/70 animate-pulse';
      case 'spotlight':
        return 'ring-4 ring-indigo-500/70 shadow-[0_0_0_9999px_rgba(15,23,42,0.55)]';
      case 'outline':
      default:
        return 'ring-4 ring-indigo-400/70';
    }
  }, [step?.highlightType]);

  if (isDone) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {rect ? (
        <div
          className={[
            'fixed rounded-xl transition-all duration-150',
            highlightClass
          ].join(' ')}
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-slate-950/30" />
      )}

      <div
        className="fixed pointer-events-auto"
        style={{
          top: tooltipPlacement.top,
          left: tooltipPlacement.left,
          transform: tooltipPlacement.transform,
          width: 380,
          maxWidth: 'calc(100vw - 24px)'
        }}
      >
        <Card className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Step {stepIndex + 1} of {session.totalSteps}
              </div>
              <div className="mt-1 truncate text-base font-semibold text-slate-900">{step?.title}</div>
            </div>
            <Button size="icon" variant="ghost" onClick={exit} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-3 space-y-2 text-sm text-slate-700">
            {guidanceQuery.isLoading ? (
              <div className="flex items-center gap-2 text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Generating instruction…
              </div>
            ) : guidanceQuery.data?.instruction ? (
              <div className="whitespace-pre-wrap">{guidanceQuery.data.instruction}</div>
            ) : (
              <div className="text-slate-500">Instruction not available.</div>
            )}

            {rect ? null : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Target element not found: <span className="font-mono">{targetSelector}</span>
              </div>
            )}
          </div>

          {lastValidation && !lastValidation.passed ? (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
              <div className="font-semibold">Not quite</div>
              <div className="mt-1 whitespace-pre-wrap text-rose-800">{lastValidation.feedback}</div>
              {lastValidation.hint ? <div className="mt-2 text-xs text-rose-700">Hint: {lastValidation.hint}</div> : null}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (!step) return;
                const question = `Why does "${step.title}" matter?`;
                setAskAnswer(null);
                const response = await askMutation.mutateAsync(question);
                setAskAnswer(response.answer);
              }}
              disabled={askMutation.isPending}
            >
              {askMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <HelpCircle className="mr-2 h-4 w-4" />}
              Why?
            </Button>

            {guidanceQuery.data?.canSkip ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStepIndex((idx) => Math.min(session.steps.length, idx + 1))}
              >
                Skip
              </Button>
            ) : null}

            <Button
              size="sm"
              onClick={async () => {
                if (!step) return;
                const expected = step.expectedAction;
                if (expected.type === 'click') {
                  await tryAdvance({ type: 'click', target: expected.target });
                  return;
                }
                if (expected.type === 'input') {
                  const el = resolveTargetEl() as HTMLInputElement | HTMLTextAreaElement | null;
                  const value = el && typeof (el as any).value === 'string' ? String((el as any).value) : '';
                  await tryAdvance({ type: 'input', target: expected.target, value });
                  return;
                }
                await tryAdvance({ type: 'form-complete', target: expected.target });
              }}
              disabled={validateMutation.isPending}
            >
              {validateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Check step
            </Button>
          </div>

          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Ask a question</div>
            <div className="mt-2 space-y-2">
              <Textarea
                value={askText}
                onChange={(event) => setAskText(event.target.value)}
                placeholder="Ask about this step…"
                className="min-h-[68px]"
                disabled={askMutation.isPending}
              />
              <div className="flex items-center justify-between gap-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    const q = askText.trim();
                    if (!q) return;
                    setAskAnswer(null);
                    const response = await askMutation.mutateAsync(q);
                    setAskAnswer(response.answer);
                  }}
                  disabled={askMutation.isPending || !askText.trim()}
                >
                  {askMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Ask Hatch
                </Button>
                <div className="text-xs text-slate-500">Esc to exit</div>
              </div>
              {askAnswer ? (
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-800 whitespace-pre-wrap">
                  {askAnswer}
                </div>
              ) : null}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
