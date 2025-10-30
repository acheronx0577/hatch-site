import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const OBJECTS = [
  'accounts',
  'contacts',
  'opportunities',
  'leads',
  'cases',
  'products',
  'quotes',
  'orders'
];

async function upsertOrganization() {
  return prisma.organization.upsert({
    where: { id: 'org-default' },
    update: {},
    create: { id: 'org-default', name: 'Default Org', plan: 'standard' }
  });
}

async function upsertTenant(orgId: string) {
  return prisma.tenant.upsert({
    where: { id: 'tenant-default' },
    update: {},
    create: {
      id: 'tenant-default',
      organizationId: orgId,
      name: 'Default Tenant',
      slug: 'default-tenant'
    }
  });
}

async function upsertProfile(orgId: string, id: string, name: string, isSystem: boolean) {
  return prisma.profile.upsert({
    where: { id },
    update: {},
    create: { id, orgId, name, isSystem }
  });
}

async function upsertUser(params: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'BROKER' | 'TEAM_LEAD' | 'AGENT' | 'ISA' | 'MARKETING' | 'LENDER';
  organizationId: string;
  tenantId: string;
}) {
  const { id, email, firstName, lastName, role, organizationId, tenantId } = params;
  return prisma.user.upsert({
    where: { id },
    update: {},
    create: {
      id,
      email,
      firstName,
      lastName,
      role,
      organizationId,
      tenantId
    }
  });
}

async function upsertRole(orgId: string, id: string, name: string, parentRoleId?: string) {
  return prisma.role.upsert({
    where: { id },
    update: {},
    create: { id, orgId, name, parentRoleId: parentRoleId ?? null }
  });
}

async function upsertMembership(params: {
  userId: string;
  orgId: string;
  profileId: string;
  roleId: string;
  isOrgAdmin?: boolean;
}) {
  const { userId, orgId, profileId, roleId, isOrgAdmin = false } = params;
  return prisma.userOrgMembership.upsert({
    where: { userId_orgId: { userId, orgId } },
    update: { profileId, roleId, isOrgAdmin },
    create: { userId, orgId, profileId, roleId, isOrgAdmin }
  });
}

async function seedObjectPermissions(orgId: string, sysProfileId: string, stdProfileId: string) {
  for (const object of OBJECTS) {
    await prisma.objectPermission.upsert({
      where: { id: `obj-${object}-sys` },
      update: {
        canCreate: true,
        canRead: true,
        canUpdate: true,
        canDelete: true
      },
      create: {
        id: `obj-${object}-sys`,
        orgId,
        holderType: 'PROFILE',
        holderId: sysProfileId,
        object,
        canCreate: true,
        canRead: true,
        canUpdate: true,
        canDelete: true
      }
    });

    await prisma.objectPermission.upsert({
      where: { id: `obj-${object}-std` },
      update: {
        canCreate: true,
        canRead: true,
        canUpdate: true,
        canDelete: false
      },
      create: {
        id: `obj-${object}-std`,
        orgId,
        holderType: 'PROFILE',
        holderId: stdProfileId,
        object,
        canCreate: true,
        canRead: true,
        canUpdate: true,
        canDelete: false
      }
    });
  }
}

async function seedFieldPermissions(orgId: string, stdProfileId: string) {
  const fields = [
    { field: 'name', read: true, write: true },
    { field: 'website', read: true, write: true },
    { field: 'industry', read: true, write: true },
    { field: 'secretNote', read: false, write: false }
  ];

  for (const f of fields) {
    await prisma.fieldPermission.upsert({
      where: { id: `fld-accounts-${f.field}-std` },
      update: { canRead: f.read, canWrite: f.write },
      create: {
        id: `fld-accounts-${f.field}-std`,
        orgId,
        holderType: 'PROFILE',
        holderId: stdProfileId,
        object: 'accounts',
        field: f.field,
        canRead: f.read,
        canWrite: f.write
      }
    });
  }
}

async function main() {
  const org = await upsertOrganization();
  const tenant = await upsertTenant(org.id);

  const sysAdminProfile = await upsertProfile(org.id, 'profile-sysadmin', 'System Administrator', true);
  const standardProfile = await upsertProfile(org.id, 'profile-standard', 'Standard User', false);

  await upsertUser({
    id: 'user-admin',
    email: 'admin@example.com',
    firstName: 'Admin',
    lastName: 'User',
    role: 'BROKER',
    organizationId: org.id,
    tenantId: tenant.id
  });

  await upsertUser({
    id: 'user-agent',
    email: 'agent@example.com',
    firstName: 'Avery',
    lastName: 'Agent',
    role: 'AGENT',
    organizationId: org.id,
    tenantId: tenant.id
  });

  const execRole = await upsertRole(org.id, 'role-exec', 'Executive');
  const mgrRole = await upsertRole(org.id, 'role-mgr', 'Manager', execRole.id);
  const repRole = await upsertRole(org.id, 'role-rep', 'Agent', mgrRole.id);

  await upsertMembership({
    userId: 'user-admin',
    orgId: org.id,
    profileId: sysAdminProfile.id,
    roleId: execRole.id,
    isOrgAdmin: true
  });

  await upsertMembership({
    userId: 'user-agent',
    orgId: org.id,
    profileId: standardProfile.id,
    roleId: repRole.id
  });

  await seedObjectPermissions(org.id, sysAdminProfile.id, standardProfile.id);
  await seedFieldPermissions(org.id, standardProfile.id);

  console.log('Seeded baseline org/profiles/permissions.');
}

main()
  .catch((error) => {
    console.error('Baseline seed failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
