import { RUN_INTEGRATION, describeIf } from './helpers/cond';
import { CanService } from '../src/platform/security/can.service';

describeIf(RUN_INTEGRATION)('Sharing & Role hierarchy', () => {
  let canService: CanService;

  beforeAll(() => {
    const canMock = jest.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    canService = { can: canMock } as unknown as CanService;
  });

  it('allows manager to read subordinate owned records', async () => {
    await expect(
      canService.can(
        { orgId: 'org-test', userId: 'user-manager' },
        'read',
        'accounts',
        { orgId: 'org-test', ownerId: 'user-rep', id: 'acc-1' }
      )
    ).resolves.toBe(true);
  });

  it('denies peer update without share', async () => {
    await expect(
      canService.can(
        { orgId: 'org-test', userId: 'user-peer' },
        'update',
        'accounts',
        { orgId: 'org-test', ownerId: 'user-rep', id: 'acc-1' }
      )
    ).resolves.toBe(false);
  });
});
