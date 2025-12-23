"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CircleHelp, Loader2, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { askPageHelp, explainField, type ExplainFieldResponse } from '@/lib/api/contextual-help';

type HelpMode = 'page' | 'field';

type HelpMessage = { role: 'user' | 'assistant'; content: string; at: string };

type FieldHelpParams = { fieldPath: string; question?: string; currentValue?: string | null };

type ContextValue = {
  open: boolean;
  openPageHelp: () => void;
  openFieldHelp: (params: FieldHelpParams) => void;
  close: () => void;
};

const ContextualHelpContext = createContext<ContextValue | null>(null);

export function useContextualHelp(): ContextValue {
  const ctx = useContext(ContextualHelpContext);
  if (!ctx) {
    throw new Error('useContextualHelp must be used within ContextualHelpProvider');
  }
  return ctx;
}

export function ContextualHelpProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/';

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<HelpMode>('page');

  const [pageMessages, setPageMessages] = useState<HelpMessage[]>([]);
  const [pageQuestion, setPageQuestion] = useState('');

  const [fieldParams, setFieldParams] = useState<FieldHelpParams | null>(null);
  const [fieldResponse, setFieldResponse] = useState<ExplainFieldResponse | null>(null);
  const [fieldQuestion, setFieldQuestion] = useState('');

  const askMutation = useMutation({
    mutationFn: (question: string) => askPageHelp({ pagePath: pathname, question })
  });

  const explainMutation = useMutation({
    mutationFn: (params: FieldHelpParams) => explainField(params)
  });

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const openPageHelp = useCallback(() => {
    setMode('page');
    setFieldParams(null);
    setFieldResponse(null);
    setFieldQuestion('');
    setOpen(true);
  }, []);

  const openFieldHelp = useCallback((params: FieldHelpParams) => {
    setMode('field');
    setFieldParams(params);
    setFieldResponse(null);
    setFieldQuestion(params.question ?? '');
    setOpen(true);
  }, []);

  const lastAutoExplainKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open || mode !== 'field' || !fieldParams?.fieldPath) return;

    const key = `${fieldParams.fieldPath}::${fieldParams.question ?? ''}::${fieldParams.currentValue ?? ''}`;
    if (lastAutoExplainKeyRef.current === key) return;
    lastAutoExplainKeyRef.current = key;

    explainMutation
      .mutateAsync(fieldParams)
      .then((response) => setFieldResponse(response))
      .catch(() => setFieldResponse(null));
  }, [open, mode, fieldParams, explainMutation]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      const isHelp =
        modifier && (event.key === '?' || (event.key === '/' && event.shiftKey));
      if (!isHelp) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) {
        return;
      }

      event.preventDefault();
      openPageHelp();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openPageHelp]);

  const submitPageQuestion = async () => {
    const question = pageQuestion.trim();
    if (!question || askMutation.isPending) return;

    setPageQuestion('');
    setPageMessages((prev) => [
      ...prev,
      { role: 'user', content: question, at: new Date().toISOString() }
    ]);

    try {
      const response = await askMutation.mutateAsync(question);
      const suffix = response.suggestedActions?.length
        ? `\n\nSuggested actions:\n${response.suggestedActions.map((item) => `- ${item}`).join('\n')}`
        : '';
      setPageMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `${response.answer}${suffix}`.trim(), at: new Date().toISOString() }
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to fetch help right now.';
      setPageMessages((prev) => [
        ...prev,
        { role: 'assistant', content: message, at: new Date().toISOString() }
      ]);
    }
  };

  const submitFieldQuestion = async () => {
    const fieldPath = fieldParams?.fieldPath?.trim() ?? '';
    const question = fieldQuestion.trim();
    if (!fieldPath || !question || explainMutation.isPending) return;

    try {
      const response = await explainMutation.mutateAsync({
        fieldPath,
        question,
        currentValue: fieldParams?.currentValue ?? null
      });
      setFieldResponse(response);
    } catch {
      // leave existing response intact
    }
  };

  const ctxValue = useMemo<ContextValue>(
    () => ({ open, openPageHelp, openFieldHelp, close }),
    [open, openPageHelp, openFieldHelp, close]
  );

  const title = mode === 'page' ? 'Ask Hatch' : 'Why does this exist?';
  const description =
    mode === 'page'
      ? 'Ask questions about the page you’re on (Cmd/Ctrl + ?).'
      : fieldParams?.fieldPath
        ? `Field: ${fieldParams.fieldPath}`
        : 'Explain a field or requirement.';

  return (
    <ContextualHelpContext.Provider value={ctxValue}>
      {children}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[92vw] sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <CircleHelp className="h-5 w-5 text-indigo-600" />
              {title}
            </SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>

          {mode === 'page' ? (
            <div className="mt-4 flex h-[70vh] flex-col gap-3">
              <div className="flex-1 overflow-auto rounded-xl border border-slate-100 bg-slate-50 p-3">
                {pageMessages.length === 0 ? (
                  <div className="space-y-2 text-sm text-slate-600">
                    <p>Try asking:</p>
                    <ul className="list-disc space-y-1 pl-5">
                      <li>“Why do we collect this info?”</li>
                      <li>“What happens if I leave this blank?”</li>
                      <li>“What’s best practice for this page?”</li>
                    </ul>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pageMessages.map((message, idx) => (
                      <div
                        key={`${message.role}-${idx}-${message.at}`}
                        className={[
                          'max-w-[92%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm',
                          message.role === 'assistant'
                            ? 'bg-white text-slate-800 shadow-sm'
                            : 'ml-auto bg-slate-900 text-white'
                        ].join(' ')}
                      >
                        {message.content}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-end gap-2">
                <Textarea
                  value={pageQuestion}
                  onChange={(event) => setPageQuestion(event.target.value)}
                  placeholder="Ask about this page…"
                  className="min-h-[54px] resize-none"
                  disabled={askMutation.isPending}
                />
                <Button onClick={submitPageQuestion} disabled={askMutation.isPending || !pageQuestion.trim()}>
                  {askMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex h-[70vh] flex-col gap-3">
              <div className="flex-1 overflow-auto rounded-xl border border-slate-100 bg-slate-50 p-3">
                {explainMutation.isPending && !fieldResponse ? (
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Loader2 className="h-4 w-4 animate-spin" /> Generating explanation…
                  </div>
                ) : fieldResponse?.explanation ? (
                  <div className="space-y-4">
                    <div className="whitespace-pre-wrap text-sm text-slate-800">{fieldResponse.explanation}</div>

                    {fieldResponse.learnMoreLinks?.length ? (
                      <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Learn more</div>
                        <div className="flex flex-wrap gap-2">
                          {fieldResponse.learnMoreLinks.map((href) => (
                            <Button key={href} variant="outline" size="sm" asChild>
                              {href.startsWith('http') ? (
                                <a href={href} target="_blank" rel="noreferrer">
                                  {href}
                                </a>
                              ) : (
                                <Link href={href}>{href}</Link>
                              )}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {fieldResponse.relatedHelp?.length ? (
                      <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Related fields</div>
                        <div className="flex flex-col gap-2">
                          {fieldResponse.relatedHelp.map((item) => (
                            <Button
                              key={item.fieldPath}
                              variant="outline"
                              size="sm"
                              className="justify-start"
                              onClick={() => openFieldHelp({ fieldPath: item.fieldPath })}
                            >
                              <span className="font-medium">{item.meta.label}</span>
                              <span className="ml-2 text-xs text-slate-500">{item.fieldPath}</span>
                            </Button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="text-sm text-slate-600">
                    Ask Hatch to explain why this field exists.
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ask a follow-up</div>
                <div className="flex items-center gap-2">
                  <Input
                    value={fieldQuestion}
                    onChange={(event) => setFieldQuestion(event.target.value)}
                    placeholder="e.g. Is this legally required in Florida?"
                    disabled={explainMutation.isPending}
                  />
                  <Button onClick={submitFieldQuestion} disabled={explainMutation.isPending || !fieldParams?.fieldPath || !fieldQuestion.trim()}>
                    {explainMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </ContextualHelpContext.Provider>
  );
}

export function ContextualHelpTrigger(props: { fieldPath: string; question?: string; currentValue?: string | null; className?: string }) {
  const { openFieldHelp } = useContextualHelp();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={props.className}
      onClick={() => openFieldHelp({ fieldPath: props.fieldPath, question: props.question, currentValue: props.currentValue ?? null })}
      aria-label={`Explain ${props.fieldPath}`}
    >
      <CircleHelp className="h-4 w-4" />
    </Button>
  );
}

