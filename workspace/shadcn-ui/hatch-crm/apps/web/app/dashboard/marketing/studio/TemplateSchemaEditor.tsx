'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { DndContext, PointerSensor, useDraggable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { restrictToParentElement } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export const BASE_FLYER_SCHEMA = {
  page: { width: 612, height: 792 },
  imageSlots: [{ id: 'hero', x: 36, y: 330, width: 540, height: 420, fit: 'cover' }],
  textSlots: [
    { id: 'address', x: 36, y: 300, size: 18, maxWidth: 540 },
    { id: 'cityStateZip', x: 36, y: 280, size: 12, maxWidth: 540 },
    { id: 'price', x: 36, y: 252, size: 16, maxWidth: 540 },
    { id: 'agentName', x: 36, y: 200, size: 12, maxWidth: 540 },
    { id: 'agentPhone', x: 36, y: 182, size: 12, maxWidth: 540 },
    { id: 'agentEmail', x: 36, y: 164, size: 12, maxWidth: 540 },
    { id: 'brokerageName', x: 36, y: 120, size: 10, maxWidth: 540 }
  ],
  watermark: { enabled: false }
};

const schemaEditorSchema = z
  .object({
    page: z
      .object({
        width: z.number().positive(),
        height: z.number().positive()
      })
      .optional()
      .default({ width: 612, height: 792 }),
    imageSlots: z
      .array(
        z.object({
          id: z.string().min(1),
          x: z.number(),
          y: z.number(),
          width: z.number().positive(),
          height: z.number().positive(),
          fit: z.enum(['cover', 'contain']).optional().default('cover')
        })
      )
      .optional()
      .default([]),
    textSlots: z
      .array(
        z.object({
          id: z.string().min(1),
          x: z.number(),
          y: z.number(),
          size: z.number().positive().optional().default(12),
          color: z.string().optional(),
          maxWidth: z.number().positive().optional(),
          align: z.enum(['left', 'center', 'right']).optional().default('left')
        })
      )
      .optional()
      .default([]),
    watermark: z
      .object({
        enabled: z.boolean().optional().default(false),
        text: z.string().optional().default(''),
        opacity: z.number().min(0).max(1).optional().default(0.12),
        size: z.number().positive().optional().default(42),
        x: z.number().optional(),
        y: z.number().optional()
      })
      .optional()
  })
  .passthrough();

type EditorSchema = z.infer<typeof schemaEditorSchema>;
type ImageSlot = EditorSchema['imageSlots'][number];
type TextSlot = EditorSchema['textSlots'][number];
type SlotKey = { type: 'image' | 'text'; id: string } | null;

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeUniqueId(prefix: string, existing: Set<string>) {
  const base = prefix.trim().length > 0 ? prefix.trim() : 'slot';
  for (let i = 1; i < 10_000; i += 1) {
    const candidate = `${base}_${i}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${base}_${Math.random().toString(16).slice(2)}`;
}

function DraggableSlot(props: {
  dragId: string;
  label: string;
  style: CSSProperties;
  disabled?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const { dragId, label, style, disabled, selected, onSelect } = props;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: dragId, disabled });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onSelect}
      className={[
        'absolute flex items-center justify-center rounded-md border text-[10px] font-semibold outline-none transition',
        selected ? 'border-primary bg-primary/10 text-primary' : 'border-slate-300 bg-white/70 text-slate-700',
        isDragging ? 'shadow-md' : 'hover:bg-white'
      ].join(' ')}
      style={{
        ...style,
        transform: CSS.Translate.toString(transform),
        cursor: disabled ? 'not-allowed' : 'grab',
        opacity: isDragging ? 0.9 : 1
      }}
      {...attributes}
      {...listeners}
    >
      {label}
    </button>
  );
}

export function TemplateSchemaEditor(props: {
  value: unknown;
  onChange: (next: unknown) => void;
  disabled?: boolean;
}) {
  const { value, onChange, disabled } = props;

  const schema = useMemo<EditorSchema>(() => {
    const parsed = schemaEditorSchema.safeParse(value);
    if (parsed.success) return parsed.data;
    return schemaEditorSchema.parse(BASE_FLYER_SCHEMA);
  }, [value]);

  const page = schema.page ?? { width: 612, height: 792 };
  const existingIds = useMemo(() => {
    return new Set([...schema.imageSlots.map((slot) => slot.id), ...schema.textSlots.map((slot) => slot.id)]);
  }, [schema.imageSlots, schema.textSlots]);

  const [selectedSlot, setSelectedSlot] = useState<SlotKey>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(420);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width;
      if (!width) return;
      setCanvasWidth(width);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const scale = page.width > 0 ? canvasWidth / page.width : 1;
  const canvasHeight = page.height * scale;

  const commitSchema = (nextSchema: EditorSchema) => {
    onChange(nextSchema);
  };

  const updateSchema = (fn: (current: EditorSchema) => EditorSchema) => {
    const next = fn(deepClone(schema));
    commitSchema(next);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const deltaX = event.delta.x;
    const deltaY = event.delta.y;
    const [kind, slotId] = activeId.split(':', 2);
    if (!kind || !slotId) return;

    updateSchema((draft) => {
      if (kind === 'image') {
        const slot = draft.imageSlots.find((s) => s.id === slotId);
        if (!slot) return draft;
        const nextX = slot.x + deltaX / scale;
        const nextY = slot.y - deltaY / scale;
        slot.x = clamp(nextX, 0, Math.max(0, page.width - slot.width));
        slot.y = clamp(nextY, 0, Math.max(0, page.height - slot.height));
        return draft;
      }

      if (kind === 'text') {
        const slot = draft.textSlots.find((s) => s.id === slotId);
        if (!slot) return draft;
        const nextX = slot.x + deltaX / scale;
        const nextY = slot.y - deltaY / scale;
        slot.x = clamp(nextX, 0, Math.max(0, page.width));
        slot.y = clamp(nextY, 0, Math.max(0, page.height));
        return draft;
      }

      return draft;
    });
  };

  const handleReset = () => {
    commitSchema(schemaEditorSchema.parse(BASE_FLYER_SCHEMA));
  };

  const selectedImage: ImageSlot | null =
    selectedSlot?.type === 'image' ? schema.imageSlots.find((slot) => slot.id === selectedSlot.id) ?? null : null;
  const selectedText: TextSlot | null =
    selectedSlot?.type === 'text' ? schema.textSlots.find((slot) => slot.id === selectedSlot.id) ?? null : null;

  const slotHeader =
    selectedImage?.id ?? selectedText?.id ?? (schema.imageSlots.length + schema.textSlots.length > 0 ? 'Select a slot' : 'Add a slot');

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Visual editor</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={handleReset} disabled={disabled}>
              Reset
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                updateSchema((draft) => {
                  const id = makeUniqueId('image', existingIds);
                  draft.imageSlots.push({
                    id,
                    x: 36,
                    y: 36,
                    width: Math.min(240, page.width - 72),
                    height: 160,
                    fit: 'cover'
                  });
                  setSelectedSlot({ type: 'image', id });
                  return draft;
                })
              }
              disabled={disabled}
            >
              Add image slot
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                updateSchema((draft) => {
                  const id = makeUniqueId('text', existingIds);
                  draft.textSlots.push({
                    id,
                    x: 36,
                    y: 36,
                    size: 12,
                    maxWidth: Math.min(360, page.width - 72),
                    align: 'left'
                  });
                  setSelectedSlot({ type: 'text', id });
                  return draft;
                })
              }
              disabled={disabled}
            >
              Add text slot
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Page width</p>
            <Input
              type="number"
              min={1}
              value={String(page.width)}
              disabled={disabled}
              onChange={(event) =>
                updateSchema((draft) => {
                  const nextWidth = Number(event.target.value);
                  if (Number.isFinite(nextWidth) && nextWidth > 0) {
                    draft.page = { ...(draft.page ?? page), width: nextWidth };
                  }
                  return draft;
                })
              }
            />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Page height</p>
            <Input
              type="number"
              min={1}
              value={String(page.height)}
              disabled={disabled}
              onChange={(event) =>
                updateSchema((draft) => {
                  const nextHeight = Number(event.target.value);
                  if (Number.isFinite(nextHeight) && nextHeight > 0) {
                    draft.page = { ...(draft.page ?? page), height: nextHeight };
                  }
                  return draft;
                })
              }
            />
          </div>
        </div>

        <div ref={canvasHostRef} className="w-full overflow-hidden rounded-lg border bg-white">
          <DndContext sensors={sensors} modifiers={[restrictToParentElement]} onDragEnd={handleDragEnd}>
            <div
              className="relative w-full bg-gradient-to-b from-white to-slate-50"
              style={{ height: `${canvasHeight}px` }}
            >
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.06)_1px,transparent_1px)] bg-[size:24px_24px]" />

              {schema.imageSlots.map((slot) => (
                <DraggableSlot
                  key={`image:${slot.id}`}
                  dragId={`image:${slot.id}`}
                  label={`img:${slot.id}`}
                  disabled={disabled}
                  selected={selectedSlot?.type === 'image' && selectedSlot.id === slot.id}
                  onSelect={() => setSelectedSlot({ type: 'image', id: slot.id })}
                  style={{
                    left: slot.x * scale,
                    bottom: slot.y * scale,
                    width: slot.width * scale,
                    height: slot.height * scale
                  }}
                />
              ))}

              {schema.textSlots.map((slot) => (
                <DraggableSlot
                  key={`text:${slot.id}`}
                  dragId={`text:${slot.id}`}
                  label={`txt:${slot.id}`}
                  disabled={disabled}
                  selected={selectedSlot?.type === 'text' && selectedSlot.id === slot.id}
                  onSelect={() => setSelectedSlot({ type: 'text', id: slot.id })}
                  style={{
                    left: slot.x * scale,
                    bottom: slot.y * scale,
                    width: Math.max(96, Math.min(240, (slot.maxWidth ?? 180) * scale)),
                    height: 22
                  }}
                />
              ))}
            </div>
          </DndContext>
        </div>
        <p className="text-xs text-muted-foreground">Drag slots to reposition. Coordinates use the PDF bottom-left origin.</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Slot properties</p>
          <p className="text-sm font-medium">{slotHeader}</p>

          {selectedImage ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">X</p>
                <Input
                  type="number"
                  value={String(selectedImage.x)}
                  disabled={disabled}
                  onChange={(event) =>
                    updateSchema((draft) => {
                      const slot = draft.imageSlots.find((s) => s.id === selectedImage.id);
                      if (!slot) return draft;
                      slot.x = Number(event.target.value);
                      return draft;
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Y</p>
                <Input
                  type="number"
                  value={String(selectedImage.y)}
                  disabled={disabled}
                  onChange={(event) =>
                    updateSchema((draft) => {
                      const slot = draft.imageSlots.find((s) => s.id === selectedImage.id);
                      if (!slot) return draft;
                      slot.y = Number(event.target.value);
                      return draft;
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Width</p>
                <Input
                  type="number"
                  min={1}
                  value={String(selectedImage.width)}
                  disabled={disabled}
                  onChange={(event) =>
                    updateSchema((draft) => {
                      const slot = draft.imageSlots.find((s) => s.id === selectedImage.id);
                      if (!slot) return draft;
                      const next = Number(event.target.value);
                      if (Number.isFinite(next) && next > 0) slot.width = next;
                      return draft;
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Height</p>
                <Input
                  type="number"
                  min={1}
                  value={String(selectedImage.height)}
                  disabled={disabled}
                  onChange={(event) =>
                    updateSchema((draft) => {
                      const slot = draft.imageSlots.find((s) => s.id === selectedImage.id);
                      if (!slot) return draft;
                      const next = Number(event.target.value);
                      if (Number.isFinite(next) && next > 0) slot.height = next;
                      return draft;
                    })
                  }
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Fit</p>
                <Select
                  value={selectedImage.fit ?? 'cover'}
                  onValueChange={(next) =>
                    updateSchema((draft) => {
                      const slot = draft.imageSlots.find((s) => s.id === selectedImage.id);
                      if (!slot) return draft;
                      slot.fit = next as ImageSlot['fit'];
                      return draft;
                    })
                  }
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cover">Cover</SelectItem>
                    <SelectItem value="contain">Contain</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={disabled}
                  onClick={() =>
                    updateSchema((draft) => {
                      draft.imageSlots = draft.imageSlots.filter((slot) => slot.id !== selectedImage.id);
                      setSelectedSlot(null);
                      return draft;
                    })
                  }
                >
                  Remove slot
                </Button>
              </div>
            </div>
          ) : null}

          {selectedText ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">X</p>
                <Input
                  type="number"
                  value={String(selectedText.x)}
                  disabled={disabled}
                  onChange={(event) =>
                    updateSchema((draft) => {
                      const slot = draft.textSlots.find((s) => s.id === selectedText.id);
                      if (!slot) return draft;
                      slot.x = Number(event.target.value);
                      return draft;
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Y</p>
                <Input
                  type="number"
                  value={String(selectedText.y)}
                  disabled={disabled}
                  onChange={(event) =>
                    updateSchema((draft) => {
                      const slot = draft.textSlots.find((s) => s.id === selectedText.id);
                      if (!slot) return draft;
                      slot.y = Number(event.target.value);
                      return draft;
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Size</p>
                <Input
                  type="number"
                  min={1}
                  value={String(selectedText.size ?? 12)}
                  disabled={disabled}
                  onChange={(event) =>
                    updateSchema((draft) => {
                      const slot = draft.textSlots.find((s) => s.id === selectedText.id);
                      if (!slot) return draft;
                      const next = Number(event.target.value);
                      if (Number.isFinite(next) && next > 0) slot.size = next;
                      return draft;
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Max width</p>
                <Input
                  type="number"
                  min={1}
                  value={String(selectedText.maxWidth ?? '')}
                  disabled={disabled}
                  onChange={(event) =>
                    updateSchema((draft) => {
                      const slot = draft.textSlots.find((s) => s.id === selectedText.id);
                      if (!slot) return draft;
                      const raw = event.target.value;
                      if (!raw) {
                        slot.maxWidth = undefined;
                        return draft;
                      }
                      const next = Number(raw);
                      if (Number.isFinite(next) && next > 0) slot.maxWidth = next;
                      return draft;
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Align</p>
                <Select
                  value={selectedText.align ?? 'left'}
                  disabled={disabled}
                  onValueChange={(next) =>
                    updateSchema((draft) => {
                      const slot = draft.textSlots.find((s) => s.id === selectedText.id);
                      if (!slot) return draft;
                      slot.align = next as TextSlot['align'];
                      return draft;
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="center">Center</SelectItem>
                    <SelectItem value="right">Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Color</p>
                <Input
                  value={selectedText.color ?? ''}
                  disabled={disabled}
                  onChange={(event) =>
                    updateSchema((draft) => {
                      const slot = draft.textSlots.find((s) => s.id === selectedText.id);
                      if (!slot) return draft;
                      const next = event.target.value.trim();
                      slot.color = next.length > 0 ? next : undefined;
                      return draft;
                    })
                  }
                  placeholder="#111111"
                />
              </div>

              <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={disabled}
                  onClick={() =>
                    updateSchema((draft) => {
                      draft.textSlots = draft.textSlots.filter((slot) => slot.id !== selectedText.id);
                      setSelectedSlot(null);
                      return draft;
                    })
                  }
                >
                  Remove slot
                </Button>
              </div>
            </div>
          ) : null}
        </div>

      </div>
    </div>
  );
}
