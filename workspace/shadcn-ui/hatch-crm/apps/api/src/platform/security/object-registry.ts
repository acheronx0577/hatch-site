import type { PrismaService } from '../../modules/prisma/prisma.service';

export type ObjectKey = string;

export interface ObjectMetadata {
  loadRecordCtx: (
    prisma: PrismaService,
    id: string
  ) => Promise<{ orgId: string; ownerId?: string | null } | null>;
}

export class ObjectRegistry {
  private static readonly registry = new Map<ObjectKey, ObjectMetadata>();

  static register(key: ObjectKey, metadata: ObjectMetadata) {
    this.registry.set(key, metadata);
  }

  static get(key: ObjectKey): ObjectMetadata | undefined {
    return this.registry.get(key);
  }
}
