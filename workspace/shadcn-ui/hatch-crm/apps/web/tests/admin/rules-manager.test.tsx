import React from 'react';

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';

let setTimeoutSpy: ReturnType<typeof vi.spyOn> | null = null;
let clearTimeoutSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeAll(() => {
  setTimeoutSpy = vi.spyOn(window, 'setTimeout').mockImplementation(((handler: TimerHandler) => {
    if (typeof handler === 'function') {
      handler();
    }
    return 0 as unknown as number;
  }) as typeof window.setTimeout);

  clearTimeoutSpy = vi.spyOn(window, 'clearTimeout').mockImplementation(() => {});
});

afterAll(() => {
  setTimeoutSpy?.mockRestore();
  clearTimeoutSpy?.mockRestore();
});

vi.mock('@/lib/api/admin.rules', (): Record<string, unknown> => ({
  listValidationRules: vi.fn(),
  listAssignmentRules: vi.fn(() => Promise.resolve({ items: [], nextCursor: null })),
  createValidationRule: vi.fn(),
  updateValidationRule: vi.fn(),
  deleteValidationRule: vi.fn(),
  createAssignmentRule: vi.fn(),
  updateAssignmentRule: vi.fn(),
  deleteAssignmentRule: vi.fn()
}));

// eslint-disable-next-line import/first
import { RulesManager } from '@/app/admin/rules/components/rules-manager';
import { listValidationRules, createValidationRule } from '@/lib/api/admin.rules';

const listMock = listValidationRules as vi.MockedFunction<typeof listValidationRules>;
const createMock = createValidationRule as vi.MockedFunction<typeof createValidationRule>;

beforeEach(() => {
  vi.clearAllMocks();
  listMock.mockReset();
  createMock.mockReset();
});

test.skip('rules manager load more appends without duplicates', async () => {
  const ruleA = {
    id: 'rule-a',
    name: 'Rule A',
    object: 'cases',
    active: true,
    dsl: {},
    orgId: 'org',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const ruleB = { ...ruleA, id: 'rule-b', name: 'Rule B' };

  listMock
    .mockResolvedValueOnce({ items: [ruleA], nextCursor: 'cursor-2' })
    .mockResolvedValueOnce({ items: [ruleA, ruleB], nextCursor: null });

  const user = userEvent.setup();
  render(<RulesManager type="validation" initialItems={[]} initialNextCursor={null} />);

  await waitFor(() => expect(screen.getByText('Rule A')).toBeInTheDocument());

  await screen.findByRole('button', { name: /load more/i });
  await user.click(screen.getByRole('button', { name: /load more/i }));

  await waitFor(() => expect(screen.getByText('Rule B')).toBeInTheDocument());

  const table = screen.getByRole('table');
  const bodyRows = within(table).getAllByRole('row').slice(1); // drop header
  expect(bodyRows).toHaveLength(2);
  await waitFor(() => expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument());
});

test.skip('rules manager shows validation errors for invalid JSON', async () => {
  listMock.mockResolvedValue({ items: [], nextCursor: null });

  const user = userEvent.setup();
  render(<RulesManager type="validation" initialItems={[]} initialNextCursor={null} />);

  await waitFor(() => expect(listMock).toHaveBeenCalled());

  await user.click(screen.getByRole('button', { name: /new rule/i }));

  const textarea = screen.getByRole('textbox', { name: /rule dsl/i });
  await user.clear(textarea);
  await user.type(textarea, 'not json');

  await user.click(screen.getByRole('button', { name: /save rule/i }));

  await waitFor(() =>
    expect(screen.getByText(/dsl must be valid json/i)).toBeInTheDocument()
  );
  expect(createMock).not.toHaveBeenCalled();
});
