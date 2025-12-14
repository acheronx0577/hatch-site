import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function quickSeed() {
  console.log('🌱 Quick seeding for AI persona testing...');

  // Create organization first (doesn't require tenant)
  const org = await prisma.organization.upsert({
    where: { id: 'org-hatch' },
    update: {},
    create: {
      id: 'org-hatch',
      name: 'Hatch Realty'
    }
  });

  // Then create tenant with organization reference
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'hatch-brokerage' },
    update: {},
    create: {
      id: 'tenant-hatch',
      organizationId: org.id,
      slug: 'hatch-brokerage',
      name: 'Hatch Brokerage',
      timezone: 'America/New_York'
    }
  });

  // Create test user
  const user = await prisma.user.upsert({
    where: { email: 'test@hatch.com' },
    update: {},
    create: {
      id: 'user-test',
      email: 'test@hatch.com',
      firstName: 'Test',
      lastName: 'User',
      role: 'BROKER',
      organizationId: org.id,
      tenantId: tenant.id
    }
  });

  // Create test office
  const office = await prisma.office.upsert({
    where: { id: 'office-main' },
    update: {},
    create: {
      id: 'office-main',
      name: 'Main Office',
      organizationId: org.id,
      city: 'San Francisco',
      state: 'CA'
    }
  });

  console.log('✅ Created tenant, org, user, office');

  // Create 5 test opportunities
  const opportunities = [];
  for (let i = 1; i <= 5; i++) {
    const opp = await prisma.opportunity.upsert({
      where: { id: `opp-${i}` },
      update: {},
      create: {
        id: `opp-${i}`,
        name: `Test Deal ${i}`,
        stage: i <= 2 ? 'NEGOTIATION' : 'QUALIFIED',
        amount: 250000 + (i * 50000),
        currency: 'USD',
        closeDate: new Date(Date.now() + (i * 7 * 24 * 60 * 60 * 1000)), // i weeks from now
        orgId: org.id,
        ownerId: user.id
      }
    });
    opportunities.push(opp);
  }

  console.log(`✅ Created ${opportunities.length} opportunities`);

  // Create 3 test listings
  const listings = [];
  for (let i = 1; i <= 3; i++) {
    const listing = await prisma.orgListing.upsert({
      where: { id: `listing-${i}` },
      update: {},
      create: {
        id: `listing-${i}`,
        organizationId: org.id,
        officeId: office.id,
        addressLine1: `${i}00 Main Street`,
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94102',
        listPrice: 800000 + (i * 100000),
        bedrooms: 2 + i,
        bathrooms: 2,
        squareFeet: 1200 + (i * 200),
        propertyType: 'RESIDENTIAL',
        status: 'ACTIVE',
        mlsNumber: `MLS-${1000 + i}`,
        listedAt: new Date(),
        createdByUserId: user.id
      }
    });
    listings.push(listing);
  }

  console.log(`✅ Created ${listings.length} listings`);

  // Create 2 test transactions
  for (let i = 1; i <= 2; i++) {
    await prisma.orgTransaction.upsert({
      where: { id: `txn-${i}` },
      update: {},
      create: {
        id: `txn-${i}`,
        organizationId: org.id,
        officeId: office.id,
        listingId: listings[i - 1].id,
        status: 'UNDER_CONTRACT',
        closingDate: new Date(Date.now() + (i * 14 * 24 * 60 * 60 * 1000)), // i*2 weeks from now
        buyerName: `Buyer ${i}`,
        sellerName: `Seller ${i}`,
        isCompliant: i === 1,
        requiresAction: i === 2,
        createdByUserId: user.id
      }
    });
  }

  console.log('✅ Created 2 transactions');

  // Create 10 test leads
  const leadStatuses = ['NEW', 'CONTACTED', 'QUALIFIED', 'APPOINTMENT_SET'];
  for (let i = 1; i <= 10; i++) {
    await prisma.lead.upsert({
      where: { id: `lead-${i}` },
      update: {},
      create: {
        id: `lead-${i}`,
        organizationId: org.id,
        officeId: office.id,
        name: `Test Lead ${i}`,
        email: `lead${i}@test.com`,
        phone: `555-010${i}`,
        status: leadStatuses[i % leadStatuses.length],
        aiScore: (10 - i) * 10, // 90, 80, 70, ...
        source: 'PORTAL_SIGNUP',
        createdByUserId: user.id
      }
    });
  }

  console.log('✅ Created 10 leads');

  console.log('🎉 Quick seed complete!');
}

quickSeed()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
