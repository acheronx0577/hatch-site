import { PrismaClient } from '@hatch/db';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking leads in database...\n');

  // Get all leads
  const allLeads = await prisma.lead.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      organizationId: true,
      aiScore: true,
      status: true
    },
    orderBy: { aiScore: 'desc' },
    take: 20
  });

  console.log(`Total leads found: ${allLeads.length}\n`);

  if (allLeads.length > 0) {
    console.log('Top 5 leads by AI score:');
    allLeads.slice(0, 5).forEach((lead, i) => {
      console.log(`${i + 1}. ${lead.name} (${lead.email})`);
      console.log(`   Score: ${lead.aiScore}, Status: ${lead.status}`);
      console.log(`   OrgId: ${lead.organizationId}\n`);
    });

    // Get unique organization IDs
    const orgIds = [...new Set(allLeads.map(l => l.organizationId))];
    console.log(`\nUnique organization IDs: ${orgIds.join(', ')}`);
  } else {
    console.log('No leads found in database!');
  }

  // Also check organizations to see what orgId we should be using
  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      slug: true
    },
    take: 5
  });

  console.log(`\n\nOrganizations in database: ${orgs.length}`);
  orgs.forEach(org => {
    console.log(`- ${org.name} (${org.slug}): ${org.id}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
