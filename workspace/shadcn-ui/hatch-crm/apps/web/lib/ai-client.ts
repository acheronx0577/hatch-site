import type { CopilotCitation, CopilotSnippet } from '@/types/copilot';

export type CopilotChatResponse = {
  messages: Array<{ role: string; content: string }>;
  citations?: CopilotCitation[];
  snippets?: CopilotSnippet[];
};

export type StreamCopilotEvent =
  | { type: 'delta'; delta: string }
  | { type: 'done'; citations?: CopilotCitation[]; snippets?: CopilotSnippet[] }
  | { type: 'error'; error: string };

export async function copilotChat(
  body: {
    threadId?: string;
    messages: Array<{ role: string; content: string }>;
    context?: Record<string, unknown>;
  },
  options?: { signal?: AbortSignal }
): Promise<CopilotChatResponse> {
  const res = await fetch('/api/v1/ai/copilot/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ ...body, stream: false }),
    signal: options?.signal
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json() as Promise<CopilotChatResponse>;
}

export async function* streamCopilotChat(
  body: {
    threadId?: string;
    messages: Array<{ role: string; content: string }>;
    context?: Record<string, unknown>;
  },
  options?: { signal?: AbortSignal }
): AsyncGenerator<StreamCopilotEvent, void, unknown> {
  const res = await fetch('/api/v1/ai/copilot/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ ...body, stream: true }),
    signal: options?.signal
  });

  if (!res.ok || !res.body) {
    const message = await res.text().catch(() => 'Failed to start stream');
    yield { type: 'error', error: message };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      if (!part.startsWith('data:')) continue;
      const payload = part.replace(/^data:\s*/, '').trim();
      if (!payload || payload === '[DONE]') {
        continue;
      }
      let parsed: any;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }
      if (parsed.error) {
        yield { type: 'error', error: parsed.error };
      } else if (parsed.done) {
        yield { type: 'done', citations: parsed.citations ?? [], snippets: parsed.snippets ?? [] };
      } else if (parsed.delta) {
        yield { type: 'delta', delta: parsed.delta };
      }
    }
  }
}
