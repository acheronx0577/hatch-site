import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type PdfOverlayBox = {
  id: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  value?: string | null;
  key?: string | null;
  fontSize?: number | null;
  erase?: boolean;
};

export type PdfOverlay = {
  version: 1;
  boxes: PdfOverlayBox[];
};

const MAX_OVERLAY_BOXES = 2000;

export function normalizePdfOverlay(raw: unknown): PdfOverlay {
  if (!raw || typeof raw !== 'object') {
    return { version: 1, boxes: [] };
  }
  const version = (raw as any).version;
  const boxesRaw = (raw as any).boxes;
  if (version !== 1 || !Array.isArray(boxesRaw)) {
    return { version: 1, boxes: [] };
  }

  const boxes: PdfOverlayBox[] = [];
  for (const entry of boxesRaw.slice(0, MAX_OVERLAY_BOXES)) {
    if (!entry || typeof entry !== 'object') continue;
    const id = typeof (entry as any).id === 'string' ? (entry as any).id : '';
    const page = (entry as any).page;
    const x = (entry as any).x;
    const y = (entry as any).y;
    const w = (entry as any).w;
    const h = (entry as any).h;
    if (!id) continue;
    if (typeof page !== 'number' || !Number.isFinite(page) || page < 1) continue;
    if (typeof x !== 'number' || !Number.isFinite(x)) continue;
    if (typeof y !== 'number' || !Number.isFinite(y)) continue;
    if (typeof w !== 'number' || !Number.isFinite(w) || w <= 0) continue;
    if (typeof h !== 'number' || !Number.isFinite(h) || h <= 0) continue;

    const value = (entry as any).value;
    const key = (entry as any).key;
    const fontSize = (entry as any).fontSize;
    const hasValue = Object.prototype.hasOwnProperty.call(entry, 'value');
    const hasErase = Object.prototype.hasOwnProperty.call(entry, 'erase');
    const eraseRaw = (entry as any).erase;
    const erase = hasErase && typeof eraseRaw === 'boolean' ? eraseRaw : undefined;

    boxes.push({
      id,
      page: Math.floor(page),
      x,
      y,
      w,
      h,
      value: !hasValue ? undefined : typeof value === 'string' ? value : value === null ? null : String(value),
      key: typeof key === 'string' ? key : null,
      fontSize: typeof fontSize === 'number' && Number.isFinite(fontSize) && fontSize > 0 ? fontSize : null,
      erase
    });
  }

  return { version: 1, boxes };
}

type PageSize = { pageNumber: number; width: number; height: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const multiplyTransforms = (a: number[], b: number[]) => {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5]
  ];
};

const generateId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
};

const normalizeFieldKey = (value: string) => value.replace(/[^a-z0-9]+/gi, '').toUpperCase();

type DetectedTextRegion = {
  id: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  fontSize: number;
};

export function PdfDraftEditor({
  pdfUrl,
  overlay,
  onChange,
  fieldValues,
  availableKeys,
  disabled
}: {
  pdfUrl: string;
  overlay: PdfOverlay;
  onChange: (next: PdfOverlay) => void;
  fieldValues?: Record<string, unknown>;
  availableKeys?: string[];
  disabled?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageSizes, setPageSizes] = useState<PageSize[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [autoFocusId, setAutoFocusId] = useState<string | null>(null);
  const [mode, setMode] = useState<'select' | 'add' | 'text'>('select');
  const [draftMode, setDraftMode] = useState<'write' | 'edit'>('write');
  const [zoom, setZoom] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detectInfo, setDetectInfo] = useState<string | null>(null);
  const detectAttemptedRef = useRef(false);
  const [placementKey, setPlacementKey] = useState<string>('');

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width;
      if (typeof width === 'number' && Number.isFinite(width)) {
        setContainerWidth(width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: any;

    setPdfDoc(null);
    setPageSizes([]);
    setSelectedId(null);
    setLoadError(null);
    setDetectInfo(null);
    detectAttemptedRef.current = false;

    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
        (pdfjs as any).GlobalWorkerOptions.workerSrc = workerUrl;

        loadingTask = (pdfjs as any).getDocument({ url: pdfUrl, withCredentials: true });
        const doc = await loadingTask.promise;
        if (cancelled) return;

        setPdfDoc(doc);

        const sizes: PageSize[] = [];
        for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
          const page = await doc.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1 });
          sizes.push({ pageNumber, width: viewport.width, height: viewport.height });
          page.cleanup?.();
        }
        if (cancelled) return;
        setPageSizes(sizes);
      } catch (error) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : String(error));
      }
    })();

    return () => {
      cancelled = true;
      try {
        loadingTask?.destroy?.();
      } catch {
        // ignore
      }
    };
  }, [pdfUrl]);

  const maxPageWidth = useMemo(
    () => Math.max(1, ...pageSizes.map((page) => page.width)),
    [pageSizes]
  );

  const fitScale = useMemo(() => {
    if (!containerWidth || !Number.isFinite(containerWidth)) return 1;
    const padding = 32;
    const available = Math.max(1, containerWidth - padding);
    return clamp(available / maxPageWidth, 0.25, 2);
  }, [containerWidth, maxPageWidth]);

  const scale = useMemo(() => clamp(fitScale * zoom, 0.25, 3), [fitScale, zoom]);

  const boxes = overlay?.boxes ?? [];

  const fieldValueForKey = (key: string) => {
    const raw = fieldValues?.[key];
    if (raw === null || raw === undefined) return '';
    return typeof raw === 'string' ? raw : String(raw);
  };

  const resolveBoxText = (box: PdfOverlayBox) => {
    if (box.value !== undefined) {
      return box.value ?? '';
    }
    const key = box.key?.trim();
    return key ? fieldValueForKey(key) : '';
  };

  const keyOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const key of availableKeys ?? []) {
      if (typeof key === 'string' && key.trim()) keys.add(key.trim());
    }
    for (const key of Object.keys(fieldValues ?? {})) {
      if (typeof key !== 'string') continue;
      const trimmed = key.trim();
      if (!trimmed || trimmed.startsWith('__')) continue;
      keys.add(trimmed);
    }
    return Array.from(keys).sort((a, b) => a.localeCompare(b));
  }, [availableKeys, fieldValues]);

  const fieldMeta = useMemo(() => {
    const raw = (fieldValues as any)?.__fieldMeta;
    if (!raw || typeof raw !== 'object') return null;
    return raw as Record<string, { source?: string; confidence?: number; sourcePath?: string | null }>;
  }, [fieldValues]);

  const fieldMetaByNormalized = useMemo(() => {
    if (!fieldMeta) return null;
    const map = new Map<string, { source?: string; confidence?: number; sourcePath?: string | null }>();
    for (const [key, meta] of Object.entries(fieldMeta)) {
      map.set(normalizeFieldKey(key), meta);
    }
    return map;
  }, [fieldMeta]);

  const resolveFieldMeta = (key: string) => {
    const trimmed = key.trim();
    if (!trimmed) return null;
    return fieldMeta?.[trimmed] ?? fieldMetaByNormalized?.get(normalizeFieldKey(trimmed)) ?? null;
  };

  const updateBoxes = (nextBoxes: PdfOverlayBox[]) => {
    const limited = nextBoxes.slice(0, MAX_OVERLAY_BOXES);
    onChange({ version: 1, boxes: limited });
    if (limited.length !== nextBoxes.length) {
      setDetectInfo(
        `Reached the max of ${MAX_OVERLAY_BOXES} editable blocks. Remove boxes or capture fewer pages to keep edits stable.`
      );
    }
  };

  const selectBox = (id: string | null) => {
    setSelectedId(id);
    if (!disabled && id) {
      setAutoFocusId(id);
    }
  };

  const selectedBox = useMemo(() => boxes.find((box) => box.id === selectedId) ?? null, [boxes, selectedId]);

  const deleteSelected = () => {
    if (!selectedId) return;
    updateBoxes(boxes.filter((box) => box.id !== selectedId));
    setSelectedId(null);
    setAutoFocusId(null);
  };

  const clearAll = () => {
    if (boxes.length === 0) return;
    if (typeof window !== 'undefined') {
      const ok = window.confirm('Clear all boxes?');
      if (!ok) return;
    }
    updateBoxes([]);
    setSelectedId(null);
    setAutoFocusId(null);
  };

  const captureAllText = async () => {
    if (!pdfDoc || pageSizes.length === 0 || detecting) return;
    setDetecting(true);
    setDetectInfo(null);

    try {
      const nextBoxes: PdfOverlayBox[] = [];
      const occupiedByPage = new Map<number, Array<{ x: number; y: number; w: number; h: number }>>();

      const addOccupied = (page: number, rect: { x: number; y: number; w: number; h: number }) => {
        const list = occupiedByPage.get(page) ?? [];
        list.push(rect);
        occupiedByPage.set(page, list);
      };

      const overlapsExisting = (page: number, rect: { x: number; y: number; w: number; h: number }) => {
        const list = occupiedByPage.get(page) ?? [];
        const areaA = rect.w * rect.h;
        if (!Number.isFinite(areaA) || areaA <= 0) return true;
        for (const other of list) {
          const xOverlap = Math.max(0, Math.min(rect.x + rect.w, other.x + other.w) - Math.max(rect.x, other.x));
          const yOverlap = Math.max(0, Math.min(rect.y + rect.h, other.y + other.h) - Math.max(rect.y, other.y));
          const intersection = xOverlap * yOverlap;
          if (intersection <= 0) continue;
          const areaB = other.w * other.h;
          const minArea = Math.min(areaA, areaB);
          if (minArea > 0 && intersection / minArea > 0.35) {
            return true;
          }
        }
        return false;
      };

      for (const existing of boxes) {
        addOccupied(existing.page, { x: existing.x, y: existing.y, w: existing.w, h: existing.h });
      }

      for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber += 1) {
        if (boxes.length + nextBoxes.length >= MAX_OVERLAY_BOXES) break;
        const pdfPage = await pdfDoc.getPage(pageNumber);
        const viewport = pdfPage.getViewport({ scale: 1 });
        const content = await pdfPage.getTextContent?.();
        const items = (content as any)?.items ?? [];

        type TextRun = { x: number; y: number; w: number; h: number; text: string; fontSize: number };
        const runs: TextRun[] = [];

        for (const item of (items as any[]).slice(0, 8000)) {
          const raw = typeof item?.str === 'string' ? item.str : '';
          const text = raw.replace(/\s+/g, ' ').trim();
          if (!text) continue;
          if (!Array.isArray(item?.transform)) continue;

          const combined = multiplyTransforms(viewport.transform, item.transform);
          const x0 = combined[4];
          const y0 = combined[5];
          if (!Number.isFinite(x0) || !Number.isFinite(y0)) continue;

          const rawWidth =
            typeof item.width === 'number' && Number.isFinite(item.width) ? item.width : Math.max(8, text.length * 6);
          const rawHeight =
            typeof item.height === 'number' && Number.isFinite(item.height)
              ? item.height
              : typeof item.transform?.[3] === 'number' && Number.isFinite(item.transform[3])
                ? Math.abs(item.transform[3])
                : 12;

          const h = clamp(Math.abs(rawHeight), 6, 160);
          const w = clamp(Math.abs(rawWidth), 4, viewport.width);
          const x = clamp(x0, 0, Math.max(0, viewport.width - w));
          const y = clamp(y0 - h, 0, Math.max(0, viewport.height - h));
          const fontSize = clamp(h, 6, 28);

          runs.push({ x, y, w, h, text, fontSize });
        }

        runs.sort((a, b) => (Math.abs(a.y - b.y) < 4 ? a.x - b.x : a.y - b.y));

        const merged: Array<TextRun> = [];
        for (const run of runs) {
          const last = merged[merged.length - 1];
          if (last) {
            const yMidA = run.y + run.h / 2;
            const yMidB = last.y + last.h / 2;
            const yThresh = Math.max(4, Math.min(run.h, last.h) * 0.35);
            const gap = run.x - (last.x + last.w);
            const gapThresh = Math.max(12, Math.min(run.h, last.h) * 1.2);
            const sameLine = Math.abs(yMidA - yMidB) < yThresh;

            if (sameLine) {
              const xOverlap = Math.max(0, Math.min(last.x + last.w, run.x + run.w) - Math.max(last.x, run.x));
              const yOverlap = Math.max(0, Math.min(last.y + last.h, run.y + run.h) - Math.max(last.y, run.y));
              const intersection = xOverlap * yOverlap;
              const areaA = Math.max(1, run.w * run.h);
              const areaB = Math.max(1, last.w * last.h);
              const overlap = intersection / Math.min(areaA, areaB);

              if (overlap > 0.65) {
                const x0 = Math.min(last.x, run.x);
                const y0 = Math.min(last.y, run.y);
                const x1 = Math.max(last.x + last.w, run.x + run.w);
                const y1 = Math.max(last.y + last.h, run.y + run.h);
                last.x = x0;
                last.y = y0;
                last.w = x1 - x0;
                last.h = y1 - y0;
                last.text = run.text.length > last.text.length ? run.text : last.text;
                last.fontSize = Math.max(last.fontSize, run.fontSize);
                continue;
              }

              if (gap >= -2 && gap < gapThresh) {
                const nextText = gap > 2 ? `${last.text} ${run.text}` : `${last.text}${run.text}`;
                const x0 = Math.min(last.x, run.x);
                const y0 = Math.min(last.y, run.y);
                const x1 = Math.max(last.x + last.w, run.x + run.w);
                const y1 = Math.max(last.y + last.h, run.y + run.h);
                last.x = x0;
                last.y = y0;
                last.w = x1 - x0;
                last.h = y1 - y0;
                last.text = nextText;
                last.fontSize = Math.max(last.fontSize, run.fontSize);
                continue;
              }
            }
          }
          merged.push({ ...run });
        }

        for (const region of merged.filter((r) => r.w > 6 && r.h > 6)) {
          if (boxes.length + nextBoxes.length >= MAX_OVERLAY_BOXES) break;
          if (overlapsExisting(pageNumber, region)) continue;

          const id = `auto:edit:${pageNumber}:${Math.round(region.x)}:${Math.round(region.y)}:${Math.round(region.w)}:${Math.round(region.h)}`;
          nextBoxes.push({
            id,
            page: pageNumber,
            x: region.x,
            y: region.y,
            w: region.w,
            h: region.h,
            value: region.text,
            key: null,
            fontSize: clamp(region.fontSize, 6, 28),
            erase: true
          });
          addOccupied(pageNumber, region);
        }
        pdfPage.cleanup?.();
      }

      if (nextBoxes.length === 0) {
        setDetectInfo('No text blocks detected. Try zooming in or use “Edit text” to pick specific regions.');
        return;
      }

      updateBoxes([...boxes, ...nextBoxes]);
      setDetectInfo(`Captured ${nextBoxes.length} editable text blocks. Review and delete any you don’t need before saving.`);
    } catch (error) {
      setDetectInfo(`Text capture failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setDetecting(false);
    }
  };

  const upsertBox = (id: string, patch: Partial<PdfOverlayBox>) => {
    updateBoxes(
      boxes.map((box) => (box.id === id ? { ...box, ...patch } : box))
    );
  };

  const addBox = (pageNumber: number, x: number, y: number) => {
    const page = pageSizes.find((p) => p.pageNumber === pageNumber);
    if (!page) return;
    const id = generateId();
    const w = 220;
    const h = 22;
    const key = placementKey.trim() ? placementKey.trim() : null;
    const next: PdfOverlayBox = {
      id,
      page: pageNumber,
      x: clamp(x, 0, Math.max(0, page.width - w)),
      y: clamp(y, 0, Math.max(0, page.height - h)),
      w,
      h,
      fontSize: 10,
      key,
      value: key ? undefined : '',
      erase: false
    };
    updateBoxes([...boxes, next]);
    setSelectedId(id);
    setAutoFocusId(id);
  };

  const addBoxFromTextRegion = (region: DetectedTextRegion) => {
    const page = pageSizes.find((p) => p.pageNumber === region.page);
    if (!page) return;

    const existing = boxes.find((box) => {
      if (box.page !== region.page) return false;
      return (
        Math.abs(box.x - region.x) < 2 &&
        Math.abs(box.y - region.y) < 2 &&
        Math.abs(box.w - region.w) < 4 &&
        Math.abs(box.h - region.h) < 4
      );
    });
    if (existing) {
      setSelectedId(existing.id);
      return;
    }

    const id = generateId();
    const w = clamp(region.w, 30, page.width);
    const h = clamp(region.h, 18, page.height);
    const next: PdfOverlayBox = {
      id,
      page: region.page,
      x: clamp(region.x, 0, Math.max(0, page.width - w)),
      y: clamp(region.y, 0, Math.max(0, page.height - h)),
      w,
      h,
      fontSize: clamp(region.fontSize, 6, 28),
      key: null,
      value: region.text,
      erase: true
    };
    updateBoxes([...boxes, next]);
    setSelectedId(id);
    setAutoFocusId(id);
  };

  const detectBoxes = async () => {
    if (!pdfDoc || pageSizes.length === 0 || detecting) return;
    setDetecting(true);
    setDetectInfo(null);

    try {
      const nextBoxes: PdfOverlayBox[] = [];
      const existingByKeyPage = new Set(
        boxes
          .filter((box) => box.key && typeof box.key === 'string')
          .map((box) => `${box.page}:${String(box.key)}`)
      );
      const occupiedByPage = new Map<number, Array<{ x: number; y: number; w: number; h: number }>>();

      const addOccupied = (page: number, rect: { x: number; y: number; w: number; h: number }) => {
        const list = occupiedByPage.get(page) ?? [];
        list.push(rect);
        occupiedByPage.set(page, list);
      };

      const overlapsExisting = (page: number, rect: { x: number; y: number; w: number; h: number }) => {
        const list = occupiedByPage.get(page) ?? [];
        const areaA = rect.w * rect.h;
        if (!Number.isFinite(areaA) || areaA <= 0) return true;
        for (const other of list) {
          const xOverlap = Math.max(
            0,
            Math.min(rect.x + rect.w, other.x + other.w) - Math.max(rect.x, other.x)
          );
          const yOverlap = Math.max(
            0,
            Math.min(rect.y + rect.h, other.y + other.h) - Math.max(rect.y, other.y)
          );
          const intersection = xOverlap * yOverlap;
          if (intersection <= 0) continue;
          const areaB = other.w * other.h;
          const minArea = Math.min(areaA, areaB);
          if (minArea > 0 && intersection / minArea > 0.35) {
            return true;
          }
        }
        return false;
      };

      for (const existing of boxes) {
        addOccupied(existing.page, { x: existing.x, y: existing.y, w: existing.w, h: existing.h });
      }

      for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber += 1) {
        const pdfPage = await pdfDoc.getPage(pageNumber);
        const viewport = pdfPage.getViewport({ scale: 1 });
        let textItemsForPage: any[] = [];

        // 1) AcroForm / widget fields
        try {
          const annotations = await pdfPage.getAnnotations?.({ intent: 'display' });
          for (const annot of annotations ?? []) {
            if (!annot || typeof annot !== 'object') continue;
            if ((annot as any).subtype !== 'Widget') continue;
            const fieldName = typeof (annot as any).fieldName === 'string' ? (annot as any).fieldName.trim() : '';
            if (!fieldName) continue;
            if (existingByKeyPage.has(`${pageNumber}:${fieldName}`)) continue;

            const rect = (annot as any).rect;
            if (!Array.isArray(rect) || rect.length < 4) continue;
            const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(rect);
            const left = Math.min(x1, x2);
            const top = Math.min(y1, y2);
            const w = Math.abs(x2 - x1);
            const h = Math.abs(y2 - y1);
            if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(w) || !Number.isFinite(h)) continue;
            if (w < 18 || h < 10) continue;
            if (overlapsExisting(pageNumber, { x: left, y: top, w, h })) continue;

            const id = `auto:widget:${pageNumber}:${fieldName}:${Math.round(left)}:${Math.round(top)}`;
            const valueFromKey = fieldValueForKey(fieldName);
            const value = valueFromKey.length ? undefined : String((annot as any).fieldValue ?? '');
            const fontSize = clamp(Math.round(h * 0.65), 8, 14);

            nextBoxes.push({
              id,
              page: pageNumber,
              x: clamp(left, 0, Math.max(0, viewport.width - w)),
              y: clamp(top, 0, Math.max(0, viewport.height - h)),
              w,
              h,
              key: fieldName,
              value,
              fontSize
            });
            existingByKeyPage.add(`${pageNumber}:${fieldName}`);
            addOccupied(pageNumber, { x: left, y: top, w, h });
          }
        } catch {
          // ignore widget detection errors
        }

        // 2) Heuristic anchors for common contract blanks
        try {
          const textContent = await pdfPage.getTextContent?.();
          const items = (textContent as any)?.items ?? [];
          textItemsForPage = Array.isArray(items) ? items : [];
          const rules = [
            {
              key: 'SELLER_NAME',
              match: (rawUpper: string, alphaUpper: string) => alphaUpper.startsWith('SELLER'),
              prefer: (rawUpper: string) => rawUpper.includes(':')
            },
            {
              key: 'BUYER_NAME',
              match: (rawUpper: string, alphaUpper: string) => alphaUpper.startsWith('BUYER') || alphaUpper.startsWith('PURCHASER'),
              prefer: (rawUpper: string) => rawUpper.includes(':')
            },
            {
              key: 'PROPERTY_ADDRESS',
              match: (rawUpper: string, alphaUpper: string) => {
                if (rawUpper.startsWith('PROPERTY') && rawUpper.includes('ADDRESS')) return true;
                return alphaUpper.startsWith('PROPERTY');
              },
              prefer: (rawUpper: string) => rawUpper.includes('ADDRESS') || rawUpper.includes('LOCATED')
            }
          ] as const;

          for (const rule of rules) {
            if (existingByKeyPage.has(`${pageNumber}:${rule.key}`)) continue;
            const candidates = (items as any[]).filter((item) => {
              const raw = typeof item?.str === 'string' ? item.str.trim() : '';
              if (raw.length === 0) return false;
              const rawUpper = raw.toUpperCase();
              const alphaUpper = rawUpper.replace(/[^A-Z]/g, '');
              if (!rule.match(rawUpper, alphaUpper)) return false;
              if (!Array.isArray(item?.transform)) return false;
              return true;
            });

            let anchor: any | null = null;
            for (const candidate of candidates) {
              const combined = multiplyTransforms(viewport.transform, candidate.transform);
              const x0 = combined[4];
              const y0 = combined[5];
              if (!Number.isFinite(x0) || !Number.isFinite(y0)) continue;
              if (x0 > viewport.width * 0.7) continue;
              if (y0 > viewport.height * 0.7) continue;
              anchor = candidate;
              break;
            }

            if (!anchor) {
              anchor = candidates.find((candidate) => {
                const raw = typeof candidate?.str === 'string' ? candidate.str.trim() : '';
                return raw.length > 0 && rule.prefer(raw.toUpperCase());
              }) ?? candidates[0] ?? null;
            }

            if (!anchor || !Array.isArray(anchor.transform)) continue;

            const combined = multiplyTransforms(viewport.transform, anchor.transform);
            const x0 = combined[4];
            const y0 = combined[5];
            const rawStr = typeof anchor?.str === 'string' ? anchor.str.trim() : rule.key;
            const labelEnd = rawStr.indexOf(':');
            const labelText = labelEnd >= 0 ? rawStr.slice(0, labelEnd + 1) : rawStr;
            const width = typeof anchor.width === 'number' && Number.isFinite(anchor.width) ? anchor.width : 120;
            const ratio = rawStr.length > 0 ? clamp(labelText.length / rawStr.length, 0, 1) : 1;
            const x = x0 + width * ratio + 8;
            const fontSize = 10;
            const h = 20;
            const y = y0 - fontSize - 6;
            const w = clamp(260, 120, Math.max(120, viewport.width - x - 8));

            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            if (x < 0 || y < 0 || x > viewport.width || y > viewport.height) continue;
            if (overlapsExisting(pageNumber, { x, y, w, h })) continue;

            nextBoxes.push({
              id: `auto:anchor:${pageNumber}:${rule.key}:${Math.round(x)}:${Math.round(y)}`,
              page: pageNumber,
              x: clamp(x, 0, Math.max(0, viewport.width - w)),
              y: clamp(y, 0, Math.max(0, viewport.height - h)),
              w,
              h,
              key: rule.key,
              value: undefined,
              fontSize
            });
            existingByKeyPage.add(`${pageNumber}:${rule.key}`);
            addOccupied(pageNumber, { x, y, w, h });
          }

          // 3) Blank lines drawn as underscores/dots in the text layer.
          const blankCandidates: Array<{ x: number; y: number; w: number; h: number }> = [];
          for (const item of items as any[]) {
            const raw = typeof item?.str === 'string' ? item.str : '';
            if (!raw) continue;
            const trimmed = raw.trim();
            if (trimmed.length < 5) continue;
            const underscoreCount = (trimmed.match(/_/g) ?? []).length;
            const dotCount = (trimmed.match(/\./g) ?? []).length;
            const totalMarkers = underscoreCount + dotCount;
            if (totalMarkers < 5) continue;
            const markerRatio = totalMarkers / trimmed.length;
            if (markerRatio < 0.5) continue;
            if (!Array.isArray(item?.transform)) continue;

            const combined = multiplyTransforms(viewport.transform, item.transform);
            const x0 = combined[4];
            const y0 = combined[5];
            if (!Number.isFinite(x0) || !Number.isFinite(y0)) continue;

            const itemWidth =
              typeof item.width === 'number' && Number.isFinite(item.width) ? item.width : Math.max(80, trimmed.length * 6);
            const itemHeight =
              typeof item.height === 'number' && Number.isFinite(item.height)
                ? item.height
                : typeof item.transform?.[3] === 'number' && Number.isFinite(item.transform[3])
                  ? Math.abs(item.transform[3])
                  : 12;

            let w = clamp(itemWidth, 30, viewport.width);
            const h = clamp(Math.max(itemHeight + 8, 18), 18, 26);
            let x = x0;
            const y = y0 - h;
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            const markerExec = /[_\.]{3,}/.exec(trimmed);
            if (markerExec) {
              const markerIndex = markerExec.index ?? 0;
              const markerLen = markerExec[0]?.length ?? 0;
              if (trimmed.length > 0 && markerLen > 0) {
                const avgCharWidth = w / trimmed.length;
                const shift = avgCharWidth * markerIndex;
                const markerWidth = avgCharWidth * markerLen;
                const endX = x0 + w;
                const startX = x0 + shift - 2;
                const desiredWidth = markerWidth + 4;
                const minWidth = 50;
                let width = desiredWidth >= minWidth ? desiredWidth : endX - startX;
                if (width >= minWidth) {
                  const clampedX = clamp(startX, 0, Math.max(0, viewport.width - width));
                  width = clamp(width, minWidth, Math.max(minWidth, viewport.width - clampedX));
                  x = clampedX;
                  w = width;
                }
              }
            }

            if (w < 50) continue;
            if (x < 0 || y < 0 || x > viewport.width || y > viewport.height) continue;

            blankCandidates.push({
              x: clamp(x, 0, Math.max(0, viewport.width - w)),
              y: clamp(y, 0, Math.max(0, viewport.height - h)),
              w,
              h
            });
          }

          blankCandidates.sort((a, b) => (Math.abs(a.y - b.y) < 6 ? a.x - b.x : a.y - b.y));
          const mergedBlanks: Array<{ x: number; y: number; w: number; h: number }> = [];
          for (const candidate of blankCandidates) {
            const last = mergedBlanks[mergedBlanks.length - 1];
            if (last && Math.abs(candidate.y - last.y) < 6) {
              const lastEnd = last.x + last.w;
              const gap = candidate.x - lastEnd;
              if (gap >= -2 && gap < 14) {
                const newEnd = Math.max(lastEnd, candidate.x + candidate.w);
                last.w = newEnd - last.x;
                last.h = Math.max(last.h, candidate.h);
                last.y = Math.min(last.y, candidate.y);
                continue;
              }
            }
            mergedBlanks.push({ ...candidate });
          }

          for (const rect of mergedBlanks.slice(0, 120)) {
            if (overlapsExisting(pageNumber, rect)) continue;
            nextBoxes.push({
              id: `auto:blank:${pageNumber}:${Math.round(rect.x)}:${Math.round(rect.y)}`,
              page: pageNumber,
              x: rect.x,
              y: rect.y,
              w: rect.w,
              h: rect.h,
              value: undefined,
              key: null,
              fontSize: 10
            });
            addOccupied(pageNumber, rect);
          }
        } catch {
          // ignore text detection errors
        }

        // 4) Raster-based line detection (closest to Acrobat "Prepare Form" for flat PDFs).
        if ((occupiedByPage.get(pageNumber)?.length ?? 0) < 40) {
          try {
            const renderScale = 2;
            const renderViewport = pdfPage.getViewport({ scale: renderScale });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(renderViewport.width);
            canvas.height = Math.ceil(renderViewport.height);
            const ctx = canvas.getContext('2d', { willReadFrequently: true } as any);
            if (ctx) {
              await pdfPage.render({ canvasContext: ctx, viewport: renderViewport }).promise;
              const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const { data, width, height } = image;

              const isDark = (index: number) => {
                const a = data[index + 3];
                if (a < 120) return false;
                const r = data[index];
                const g = data[index + 1];
                const b = data[index + 2];
                const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                return luminance < 215;
              };

              const isDarkXY = (x: number, y: number) => {
                if (x < 0 || y < 0 || x >= width || y >= height) return false;
                const idx = (y * width + x) * 4;
                return isDark(idx);
              };

              const minLen = Math.max(70, Math.floor(width * 0.12));
              const step = 1;
              const segments: Array<{ y: number; x0: number; x1: number }> = [];

              for (let y = 0; y < height; y += step) {
                let runStart = -1;
                for (let x = 0; x < width; x += step) {
                  const idx = (y * width + x) * 4;
                  const dark = isDark(idx) || (y + 1 < height && isDark(((y + 1) * width + x) * 4));
                  if (dark) {
                    if (runStart === -1) runStart = x;
                  } else if (runStart !== -1) {
                    const runEnd = x - step;
                    const runLen = runEnd - runStart;
                    if (runLen >= minLen) {
                      segments.push({ y, x0: runStart, x1: runEnd });
                    }
                    runStart = -1;
                  }
                }

                if (runStart !== -1) {
                  const runEnd = width - step;
                  const runLen = runEnd - runStart;
                  if (runLen >= minLen) {
                    segments.push({ y, x0: runStart, x1: runEnd });
                  }
                }
              }

              segments.sort((a, b) => (a.y === b.y ? a.x0 - b.x0 : a.y - b.y));
              const lines: Array<{ y0: number; y1: number; x0: number; x1: number }> = [];
              for (const seg of segments) {
                const last = lines[lines.length - 1];
                if (last && seg.y - last.y1 <= 3) {
                  const overlap = Math.max(0, Math.min(last.x1, seg.x1) - Math.max(last.x0, seg.x0));
                  const overlapRatio = overlap / Math.max(1, Math.min(last.x1 - last.x0, seg.x1 - seg.x0));
                  if (overlapRatio > 0.55) {
                    last.y1 = seg.y;
                    last.x0 = Math.min(last.x0, seg.x0);
                    last.x1 = Math.max(last.x1, seg.x1);
                    continue;
                  }
                }
                lines.push({ y0: seg.y, y1: seg.y, x0: seg.x0, x1: seg.x1 });
              }

              const candidateLines = lines
                .map((line, index) => ({ ...line, index }))
                .filter((line) => {
                  const thickness = line.y1 - line.y0;
                  if (thickness > 6) return false;
                  const wPx = line.x1 - line.x0;
                  return wPx >= minLen;
                })
                .sort((a, b) => a.y0 - b.y0);

              const hasVerticalEdge = (x: number, yTop: number, yBottom: number, side: 'left' | 'right') => {
                const xi = Math.round(x);
                const offsets = side === 'left' ? [0, 1, 2, 3] : [0, -1, -2, -3];
                let hits = 0;
                let samples = 0;
                for (let y = Math.round(yTop); y <= Math.round(yBottom); y += 2) {
                  samples += 1;
                  let dark = false;
                  for (const off of offsets) {
                    if (isDarkXY(xi + off, y)) {
                      dark = true;
                      break;
                    }
                  }
                  if (dark) hits += 1;
                }
                if (samples === 0) return false;
                return hits / samples > 0.25;
              };

              const used = new Set<number>();
              const rectPairs: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];

              for (let i = 0; i < candidateLines.length; i += 1) {
                if (used.has(i)) continue;
                const top = candidateLines[i];
                const topW = top.x1 - top.x0;
                const maxGap = 90;
                let best = -1;
                let bestScore = -1;

                for (let j = i + 1; j < candidateLines.length; j += 1) {
                  if (used.has(j)) continue;
                  const bottom = candidateLines[j];
                  const dy = bottom.y0 - top.y1;
                  if (dy < 10) continue;
                  if (dy > maxGap) break;

                  const bottomW = bottom.x1 - bottom.x0;
                  const overlap = Math.max(0, Math.min(top.x1, bottom.x1) - Math.max(top.x0, bottom.x0));
                  const minW = Math.max(1, Math.min(topW, bottomW));
                  const overlapRatio = overlap / minW;
                  const widthRatio = Math.max(topW, bottomW) / minW;
                  if (overlapRatio < 0.86) continue;
                  if (widthRatio > 1.25) continue;

                  const heightPenalty = Math.abs(dy - 36) / 200;
                  const score = overlapRatio - (widthRatio - 1) * 0.5 - heightPenalty;
                  if (score > bestScore) {
                    best = j;
                    bestScore = score;
                  }
                }

                if (best === -1) continue;
                const bottom = candidateLines[best];

                const leftX = Math.min(top.x0, bottom.x0);
                const rightX = Math.max(top.x1, bottom.x1);
                const yTopEdge = top.y1 + 1;
                const yBottomEdge = bottom.y0 - 1;
                if (yBottomEdge <= yTopEdge) continue;

                const leftOk = hasVerticalEdge(leftX, yTopEdge, yBottomEdge, 'left');
                const rightOk = hasVerticalEdge(rightX, yTopEdge, yBottomEdge, 'right');
                if (!leftOk || !rightOk) continue;

                used.add(i);
                used.add(best);
                rectPairs.push({ x0: leftX, y0: top.y0, x1: rightX, y1: bottom.y1 });
              }

              const candidates: Array<{ x: number; y: number; w: number; h: number }> = [];
              const minFieldWidth = 70;
              const inset = 1 / renderScale;

              for (const rectPx of rectPairs) {
                const xPt = rectPx.x0 / renderScale;
                const yPt = rectPx.y0 / renderScale;
                const wPt = (rectPx.x1 - rectPx.x0) / renderScale;
                const hPt = (rectPx.y1 - rectPx.y0) / renderScale;
                if (!Number.isFinite(xPt) || !Number.isFinite(yPt) || !Number.isFinite(wPt) || !Number.isFinite(hPt)) continue;
                if (wPt < minFieldWidth || hPt < 12) continue;
                if (wPt > viewport.width * 0.95) continue;

                const w = clamp(wPt - inset * 2, minFieldWidth, viewport.width);
                const h = clamp(hPt - inset * 2, 18, 34);
                const x = clamp(xPt + inset, 0, Math.max(0, viewport.width - w));
                const y = clamp(yPt + inset, 0, Math.max(0, viewport.height - h));

                candidates.push({ x, y, w, h });
              }

              for (let i = 0; i < candidateLines.length; i += 1) {
                if (used.has(i)) continue;
                const line = candidateLines[i];
                const wPx = line.x1 - line.x0;
                const xPt = line.x0 / renderScale;
                const wPt = wPx / renderScale;
                if (wPt < minFieldWidth) continue;
                if (wPt > viewport.width * 0.95) continue;
                const yLinePt = line.y1 / renderScale;
                const hPt = 18;
                const yPt = yLinePt - hPt;

                const w = Math.max(0, wPt - inset * 2);
                const rect = {
                  x: clamp(xPt + inset, 0, Math.max(0, viewport.width - w)),
                  y: clamp(yPt, 0, Math.max(0, viewport.height - hPt)),
                  w,
                  h: hPt
                };
                if (rect.w >= minFieldWidth) {
                  candidates.push(rect);
                }
              }

              const trimmedCandidates: Array<{ x: number; y: number; w: number; h: number }> = [];
              for (const baseRect of candidates.slice(0, 320)) {
                const rect = { ...baseRect };

                if (textItemsForPage.length > 0) {
                  const rectEnd = rect.x + rect.w;
                  const maxLabelX = rect.x + Math.min(180, rect.w * 0.45);
                  let labelRight = -1;

                  for (const item of textItemsForPage) {
                    const raw = typeof item?.str === 'string' ? item.str.trim() : '';
                    if (!raw) continue;
                    const markerCount = (raw.match(/_/g) ?? []).length + (raw.match(/\./g) ?? []).length;
                    const markerRatio = raw.length > 0 ? markerCount / raw.length : 1;
                    if (markerRatio > 0.4) continue;
                    if (!Array.isArray(item?.transform)) continue;

                    const combined = multiplyTransforms(viewport.transform, item.transform);
                    const x0 = combined[4];
                    const y0 = combined[5];
                    if (!Number.isFinite(x0) || !Number.isFinite(y0)) continue;
                    if (x0 > maxLabelX) continue;

                    const itemWidth =
                      typeof item.width === 'number' && Number.isFinite(item.width) ? item.width : Math.max(8, raw.length * 6);
                    const itemHeight =
                      typeof item.height === 'number' && Number.isFinite(item.height)
                        ? item.height
                        : typeof item.transform?.[3] === 'number' && Number.isFinite(item.transform[3])
                          ? Math.abs(item.transform[3])
                          : 12;

                    const itemH = clamp(Math.abs(itemHeight), 6, 200);
                    const itemW = clamp(Math.abs(itemWidth), 4, viewport.width);
                    const itemTop = y0 - itemH;
                    const itemBottom = y0;
                    const rectTop = rect.y - 10;
                    const rectBottom = rect.y + rect.h + 10;
                    const yOverlap = Math.max(0, Math.min(itemBottom, rectBottom) - Math.max(itemTop, rectTop));
                    if (yOverlap <= 0) continue;

                    const right = x0 + itemW;
                    labelRight = Math.max(labelRight, right);
                  }

                  const proposedX = labelRight > 0 ? labelRight + 4 : null;
                  if (proposedX !== null && proposedX > rect.x + 6 && proposedX < rectEnd - minFieldWidth) {
                    rect.x = clamp(proposedX, 0, rectEnd - minFieldWidth);
                    rect.w = rectEnd - rect.x;
                  }
                }

                if (rect.w < minFieldWidth) continue;
                trimmedCandidates.push(rect);
              }

              for (const rect of trimmedCandidates) {
                if (overlapsExisting(pageNumber, rect)) continue;
                nextBoxes.push({
                  id: `auto:line:${pageNumber}:${Math.round(rect.x)}:${Math.round(rect.y)}`,
                  page: pageNumber,
                  x: rect.x,
                  y: rect.y,
                  w: rect.w,
                  h: rect.h,
                  value: undefined,
                  key: null,
                  fontSize: 10
                });
                addOccupied(pageNumber, rect);
              }
            }
          } catch {
            // ignore raster detection errors
          }
        }

        pdfPage.cleanup?.();
      }

      const overlapRatio = (
        a: { x: number; y: number; w: number; h: number },
        b: { x: number; y: number; w: number; h: number }
      ) => {
        const areaA = a.w * a.h;
        const areaB = b.w * b.h;
        if (!Number.isFinite(areaA) || !Number.isFinite(areaB) || areaA <= 0 || areaB <= 0) return 1;
        const xOverlap = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
        const yOverlap = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        const intersection = xOverlap * yOverlap;
        if (intersection <= 0) return 0;
        const minArea = Math.min(areaA, areaB);
        return minArea > 0 ? intersection / minArea : 1;
      };

      const priorityForId = (id: string) => {
        if (id.startsWith('auto:widget:')) return 4;
        if (id.startsWith('auto:anchor:')) return 3;
        if (id.startsWith('auto:blank:')) return 2;
        if (id.startsWith('auto:line:')) return 1;
        return 0;
      };

      const dedupedNextBoxes: PdfOverlayBox[] = [];
      for (const candidate of nextBoxes) {
        const candidateRect = { x: candidate.x, y: candidate.y, w: candidate.w, h: candidate.h };
        let mergedIntoExisting = false;

        for (let index = 0; index < dedupedNextBoxes.length; index += 1) {
          const existing = dedupedNextBoxes[index];
          if (existing.page !== candidate.page) continue;
          const ratio = overlapRatio(candidateRect, { x: existing.x, y: existing.y, w: existing.w, h: existing.h });
          if (ratio < 0.65) continue;

          const priorityA = priorityForId(candidate.id);
          const priorityB = priorityForId(existing.id);
          const areaA = candidate.w * candidate.h;
          const areaB = existing.w * existing.h;

          if (priorityA > priorityB || (priorityA === priorityB && areaA > areaB)) {
            dedupedNextBoxes[index] = candidate;
          }
          mergedIntoExisting = true;
          break;
        }

        if (!mergedIntoExisting) {
          dedupedNextBoxes.push(candidate);
        }
      }

      if (dedupedNextBoxes.length === 0) {
        setDetectInfo('No fields detected in this PDF. Use “Add box” to place fields manually.');
        return;
      }

      const merged =
        boxes.length === 0
          ? dedupedNextBoxes
          : [
              ...boxes,
              ...dedupedNextBoxes.filter((candidate) => {
                if (candidate.key) {
                  return !boxes.some((existing) => existing.page === candidate.page && existing.key === candidate.key);
                }
                return !boxes.some((existing) => existing.id === candidate.id);
              })
            ];

      updateBoxes(merged);
      setSelectedId((prev) => prev ?? merged[0]?.id ?? null);
      setDetectInfo(`Detected ${dedupedNextBoxes.length} field${dedupedNextBoxes.length === 1 ? '' : 's'}.`);
    } catch (error) {
      setDetectInfo(`Field detection failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setDetecting(false);
    }
  };

  useEffect(() => {
    if (!pdfDoc || pageSizes.length === 0) return;
    if (detectAttemptedRef.current) return;
    if (boxes.length > 0) return;
    if (draftMode !== 'write') return;
    detectAttemptedRef.current = true;
    void detectBoxes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftMode, pdfDoc, pageSizes.length]);

  useEffect(() => {
    if (!autoFocusId) return;
    if (selectedId !== autoFocusId) return;
    setAutoFocusId(null);
  }, [autoFocusId, selectedId]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-1 py-1">
            <Button
              type="button"
              size="sm"
              variant={draftMode === 'write' ? 'default' : 'ghost'}
              onClick={() => {
                setDraftMode('write');
                setMode('select');
              }}
              disabled={Boolean(disabled)}
            >
              Write mode
            </Button>
            <Button
              type="button"
              size="sm"
              variant={draftMode === 'edit' ? 'default' : 'ghost'}
              onClick={() => {
                setDraftMode('edit');
                setMode('text');
              }}
              disabled={Boolean(disabled) || pageSizes.length === 0}
            >
              Edit mode
            </Button>
          </div>

          <Button
            type="button"
            size="sm"
            variant={mode === 'select' ? 'default' : 'outline'}
            onClick={() => setMode('select')}
            disabled={Boolean(disabled)}
          >
            Select
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === 'add' ? 'default' : 'outline'}
            onClick={() => setMode(mode === 'add' ? 'select' : 'add')}
            disabled={Boolean(disabled) || pageSizes.length === 0}
          >
            Add box
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === 'text' ? 'default' : 'outline'}
            onClick={() => setMode(mode === 'text' ? 'select' : 'text')}
            disabled={Boolean(disabled) || pageSizes.length === 0}
          >
            Edit text
          </Button>
          <div className="w-64">
            <Select
              value={placementKey.trim() ? placementKey : '__none'}
              onValueChange={(value) => setPlacementKey(value === '__none' ? '' : value)}
              disabled={Boolean(disabled)}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Text (no key)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Text (no key)</SelectItem>
                {keyOptions.map((key) => (
                  <SelectItem key={key} value={key}>
                    {key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void (draftMode === 'edit' ? captureAllText() : detectBoxes())}
            disabled={Boolean(disabled) || detecting || !pdfDoc}
          >
            {detecting ? 'Detecting…' : draftMode === 'edit' ? 'Capture text' : 'Detect fields'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={deleteSelected}
            disabled={Boolean(disabled) || !selectedId}
          >
            Delete
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={clearAll}
            disabled={Boolean(disabled) || boxes.length === 0}
          >
            Clear all
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setZoom((z) => clamp(z - 0.1, 0.5, 2))}>
            -
          </Button>
          <span className="min-w-[4rem] text-center text-xs text-slate-600">{Math.round(scale * 100)}%</span>
          <Button type="button" size="sm" variant="outline" onClick={() => setZoom((z) => clamp(z + 0.1, 0.5, 2))}>
            +
          </Button>
        </div>
      </div>

      {detectInfo ? <div className="text-xs text-slate-500">{detectInfo}</div> : null}
      {selectedBox ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Selected</span>
          <div className="w-64">
            <Select
              value={selectedBox.key?.trim() ? selectedBox.key.trim() : '__none'}
              onValueChange={(value) => {
                const nextKey = value === '__none' ? null : value;
                const nextValue = nextKey ? undefined : resolveBoxText(selectedBox);
                upsertBox(selectedBox.id, { key: nextKey, value: nextValue });
              }}
              disabled={Boolean(disabled)}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Text (no key)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Text (no key)</SelectItem>
                {keyOptions.map((key) => (
                  <SelectItem key={key} value={key}>
                    {key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedBox.key?.trim() ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => upsertBox(selectedBox.id, { value: undefined })}
              disabled={Boolean(disabled)}
            >
              Use autofill
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => upsertBox(selectedBox.id, { value: resolveBoxText(selectedBox), erase: true })}
            disabled={Boolean(disabled)}
          >
            Make manual
          </Button>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={Boolean(selectedBox.erase)}
              onCheckedChange={(checked) => upsertBox(selectedBox.id, { erase: checked === true })}
              disabled={Boolean(disabled)}
            />
            <span className="text-xs text-slate-600">Erase behind text</span>
          </div>
          {selectedBox.key?.trim() && resolveFieldMeta(selectedBox.key) ? (
            <div className="w-full text-xs text-slate-500">
              {(() => {
                const meta = resolveFieldMeta(selectedBox.key ?? '');
                if (!meta) return null;
                return (
                  <>
                    Autofill: {meta.source ?? 'Unknown'}
                    {typeof meta.confidence === 'number' ? ` · ${Math.round((meta.confidence ?? 0) * 100)}% confidence` : ''}
                    {meta.sourcePath ? ` · ${String(meta.sourcePath)}` : ''}
                  </>
                );
              })()}
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        ref={containerRef}
        className="h-[520px] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4"
      >
        {loadError ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            Failed to load PDF: {loadError}
          </div>
        ) : !pdfDoc || pageSizes.length === 0 ? (
          <div className="text-sm text-slate-500">Loading PDF…</div>
        ) : (
          <div className="space-y-6">
            {pageSizes.map((page) => (
              <PdfPageEditor
                key={page.pageNumber}
                pdfDoc={pdfDoc}
                page={page}
                scale={scale}
                boxes={boxes.filter((box) => box.page === page.pageNumber)}
                resolveBoxText={resolveBoxText}
                mode={mode}
                selectedId={selectedId}
                onSelect={selectBox}
                onAddBox={addBox}
                onAddBoxFromText={addBoxFromTextRegion}
                autoFocusId={autoFocusId}
                onUpsertBox={upsertBox}
                disabled={Boolean(disabled)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PdfPageEditor({
  pdfDoc,
  page,
  scale,
  boxes,
  resolveBoxText,
  mode,
  selectedId,
  onSelect,
  onAddBox,
  onAddBoxFromText,
  autoFocusId,
  onUpsertBox,
  disabled
}: {
  pdfDoc: any;
  page: PageSize;
  scale: number;
  boxes: PdfOverlayBox[];
  resolveBoxText: (box: PdfOverlayBox) => string;
  mode: 'select' | 'add' | 'text';
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAddBox: (pageNumber: number, x: number, y: number) => void;
  onAddBoxFromText: (region: DetectedTextRegion) => void;
  autoFocusId: string | null;
  onUpsertBox: (id: string, patch: Partial<PdfOverlayBox>) => void;
  disabled: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [textRegions, setTextRegions] = useState<DetectedTextRegion[]>([]);

  useEffect(() => {
    let cancelled = false;
    let renderTask: any;

    (async () => {
      try {
        const pdfPage = await pdfDoc.getPage(page.pageNumber);
        if (cancelled) return;

        const viewport = pdfPage.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
        renderTask = pdfPage.render({ canvasContext: context, viewport });
        await renderTask.promise;
        pdfPage.cleanup?.();
      } catch {
        // ignore render errors per-page
      }
    })();

    return () => {
      cancelled = true;
      try {
        renderTask?.cancel?.();
      } catch {
        // ignore
      }
    };
  }, [pdfDoc, page.pageNumber, scale]);

  useEffect(() => {
    let cancelled = false;

    if (mode !== 'text') {
      setTextRegions([]);
      return;
    }

    (async () => {
      try {
        const pdfPage = await pdfDoc.getPage(page.pageNumber);
        const viewport = pdfPage.getViewport({ scale: 1 });
        const content = await pdfPage.getTextContent?.();
        const items = (content as any)?.items ?? [];

        type TextRun = { x: number; y: number; w: number; h: number; text: string; fontSize: number };
        const runs: TextRun[] = [];

        for (const item of (items as any[]).slice(0, 5000)) {
          const raw = typeof item?.str === 'string' ? item.str : '';
          const text = raw.replace(/\s+/g, ' ').trim();
          if (!text) continue;
          if (!Array.isArray(item?.transform)) continue;

          const combined = multiplyTransforms(viewport.transform, item.transform);
          const x0 = combined[4];
          const y0 = combined[5];
          if (!Number.isFinite(x0) || !Number.isFinite(y0)) continue;

          const rawWidth =
            typeof item.width === 'number' && Number.isFinite(item.width) ? item.width : Math.max(8, text.length * 6);
          const rawHeight =
            typeof item.height === 'number' && Number.isFinite(item.height)
              ? item.height
              : typeof item.transform?.[3] === 'number' && Number.isFinite(item.transform[3])
                ? Math.abs(item.transform[3])
                : 12;

          const h = clamp(Math.abs(rawHeight), 6, 160);
          const w = clamp(Math.abs(rawWidth), 4, viewport.width);
          const x = clamp(x0, 0, Math.max(0, viewport.width - w));
          const y = clamp(y0 - h, 0, Math.max(0, viewport.height - h));
          const fontSize = clamp(h, 6, 28);

          runs.push({ x, y, w, h, text, fontSize });
        }

        runs.sort((a, b) => (Math.abs(a.y - b.y) < 4 ? a.x - b.x : a.y - b.y));

        const merged: Array<TextRun> = [];
        for (const run of runs) {
          const last = merged[merged.length - 1];
          if (last) {
            const yMidA = run.y + run.h / 2;
            const yMidB = last.y + last.h / 2;
            const yThresh = Math.max(4, Math.min(run.h, last.h) * 0.35);
            const gap = run.x - (last.x + last.w);
            const gapThresh = Math.max(12, Math.min(run.h, last.h) * 1.2);
            const sameLine = Math.abs(yMidA - yMidB) < yThresh;

            if (sameLine) {
              const xOverlap = Math.max(0, Math.min(last.x + last.w, run.x + run.w) - Math.max(last.x, run.x));
              const yOverlap = Math.max(0, Math.min(last.y + last.h, run.y + run.h) - Math.max(last.y, run.y));
              const intersection = xOverlap * yOverlap;
              const areaA = Math.max(1, run.w * run.h);
              const areaB = Math.max(1, last.w * last.h);
              const overlap = intersection / Math.min(areaA, areaB);

              if (overlap > 0.65) {
                const x0 = Math.min(last.x, run.x);
                const y0 = Math.min(last.y, run.y);
                const x1 = Math.max(last.x + last.w, run.x + run.w);
                const y1 = Math.max(last.y + last.h, run.y + run.h);
                last.x = x0;
                last.y = y0;
                last.w = x1 - x0;
                last.h = y1 - y0;
                last.text = run.text.length > last.text.length ? run.text : last.text;
                last.fontSize = Math.max(last.fontSize, run.fontSize);
                continue;
              }

              if (gap >= -2 && gap < gapThresh) {
                const nextText = gap > 2 ? `${last.text} ${run.text}` : `${last.text}${run.text}`;
                const x0 = Math.min(last.x, run.x);
                const y0 = Math.min(last.y, run.y);
                const x1 = Math.max(last.x + last.w, run.x + run.w);
                const y1 = Math.max(last.y + last.h, run.y + run.h);
                last.x = x0;
                last.y = y0;
                last.w = x1 - x0;
                last.h = y1 - y0;
                last.text = nextText;
                last.fontSize = Math.max(last.fontSize, run.fontSize);
                continue;
              }
            }
          }
          merged.push({ ...run });
        }

        const regions: DetectedTextRegion[] = merged
          .filter((r) => r.w > 6 && r.h > 6)
          .slice(0, 800)
          .map((r, index) => ({
            id: `auto:text:${page.pageNumber}:${index}:${Math.round(r.x)}:${Math.round(r.y)}`,
            page: page.pageNumber,
            x: r.x,
            y: r.y,
            w: r.w,
            h: r.h,
            text: r.text,
            fontSize: r.fontSize
          }));

        if (cancelled) return;
        setTextRegions(regions);
        pdfPage.cleanup?.();
      } catch {
        if (cancelled) return;
        setTextRegions([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, page.pageNumber, pdfDoc]);

  const handlePointerDown = (event: React.PointerEvent) => {
    if (disabled) return;
    if (mode !== 'add') return;
    const container = pageRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = (event.clientX - rect.left) / scale;
    const y = (event.clientY - rect.top) / scale;
    onAddBox(page.pageNumber, x, y);
  };

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        Page {page.pageNumber}
      </div>
      <div
        ref={pageRef}
        className={`relative mx-auto overflow-hidden rounded-lg border bg-white shadow-sm ${
          mode === 'add' && !disabled ? 'cursor-crosshair' : mode === 'text' && !disabled ? 'cursor-text' : 'cursor-default'
        }`}
        style={{ width: page.width * scale, height: page.height * scale }}
        onPointerDown={handlePointerDown}
      >
        <canvas ref={canvasRef} className="block" />
        {mode === 'text'
          ? textRegions
              .filter((region) => {
                if (boxes.length === 0) return true;
                const areaA = region.w * region.h;
                if (!Number.isFinite(areaA) || areaA <= 0) return false;
                for (const box of boxes) {
                  const areaB = box.w * box.h;
                  if (!Number.isFinite(areaB) || areaB <= 0) continue;
                  const xOverlap = Math.max(
                    0,
                    Math.min(region.x + region.w, box.x + box.w) - Math.max(region.x, box.x)
                  );
                  const yOverlap = Math.max(
                    0,
                    Math.min(region.y + region.h, box.y + box.h) - Math.max(region.y, box.y)
                  );
                  const intersection = xOverlap * yOverlap;
                  if (intersection <= 0) continue;
                  const minArea = Math.min(areaA, areaB);
                  if (minArea > 0 && intersection / minArea > 0.35) {
                    return false;
                  }
                }
                return true;
              })
              .map((region) => (
              <button
                key={region.id}
                type="button"
                className="absolute z-10 rounded-sm border border-dotted border-slate-500/70 bg-transparent hover:border-slate-600/80 focus:outline-none"
                style={{
                  left: region.x * scale,
                  top: region.y * scale,
                  width: region.w * scale,
                  height: region.h * scale
                }}
                onClick={(event) => {
                  if (disabled) return;
                  event.preventDefault();
                  event.stopPropagation();
                  onAddBoxFromText(region);
                }}
              />
            ))
          : null}
        {boxes.map((box) => (
          <PdfTextBox
            key={box.id}
            box={box}
            scale={scale}
            page={page}
            selected={box.id === selectedId}
            onSelect={() => onSelect(box.id)}
            onChange={(patch) => onUpsertBox(box.id, patch)}
            resolvedText={resolveBoxText(box)}
            autoFocus={box.id === autoFocusId}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

function PdfTextBox({
  box,
  scale,
  page,
  selected,
  onSelect,
  onChange,
  resolvedText,
  autoFocus,
  disabled
}: {
  box: PdfOverlayBox;
  scale: number;
  page: PageSize;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<PdfOverlayBox>) => void;
  resolvedText: string;
  autoFocus: boolean;
  disabled: boolean;
}) {
  type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

  const dragState = useRef<{
    kind: 'move' | 'resize';
    corner?: ResizeCorner;
    startX: number;
    startY: number;
    boxX: number;
    boxY: number;
    boxW: number;
    boxH: number;
  } | null>(null);

  const startPointerOp = (event: React.PointerEvent, kind: 'move' | 'resize', corner?: ResizeCorner) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect();

    dragState.current = {
      kind,
      corner,
      startX: event.clientX,
      startY: event.clientY,
      boxX: box.x,
      boxY: box.y,
      boxW: box.w,
      boxH: box.h
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  };

  const handlePointerMove = (event: PointerEvent) => {
    const state = dragState.current;
    if (!state) return;
    const dx = (event.clientX - state.startX) / scale;
    const dy = (event.clientY - state.startY) / scale;

    if (state.kind === 'move') {
      const x = clamp(state.boxX + dx, 0, Math.max(0, page.width - state.boxW));
      const y = clamp(state.boxY + dy, 0, Math.max(0, page.height - state.boxH));
      onChange({ x, y });
      return;
    }

    const minW = 30;
    const minH = 18;
    const corner = state.corner ?? 'se';

    let nextX = state.boxX;
    let nextY = state.boxY;
    let nextW = state.boxW;
    let nextH = state.boxH;

    if (corner === 'se') {
      nextW = state.boxW + dx;
      nextH = state.boxH + dy;
    } else if (corner === 'sw') {
      nextX = state.boxX + dx;
      nextW = state.boxW - dx;
      nextH = state.boxH + dy;
    } else if (corner === 'ne') {
      nextW = state.boxW + dx;
      nextY = state.boxY + dy;
      nextH = state.boxH - dy;
    } else if (corner === 'nw') {
      nextX = state.boxX + dx;
      nextW = state.boxW - dx;
      nextY = state.boxY + dy;
      nextH = state.boxH - dy;
    }

    if (nextW < minW) {
      const diff = minW - nextW;
      if (corner === 'sw' || corner === 'nw') nextX -= diff;
      nextW = minW;
    }

    if (nextH < minH) {
      const diff = minH - nextH;
      if (corner === 'ne' || corner === 'nw') nextY -= diff;
      nextH = minH;
    }

    nextX = clamp(nextX, 0, Math.max(0, page.width - minW));
    nextY = clamp(nextY, 0, Math.max(0, page.height - minH));
    nextW = clamp(nextW, minW, Math.max(minW, page.width - nextX));
    nextH = clamp(nextH, minH, Math.max(minH, page.height - nextY));

    onChange({ x: nextX, y: nextY, w: nextW, h: nextH });
  };

  const handlePointerUp = () => {
    dragState.current = null;
    window.removeEventListener('pointermove', handlePointerMove);
  };

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, []);

  const fontSize = box.fontSize ?? 10;
  const erase = Boolean(box.erase);

  const handleBoxPointerDownCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const handle = (event.target as HTMLElement | null)?.closest?.('[data-handle]');
    if (handle) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const edge = 10;
    const nearEdge =
      localX < edge ||
      localY < edge ||
      localX > rect.width - edge ||
      localY > rect.height - edge;
    if (!nearEdge) return;

    startPointerOp(event, 'move');
  };

  const handleBoxPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.stopPropagation();
    onSelect();
  };

  return (
    <div
      data-pdf-overlay-box="true"
      className={`absolute z-20 rounded-sm border ${
        selected ? 'border-blue-500 ring-2 ring-blue-200/50' : 'border-dotted border-slate-500/60'
      }`}
      style={{
        left: box.x * scale,
        top: box.y * scale,
        width: box.w * scale,
        height: box.h * scale,
        backgroundColor: erase ? 'rgba(255,255,255,0.95)' : 'transparent'
      }}
      onPointerDownCapture={handleBoxPointerDownCapture}
      onPointerDown={handleBoxPointerDown}
    >
      {selected ? (
        <textarea
          className="h-full w-full resize-none bg-transparent px-1 py-1 text-slate-900 outline-none"
          style={{ fontSize: fontSize * scale, lineHeight: 1.2 }}
          value={resolvedText}
          onChange={(e) => onChange({ value: e.target.value })}
          onFocus={onSelect}
          readOnly={disabled}
          autoFocus={autoFocus}
        />
      ) : (
        <div
          className="h-full w-full select-none whitespace-pre-wrap px-1 py-1 text-slate-900"
          style={{ fontSize: fontSize * scale, lineHeight: 1.2, pointerEvents: 'none' }}
        >
          {resolvedText}
        </div>
      )}
      {selected && !disabled ? (
        <>
          <div
            data-handle="resize-nw"
            className="absolute left-0 top-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-blue-500/40 bg-white/80"
            style={{ cursor: 'nwse-resize' }}
            onPointerDown={(e) => startPointerOp(e, 'resize', 'nw')}
          />
          <div
            data-handle="resize-ne"
            className="absolute right-0 top-0 h-3 w-3 translate-x-1/2 -translate-y-1/2 rounded-sm border border-blue-500/40 bg-white/80"
            style={{ cursor: 'nesw-resize' }}
            onPointerDown={(e) => startPointerOp(e, 'resize', 'ne')}
          />
          <div
            data-handle="resize-sw"
            className="absolute bottom-0 left-0 h-3 w-3 -translate-x-1/2 translate-y-1/2 rounded-sm border border-blue-500/40 bg-white/80"
            style={{ cursor: 'nesw-resize' }}
            onPointerDown={(e) => startPointerOp(e, 'resize', 'sw')}
          />
          <div
            data-handle="resize-se"
            className="absolute bottom-0 right-0 h-3 w-3 translate-x-1/2 translate-y-1/2 rounded-sm border border-blue-500/40 bg-white/80"
            style={{ cursor: 'nwse-resize' }}
            onPointerDown={(e) => startPointerOp(e, 'resize', 'se')}
          />
        </>
      ) : null}
    </div>
  );
}
