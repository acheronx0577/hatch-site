import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkMlsData() {
  try {
    const listingsCount = await prisma.mlsListing.count({
      where: {
        city: 'Naples',
        state: 'FL'
      }
    });

    const comparablesCount = await prisma.marketComparable.count({
      where: {
        city: 'Naples',
        state: 'FL'
      }
    });

    console.log('MLS Data Check:');
    console.log(`- MlsListing records (Naples, FL): ${listingsCount}`);
    console.log(`- MarketComparable records (Naples, FL): ${comparablesCount}`);

    if (listingsCount > 0) {
      const sampleListings = await prisma.mlsListing.findMany({
        where: { city: 'Naples', state: 'FL' },
        take: 3,
        select: {
          id: true,
          address: true,
          price: true,
          status: true,
          propertyType: true
        }
      });
      console.log('\nSample listings:', JSON.stringify(sampleListings, null, 2));
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error('Error checking MLS data:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

checkMlsData();
