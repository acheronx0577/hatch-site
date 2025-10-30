import React from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('@/lib/api/commission-plans', (): Record<string, unknown> => ({
  listCommissionPlans: vi.fn(),
  createCommissionPlan: vi.fn(),
  updateCommissionPlan: vi.fn()
}));

// eslint-disable-next-line import/first
import CommissionPlansPage from '@/app/commission-plans/page';
import { listCommissionPlans } from '@/lib/api/commission-plans';

const listMock = listCommissionPlans as vi.MockedFunction<typeof listCommissionPlans>;

beforeEach(() => {
  vi.clearAllMocks();
});

test('commission plans load more appends without duplicates', async () => {
  const planA = { id: 'cp-1', name: 'Plan A', brokerSplit: 0.3, agentSplit: 0.7 };
  const planB = { id: 'cp-2', name: 'Plan B', brokerSplit: 0.4, agentSplit: 0.6 };

  listMock
    .mockResolvedValueOnce({ items: [planA], nextCursor: 'cursor-2' })
    .mockResolvedValueOnce({ items: [planA, planB], nextCursor: null });

  const user = userEvent.setup();
  render(<CommissionPlansPage />);

  await waitFor(() => expect(screen.getByText('Plan A')).toBeInTheDocument());

  const loadMoreButton = await screen.findByRole('button', { name: /load more/i });
  await user.click(loadMoreButton);

  await waitFor(() => expect(screen.getByText('Plan B')).toBeInTheDocument());
  const planRows = screen.getAllByText(/Plan [AB]/);
  expect(planRows).toHaveLength(2);
  await waitFor(() => expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument());
});
