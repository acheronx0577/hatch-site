import 'dotenv/config';
import { PrismaClient, ContractFieldSourceType, ContractInstanceStatus } from '@hatch/db';

const prisma = new PrismaClient();

async function seed() {
  const org = await prisma.organization.findFirst();
  if (!org) {
    throw new Error('No organization found. Seed an organization before running this script.');
  }

  const user = await prisma.user.findFirst({ where: { organizationId: org.id } });
  if (!user) {
    throw new Error('No user found for organization; cannot set createdByUserId.');
  }

  const template = await prisma.contractTemplate.upsert({
    where: {
      // Using code + org as a synthetic unique; adjust if you add a constraint later.
      id: `demo-template-${org.id}`
    },
    update: {},
    create: {
      id: `demo-template-${org.id}`,
      organizationId: org.id,
      name: 'Demo As-Is Residential Contract',
      code: 'DEMO_AS_IS',
      description: 'Demo template for contract center flows',
      jurisdiction: 'FLORIDA',
      propertyType: 'RESIDENTIAL',
      side: 'BUYER',
      s3Key: 'contracts/demo/templates/demo-as-is.pdf',
      version: 1,
      isActive: true,
      editableKeys: ['PRICE', 'CLOSING_DATE', 'SPECIAL_TERMS'],
      tags: ['DEMO', 'RESIDENTIAL', 'AS_IS']
    }
  });

  await prisma.contractFieldMapping.deleteMany({ where: { templateId: template.id } });
  await prisma.contractFieldMapping.createMany({
    data: [
      {
        templateId: template.id,
        templateFieldKey: 'PROPERTY_ADDRESS',
        sourceType: ContractFieldSourceType.PROPERTY,
        sourcePath: 'address.full',
        defaultValue: null,
        required: true
      },
      {
        templateId: template.id,
        templateFieldKey: 'BUYER_NAME',
        sourceType: ContractFieldSourceType.PARTY,
        sourcePath: 'buyer.fullName',
        defaultValue: null,
        required: true
      },
      {
        templateId: template.id,
        templateFieldKey: 'PRICE',
        sourceType: ContractFieldSourceType.PROPERTY,
        sourcePath: 'listPrice',
        defaultValue: '0',
        required: true
      },
      {
        templateId: template.id,
        templateFieldKey: 'CLOSING_DATE',
        sourceType: ContractFieldSourceType.PROPERTY,
        sourcePath: 'closingDate',
        defaultValue: null,
        required: false
      },
      {
        templateId: template.id,
        templateFieldKey: 'EFFECTIVE_DATE',
        sourceType: ContractFieldSourceType.STATIC,
        sourcePath: '',
        defaultValue: null,
        required: true
      }
    ]
  });

  const listing = await prisma.orgListing.findFirst({
    where: { organizationId: org.id }
  });

  if (listing) {
    await prisma.contractInstance.create({
      data: {
        id: `demo-instance-${org.id}`,
        organizationId: org.id,
        templateId: template.id,
        orgListingId: listing.id,
        orgTransactionId: null,
        createdByUserId: user.id,
        title: 'Demo contract draft',
        status: ContractInstanceStatus.DRAFT,
        draftS3Key: 'contracts/demo/drafts/demo-as-is-filled.pdf',
        fieldValues: {
          PROPERTY_ADDRESS: '123 Demo St',
          BUYER_NAME: 'Demo Buyer',
          PRICE: 550000
        }
      }
    });
  }

  // eslint-disable-next-line no-console
  console.log('Seeded demo contract template for org', org.id);
}

seed()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
