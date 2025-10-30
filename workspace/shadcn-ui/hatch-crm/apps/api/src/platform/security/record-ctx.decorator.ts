import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { PrismaService } from '../../modules/prisma/prisma.service';

import { ObjectRegistry } from './object-registry';

export interface RecordContext {
  id?: string;
  orgId?: string;
  ownerId?: string | null;
}

export const RecordCtx = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return (request?.recordCtx ?? null) as RecordContext | null;
});

export class RecordContextResolver {
  static async attach(request: any, objectKey: string, prisma: PrismaService): Promise<void> {
    if (!objectKey || !request?.params?.id) {
      return;
    }

    if (request.recordCtx) {
      return;
    }

    const metadata = ObjectRegistry.get(objectKey);
    if (!metadata) {
      return;
    }

    const record = await metadata.loadRecordCtx(prisma, request.params.id);
    if (record) {
      request.recordCtx = { ...record, id: request.params.id };
    }
  }
}
