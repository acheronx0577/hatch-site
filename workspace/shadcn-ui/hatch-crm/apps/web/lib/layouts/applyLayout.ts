import type { FieldDef } from '@hatch/shared/layout';

export interface LayoutEntry {
  field: string;
  label?: string;
  order?: number;
  width?: number;
}

export function applyLayout(
  manifest: { fields: LayoutEntry[] },
  allowedFields: string[],
  baseline: FieldDef[]
) {
  const allowSet = allowedFields.length > 0 ? new Set(allowedFields) : null;

  const sortedManifest = [...manifest.fields].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  );

  const fromManifest = sortedManifest
    .filter((field) => !allowSet || allowSet.has(field.field))
    .map((field, index) => ({
      field: field.field,
      label: field.label,
      width: field.width,
      order: index
    }));

  const seen = new Set(fromManifest.map((field) => field.field));
  const appended = baseline
    .filter((field) => (!allowSet || allowSet.has(field.field)) && !seen.has(field.field))
    .map((field, index) => ({
      field: field.field,
      label: field.label,
      width: field.width,
      order: fromManifest.length + index
    }));

  return [...fromManifest, ...appended];
}
