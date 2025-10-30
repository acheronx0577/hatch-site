import { UserRole } from '@hatch/db';

import { LayoutsService } from '../../src/modules/layouts/layouts.service';
import type { RequestContext } from '../../src/modules/common/request-context';

const baseContext: RequestContext = {
  userId: 'user-test',
  tenantId: 'tenant-test',
  role: UserRole.AGENT,
  teamIds: [],
  allowTeamContactActions: true,
  orgId: 'org-test'
};

const createService = (allowedFields: string[] = []) => {
  const prismaStub = {} as any;
  const flsStub = {
    readableSet: jest.fn(async () => new Set(allowedFields))
  } as any;
  const service = new LayoutsService(prismaStub, flsStub);
  return { service, prismaStub, flsStub };
};

describe('LayoutsService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('falls back to baseline fields when no layout is configured', async () => {
    const { service, flsStub } = createService(['name', 'website']);
    jest
      .spyOn<any, any>(service as any, 'findLayoutCandidates')
      .mockResolvedValue([null, null, null, null]);

    const manifest = await service.resolve(baseContext, { object: 'accounts', kind: 'list' });

    expect(flsStub.readableSet).toHaveBeenCalled();
    expect(manifest.object).toBe('accounts');
    expect(manifest.fields.map((field) => field.field)).toEqual(['name', 'website']);
  });

  it('prefers recordType+profile over other layouts and intersects with FLS', async () => {
    const { service, flsStub } = createService(['name', 'amount']);

    jest
      .spyOn<any, any>(service as any, 'findLayoutCandidates')
      .mockResolvedValue([
        {
          fields: [
            { field: 'name', label: null, visible: true, order: 0, width: null },
            { field: 'owner', label: null, visible: true, order: 1, width: null }
          ]
        },
        {
          fields: [
            { field: 'amount', label: null, visible: true, order: 0, width: null }
          ]
        },
        null,
        null
      ] as any);

    const manifest = await service.resolve(baseContext, { object: 'opportunities', kind: 'list' });

    expect(flsStub.readableSet).toHaveBeenCalled();
    expect(manifest.fields.map((field) => field.field)).toEqual(['name', 'amount']);
  });

  it('appends allowed-but-missing fields from baseline', async () => {
    const { service } = createService(['primaryEmail', 'primaryPhone']);

    jest
      .spyOn<any, any>(service as any, 'findLayoutCandidates')
      .mockResolvedValue([
        {
          fields: [
            { field: 'primaryEmail', label: null, visible: true, order: 0, width: null }
          ]
        }
      ] as any);

    const manifest = await service.resolve(baseContext, { object: 'contacts', kind: 'list' });

    expect(manifest.fields.map((field) => field.field)).toEqual(['primaryEmail', 'primaryPhone']);
  });
});
