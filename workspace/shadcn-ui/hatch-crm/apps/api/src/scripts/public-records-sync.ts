import { NestFactory } from '@nestjs/core';

import { AppModule } from '@/app.module';
import { PublicRecordsService } from '@/modules/public-records/public-records.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  const publicRecords = app.get(PublicRecordsService);

  const result = await publicRecords.syncOnce({ reason: 'manual' });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result, null, 2));

  await app.close();
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

