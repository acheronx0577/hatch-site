/* Seed baseline org, profiles, permissions, and demo data aligned with the current schema. */
import {
  OfferStatus,
  PermissionHolderType,
  PersonStage,
  Prisma,
  PrismaClient,
  UserRole
} from '@prisma/client';

import { seedLayoutsDefaults } from './seed_layouts_defaults.ts';

const prisma = new PrismaClient();

type ProfileKey = 'admin' | 'manager' | 'agent' | 'viewer';

interface ProfileDefinition {
  key: ProfileKey;
  id: string;
  name: string;
}

type ProfileMap = Record<ProfileKey, { id: string; name: string }>;

async function upsertOrgAndTenant() {
  const organization = await prisma.organization.upsert({
    where: { id: 'org-demo' },
    update: { name: 'Demo Org' },
    create: {
      id: 'org-demo',
      name: 'Demo Org'
    }
  });

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {
      name: 'Demo Brokerage',
      organizationId: organization.id
    },
    create: {
      id: 'tenant-demo',
      organizationId: organization.id,
      name: 'Demo Brokerage',
      slug: 'demo',
      timezone: 'America/New_York',
      tenDlcReady: true
    }
  });

  return { organization, tenant };
}

async function upsertProfiles(orgId: string): Promise<ProfileMap> {
  const definitions: ProfileDefinition[] = [
    { key: 'admin', id: 'profile-demo-admin', name: 'Admin' },
    { key: 'manager', id: 'profile-demo-manager', name: 'Manager' },
    { key: 'agent', id: 'profile-demo-agent', name: 'Agent' },
    { key: 'viewer', id: 'profile-demo-viewer', name: 'Viewer' }
  ];

  const profileMap: Partial<ProfileMap> = {};

  for (const definition of definitions) {
    const profile = await prisma.profile.upsert({
      where: { id: definition.id },
      update: { name: definition.name },
      create: {
        id: definition.id,
        orgId,
        name: definition.name,
        isSystem: false
      }
    });

    profileMap[definition.key] = { id: profile.id, name: profile.name };
  }

  return profileMap as ProfileMap;
}

async function ensureUsers(orgId: string, tenantId: string, profiles: ProfileMap) {
  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo.test' },
    update: {
      firstName: 'Ada',
      lastName: 'Admin',
      role: UserRole.BROKER
    },
    create: {
      id: 'user-demo-admin',
      organizationId: orgId,
      tenantId,
      email: 'admin@demo.test',
      firstName: 'Ada',
      lastName: 'Admin',
      role: UserRole.BROKER
    }
  });

  await prisma.userOrgMembership.upsert({
    where: { id: 'membership-demo-admin' },
    update: {
      profileId: profiles.admin.id,
      isOrgAdmin: true
    },
    create: {
      id: 'membership-demo-admin',
      userId: admin.id,
      orgId,
      profileId: profiles.admin.id,
      isOrgAdmin: true
    }
  });

  const agent = await prisma.user.upsert({
    where: { email: 'agent@demo.test' },
    update: {
      firstName: 'Alex',
      lastName: 'Agent',
      role: UserRole.AGENT
    },
    create: {
      id: 'user-demo-agent',
      organizationId: orgId,
      tenantId,
      email: 'agent@demo.test',
      firstName: 'Alex',
      lastName: 'Agent',
      role: UserRole.AGENT
    }
  });

  await prisma.userOrgMembership.upsert({
    where: { id: 'membership-demo-agent' },
    update: {
      profileId: profiles.agent.id,
      isOrgAdmin: false
    },
    create: {
      id: 'membership-demo-agent',
      userId: agent.id,
      orgId,
      profileId: profiles.agent.id,
      isOrgAdmin: false
    }
  });

  return { admin, agent };
}

async function seedObjectPerms(orgId: string, profiles: ProfileMap) {
  const objects = [
    'cases',
    'opportunities',
    'accounts',
    'contacts',
    'listings',
    'offers',
    'deals',
    'search',
    'layouts',
    'audit'
  ];

  const accessByProfile: Record<
    ProfileKey,
    { canRead: boolean; canCreate: boolean; canUpdate: boolean; canDelete: boolean }
  > = {
    admin: { canRead: true, canCreate: true, canUpdate: true, canDelete: true },
    manager: { canRead: true, canCreate: true, canUpdate: true, canDelete: true },
    agent: { canRead: true, canCreate: true, canUpdate: true, canDelete: false },
    viewer: { canRead: true, canCreate: false, canUpdate: false, canDelete: false }
  };

  for (const object of objects) {
    for (const profileKey of Object.keys(accessByProfile) as ProfileKey[]) {
      const profile = profiles[profileKey];
      const access = { ...accessByProfile[profileKey] };

      if (object === 'audit') {
        access.canRead = profileKey === 'admin' || profileKey === 'manager';
        access.canCreate = false;
        access.canUpdate = false;
        access.canDelete = false;
      }
      const id = `perm-${object}-${profileKey}`;

      await prisma.objectPermission.upsert({
        where: { id },
        update: {
          holderType: PermissionHolderType.PROFILE,
          holderId: profile.id,
          profileId: profile.id,
          object,
          canCreate: access.canCreate,
          canRead: access.canRead,
          canUpdate: access.canUpdate,
          canDelete: access.canDelete
        },
        create: {
          id,
          orgId,
          holderType: PermissionHolderType.PROFILE,
          holderId: profile.id,
          profileId: profile.id,
          object,
          canCreate: access.canCreate,
          canRead: access.canRead,
          canUpdate: access.canUpdate,
          canDelete: access.canDelete
        }
      });
    }
  }
}

async function seedDemoData(
  orgId: string,
  tenantId: string,
  users: { admin: { id: string }; agent: { id: string } }
) {
  const account = await prisma.account.upsert({
    where: { id: 'account-demo-acme' },
    update: {
      name: 'Acme Real Estate',
      ownerId: users.agent.id
    },
    create: {
      id: 'account-demo-acme',
      orgId,
      ownerId: users.agent.id,
      name: 'Acme Real Estate'
    }
  });

  const person = await prisma.person.upsert({
    where: { id: 'person-demo-buyer' },
    update: {
      organizationId: orgId,
      tenantId,
      ownerId: users.agent.id,
      firstName: 'Alex',
      lastName: 'Buyer',
      primaryEmail: 'buyer@example.com',
      stage: PersonStage.ACTIVE
    },
    create: {
      id: 'person-demo-buyer',
      organizationId: orgId,
      tenantId,
      ownerId: users.agent.id,
      firstName: 'Alex',
      lastName: 'Buyer',
      primaryEmail: 'buyer@example.com',
      stage: PersonStage.ACTIVE
    }
  });

  const opportunity = await prisma.opportunity.upsert({
    where: { id: 'opportunity-demo-buyer' },
    update: {
      name: 'Buyer Rep – Alex Buyer',
      ownerId: users.agent.id,
      accountId: account.id,
      amount: new Prisma.Decimal(450000),
      stage: 'Qualification'
    },
    create: {
      id: 'opportunity-demo-buyer',
      orgId,
      ownerId: users.agent.id,
      accountId: account.id,
      name: 'Buyer Rep – Alex Buyer',
      amount: new Prisma.Decimal(450000),
      stage: 'Qualification'
    }
  });

  const listing = await prisma.listing.upsert({
    where: { id: 'listing-demo-mls-123' },
    update: {
      personId: person.id,
      opportunityId: opportunity.id,
      status: 'ACTIVE',
      price: new Prisma.Decimal(500000)
    },
    create: {
      id: 'listing-demo-mls-123',
      tenantId,
      personId: person.id,
      opportunityId: opportunity.id,
      mlsId: 'MLS-123',
      status: 'ACTIVE',
      addressLine1: '123 Ocean Drive',
      city: 'Miami',
      state: 'FL',
      postalCode: '33101',
      price: new Prisma.Decimal(500000)
    }
  });

  await prisma.offer.upsert({
    where: { id: 'offer-demo-mls-123' },
    update: {
      listingId: listing.id,
      personId: person.id,
      status: OfferStatus.SUBMITTED,
      terms: { amount: 480000 } as Prisma.InputJsonValue
    },
    create: {
      id: 'offer-demo-mls-123',
      tenantId,
      listingId: listing.id,
      personId: person.id,
      status: OfferStatus.SUBMITTED,
      terms: { amount: 480000 } as Prisma.InputJsonValue
    }
  });

  await prisma.validationRule.upsert({
    where: { id: 'validation-rule-case-close' },
    update: {
      object: 'cases',
      name: 'Case close requires description',
      dsl: {
        if: "status in ['Resolved','Closed']",
        then_required: ['description']
      } as Prisma.InputJsonValue
    },
    create: {
      id: 'validation-rule-case-close',
      orgId,
      object: 'cases',
      name: 'Case close requires description',
      dsl: {
        if: "status in ['Resolved','Closed']",
        then_required: ['description']
      } as Prisma.InputJsonValue
    }
  });
}

async function main() {
  const { organization, tenant } = await upsertOrgAndTenant();
  const profiles = await upsertProfiles(organization.id);
  const users = await ensureUsers(organization.id, tenant.id, profiles);
  await seedObjectPerms(organization.id, profiles);
  await seedLayoutsDefaults(prisma, organization.id);
  await seedDemoData(organization.id, tenant.id, users);
  console.log('Seed complete for org', organization.id);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
