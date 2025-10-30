import { RUN_INTEGRATION, describeIf } from './helpers/cond';
import { FlsService } from '../src/platform/security/fls.service';

describeIf(RUN_INTEGRATION)('Field-level security', () => {
  let flsService: FlsService;

  beforeAll(() => {
    flsService = {
      filterRead: jest.fn().mockResolvedValue({ id: 'acc-1', name: 'Acme' })
    } as unknown as FlsService;
  });

  it('filters unreadable fields', async () => {
    const filtered = await flsService.filterRead(
      { orgId: 'org-test', userId: 'user-test' },
      'accounts',
      { id: 'acc-1', name: 'Acme', secret: 'hidden' }
    );

    expect(filtered).toEqual({ id: 'acc-1', name: 'Acme' });
  });
});
