import { describe, it, expect } from '@jest/globals';

import { ApiClient } from '../src/client';
import { AccountsApi } from '../src/apis/AccountsApi';

const RUN = process.env.RUN_SDK_TESTS === 'true';

const describeIf = RUN ? describe : describe.skip;

describeIf('SDK smoke surface', () => {
  it('exposes API helpers without invoking the network', () => {
    const client = new ApiClient({ baseUrl: 'https://example.com' });
    const accounts = new AccountsApi(client);

    expect(typeof accounts.listAccounts).toBe('function');
    expect(() => accounts.listAccounts({ query: {} })).not.toThrow();
  });
});
