'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { FIELD_MAP, type FieldDef } from '@hatch/shared/layout';

import { ErrorBanner } from '@/components/error-banner';
import type { LayoutManifest } from '@/lib/api/admin.layouts';
import { resolveLayout, upsertLayout } from '@/lib/api/admin.layouts';
import { applyLayout } from '@/lib/layouts/applyLayout';

type LayoutKind = LayoutManifest['kind'];

interface LayoutEditorProps {
  object: string;
  kind: LayoutKind;
  recordTypeId?: string;
  profile?: string;
}

interface EditorField {
  field: string;
  label?: string;
  width?: number;
  visible: boolean;
}

export function LayoutEditor({
  object,
  kind,
  recordTypeId,
  profile
}: LayoutEditorProps) {
  const baseline = useMemo<FieldDef[]>(() => FIELD_MAP[object] ?? [], [object]);
  const [fields, setFields] = useState<EditorField[]>(() =>
    baseline.map((field) => ({ field: field.field, label: field.label, width: field.width, visible: true }))
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadManifest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const manifest = await resolveLayout({
        object,
        kind,
        recordTypeId,
        profile
      });

      setFields(buildEditorFields(baseline, manifest));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load layout');
      setFields(baseline.map((field) => ({ field: field.field, label: field.label, width: field.width, visible: true })));
    } finally {
      setLoading(false);
    }
  }, [baseline, object, kind, recordTypeId, profile]);

  useEffect(() => {
    void loadManifest();
  }, [loadManifest]);

  const moveField = (from: number, to: number) => {
    setFields((current) => {
      if (to < 0 || to >= current.length) return current;
      const next = [...current];
      const [row] = next.splice(from, 1);
      next.splice(to, 0, row);
      return next;
    });
  };

  const toggleVisibility = (field: string) => {
    setFields((current) =>
      current.map((entry) =>
        entry.field === field ? { ...entry, visible: !entry.visible } : entry
      )
    );
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = fields.map((field, index) => ({
        field: field.field,
        label: field.label,
        visible: field.visible,
        width: field.width,
        order: index
      }));
      await upsertLayout({
        object,
        kind,
        recordTypeId: recordTypeId ?? null,
        profile: profile ?? null,
        fields: payload
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save layout');
    } finally {
      setSaving(false);
      void loadManifest();
    }
  };

  if (loading) {
    return <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">Loading layout…</div>;
  }

  return (
    <div className="space-y-4">
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <div className="rounded-md border border-slate-200 bg-white">
        <div className="grid grid-cols-[1fr_auto_auto] border-b border-slate-100 bg-slate-50 p-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <span>Field</span>
          <span>Visibility</span>
          <span className="text-right">Reorder</span>
        </div>
        <ul className="divide-y divide-slate-100">
          {fields.map((field, index) => (
            <li key={field.field} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 p-3 text-sm text-slate-700">
              <div>
                <div className="font-medium text-slate-800">{field.label ?? field.field}</div>
                <div className="text-xs text-slate-500">{field.field}</div>
              </div>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={field.visible}
                  onChange={() => toggleVisibility(field.field)}
                />
                Visible
              </label>
              <div className="flex items-center justify-end gap-1">
                <button
                  type="button"
                  className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                  onClick={() => moveField(index, index - 1)}
                  disabled={index === 0}
                >
                  Up
                </button>
                <button
                  type="button"
                  className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                  onClick={() => moveField(index, index + 1)}
                  disabled={index === fields.length - 1}
                >
                  Down
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          className="rounded border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
          onClick={() => void loadManifest()}
          disabled={saving}
        >
          Reset
        </button>
        <button
          type="button"
          className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-400"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save layout'}
        </button>
      </div>
    </div>
  );
}

function buildEditorFields(baseline: FieldDef[], manifest: LayoutManifest): EditorField[] {
  const applied = applyLayout(
    manifest,
    baseline.map((field) => field.field),
    baseline.map((field, index) => ({ field: field.field, label: field.label, order: index, width: field.width }))
  );

  const visibleSet = new Set(manifest.fields.map((field) => field.field));
  const allFields = baseline.map((field) => ({
    field: field.field,
    label: field.label,
    width: field.width,
    visible: visibleSet.has(field.field)
  }));

  // include any dynamic fields returned from manifest that are not in baseline
  manifest.fields.forEach((field) => {
    if (!baseline.find((item) => item.field === field.field)) {
      allFields.push({
        field: field.field,
        label: field.label ?? field.field,
        width: field.width,
        visible: true
      });
    }
  });

  const ordered = applied.map((field) => {
    const match = allFields.find((item) => item.field === field.field);
    if (!match) {
      return { field: field.field, label: field.label, width: field.width, visible: true };
    }
    return { ...match, label: match.label ?? field.label ?? match.field, width: match.width ?? field.width };
  });

  const appended = allFields.filter((field) => !ordered.find((item) => item.field === field.field));

  return [...ordered, ...appended];
}
