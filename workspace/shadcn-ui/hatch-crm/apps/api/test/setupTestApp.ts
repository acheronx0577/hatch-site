import { NestFastifyApplication } from '@nestjs/platform-fastify';

import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createApp } from '../src/main';

export async function setupTestApp(): Promise<NestFastifyApplication & { prisma: PrismaService }> {
  const app = await createApp();
  const prisma = app.get(PrismaService);
  Object.defineProperty(app, 'prisma', {
    value: prisma,
    writable: false,
    enumerable: false,
    configurable: false
  });
  return app as NestFastifyApplication & { prisma: PrismaService };
}
