import type { PrismaClient } from '@prisma/client';
import { FIELD_MAP } from '@hatch/shared/layout';

type LayoutKind = 'list' | 'detail';

const OBJECTS: Array<keyof typeof FIELD_MAP> = ['accounts', 'opportunities', 'contacts', 'leads'];

export async function seedLayoutsDefaults(prisma: PrismaClient, orgId: string) {
  for (const object of OBJECTS) {
    const baseline = FIELD_MAP[object] ?? [];

    const recordType = await prisma.recordType.upsert({
      where: {
        orgId_object_key: { orgId, object, key: 'default' }
      },
      update: {},
      create: { orgId, object, key: 'default', label: 'Default' }
    });

    await Promise.all(
      (['list', 'detail'] as LayoutKind[]).map(async (kind) => {
        const existing = await prisma.objectLayout.findFirst({
          where: {
            orgId,
            object,
            kind,
            recordTypeId: recordType.id,
            profile: null
          },
          select: { id: true }
        });

        if (existing) {
          const updated = await prisma.objectLayout.update({
            where: { id: existing.id },
            data: {
              active: true,
              fields: baseline.length
                ? {
                    deleteMany: {},
                    create: baseline.map((field, index) => ({
                      field: field.field,
                      label: field.label ?? null,
                      visible: true,
                      order: index,
                      width: field.width ?? null
                    }))
                  }
                : { deleteMany: {} }
            }
          });

          if (baseline.length === 0) {
            await prisma.fieldLayout.deleteMany({ where: { layoutId: updated.id } });
          }

          return;
        }

        const created = await prisma.objectLayout.create({
          data: {
            orgId,
            object,
            kind,
            recordTypeId: recordType.id,
            profile: null,
            active: true,
            fields: baseline.length
              ? {
                  create: baseline.map((field, index) => ({
                    field: field.field,
                    label: field.label ?? null,
                    visible: true,
                    order: index,
                    width: field.width ?? null
                  }))
                }
              : undefined
          }
        });

        if (baseline.length === 0) {
          await prisma.fieldLayout.deleteMany({ where: { layoutId: created.id } });
        }
      })
    );
  }

  console.log('[seed] default record types & layouts seeded for', orgId);
}
