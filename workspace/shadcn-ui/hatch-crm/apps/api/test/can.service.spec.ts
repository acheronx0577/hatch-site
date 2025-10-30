import { ShareGranteeType } from '@hatch/db';

import { CanService } from '../src/platform/security/can.service';

describe('CanService', () => {
  const userOrgMembershipFindUnique = jest.fn();
  const permissionSetAssignmentFindMany = jest.fn();
  const objectPermissionFindMany = jest.fn();
  const recordShareFindFirst = jest.fn();
  const recordShareFindMany = jest.fn();
  const teamMembershipFindFirst = jest.fn();
  const roleFindUnique = jest.fn();

  const prismaMock: any = {
    userOrgMembership: { findUnique: userOrgMembershipFindUnique },
    permissionSetAssignment: { findMany: permissionSetAssignmentFindMany },
    objectPermission: { findMany: objectPermissionFindMany },
    recordShare: { findFirst: recordShareFindFirst, findMany: recordShareFindMany },
    teamMembership: { findFirst: teamMembershipFindFirst },
    role: { findUnique: roleFindUnique }
  };

  let service: CanService;

  beforeEach(() => {
    service = new CanService(prismaMock);

    userOrgMembershipFindUnique.mockImplementation(({ where }: any) => {
      const { userId, orgId } = where.userId_orgId;
      if (orgId !== 'org-a') {
        return null;
      }
      if (userId === 'viewer') {
        return { isOrgAdmin: false, profileId: 'profile-viewer', roleId: null };
      }
      if (userId === 'owner') {
        return { isOrgAdmin: false, profileId: null, roleId: null };
      }
      return null;
    });

    permissionSetAssignmentFindMany.mockResolvedValue([]);

    objectPermissionFindMany.mockResolvedValue([
      { canCreate: false, canRead: true, canUpdate: true, canDelete: false }
    ]);

    recordShareFindFirst.mockResolvedValue(null);
    recordShareFindMany.mockResolvedValue([]);
    teamMembershipFindFirst.mockResolvedValue(null);
    roleFindUnique.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('denies access when org IDs differ', async () => {
    const allowed = await service.can(
      { orgId: 'org-a', userId: 'viewer' },
      'read',
      'accounts',
      { orgId: 'org-b', ownerId: 'owner', id: 'acc-1' }
    );

    expect(allowed).toBe(false);
  });

  it('allows owners to read their own records', async () => {
    const allowed = await service.can(
      { orgId: 'org-a', userId: 'owner' },
      'read',
      'accounts',
      { orgId: 'org-a', ownerId: 'owner', id: 'acc-1' }
    );

    expect(allowed).toBe(true);
  });

  it('allows read access when record is shared with user team', async () => {
    recordShareFindMany.mockResolvedValue([
      { granteeId: 'team-1', granteeType: ShareGranteeType.TEAM }
    ]);
    teamMembershipFindFirst.mockResolvedValue({ id: 'membership-1' });

    const allowed = await service.can(
      { orgId: 'org-a', userId: 'viewer' },
      'read',
      'accounts',
      { orgId: 'org-a', ownerId: 'owner', id: 'acc-1' }
    );

    expect(recordShareFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          granteeType: ShareGranteeType.TEAM
        })
      })
    );
    expect(allowed).toBe(true);
  });
});
