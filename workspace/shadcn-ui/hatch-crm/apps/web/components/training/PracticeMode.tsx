"use client";

import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Loader2, RefreshCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { checkPractice, generatePracticeScenario, type PracticeResult, type PracticeScenario } from '@/lib/api/training-assistant';

function safeJsonParse(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function newSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `practice_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

export function PracticeMode(props: { feature: string }) {
  const [difficulty, setDifficulty] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  const [sessionId, setSessionId] = useState<string>(() => newSessionId());
  const [scenario, setScenario] = useState<PracticeScenario | null>(null);
  const [submissionText, setSubmissionText] = useState<string>('{}');
  const [result, setResult] = useState<PracticeResult | null>(null);

  const generateMutation = useMutation({
    mutationFn: () =>
      generatePracticeScenario({
        feature: props.feature,
        difficulty
      }),
    onSuccess: (data) => {
      setScenario(data);
      setSubmissionText(JSON.stringify({ feature: props.feature, notes: '' }, null, 2));
      setResult(null);
      setSessionId(newSessionId());
    }
  });

  const checkMutation = useMutation({
    mutationFn: (submission?: Record<string, unknown>) => checkPractice({ sessionId, submission }),
    onSuccess: (data) => setResult(data)
  });

  const parsedSubmission = useMemo(() => safeJsonParse(submissionText), [submissionText]);

  const reset = () => {
    setScenario(null);
    setSubmissionText('{}');
    setResult(null);
    setSessionId(newSessionId());
  };

  return (
    <Card className="rounded-2xl border border-slate-100 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Practice mode</div>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">Sandbox</h2>
          <p className="mt-1 text-sm text-slate-500">
            Generate a scenario and practice safely. Session: <span className="font-mono">{sessionId}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={reset}>
            <RefreshCcw className="mr-2 h-4 w-4" /> Reset
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="text-sm font-medium text-slate-700">Difficulty:</div>
        {(['beginner', 'intermediate', 'advanced'] as const).map((level) => (
          <Button
            key={level}
            size="sm"
            variant={difficulty === level ? 'default' : 'outline'}
            onClick={() => setDifficulty(level)}
          >
            {level}
          </Button>
        ))}
        <Button
          size="sm"
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending || !props.feature.trim()}
        >
          {generateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Generate scenario
        </Button>
      </div>

      {generateMutation.isError ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Unable to generate a practice scenario right now.
        </div>
      ) : null}

      {scenario ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3 space-y-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">{scenario.scenarioTitle}</div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{scenario.situation}</div>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Goal</div>
              <div className="mt-1 text-sm text-slate-800">{scenario.goal}</div>
              {scenario.successCriteria?.length ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {scenario.successCriteria.map((item, idx) => (
                    <li key={`${idx}-${item}`}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="rounded-xl border border-slate-100 bg-white p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Your submission</div>
              <Textarea
                value={submissionText}
                onChange={(event) => setSubmissionText(event.target.value)}
                className="mt-2 min-h-[140px] font-mono text-xs"
              />
              {parsedSubmission ? null : (
                <div className="mt-2 text-xs text-rose-700">Submission must be valid JSON.</div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => checkMutation.mutate(parsedSubmission ?? undefined)}
                  disabled={checkMutation.isPending || !parsedSubmission}
                >
                  {checkMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  Check my work
                </Button>
              </div>

              {result ? (
                <div
                  className={[
                    'mt-3 rounded-xl border px-3 py-2 text-sm',
                    result.passed ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'
                  ].join(' ')}
                >
                  <div className="font-semibold">{result.passed ? 'Passed' : 'Needs work'}</div>
                  <div className="mt-1 whitespace-pre-wrap">{result.feedback}</div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-3">
            <div className="rounded-xl border border-slate-100 bg-white p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Sample data</div>
              <pre className="mt-2 max-h-[320px] overflow-auto rounded-lg bg-slate-50 p-2 text-xs text-slate-800">
                {JSON.stringify(scenario.sampleData ?? {}, null, 2)}
              </pre>
            </div>

            {scenario.hints?.length ? (
              <div className="rounded-xl border border-slate-100 bg-white p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Hints</div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {scenario.hints.map((hint, idx) => (
                    <li key={`${idx}-${hint}`}>{hint}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-600">
          Generate a scenario to begin.
        </div>
      )}
    </Card>
  );
}

