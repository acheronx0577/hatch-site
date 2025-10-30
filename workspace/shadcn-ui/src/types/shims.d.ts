declare module '@hatch/shared' {
  export type ExtractedLabelValue = {
    label?: string
    value?: string | number
    section?: string
  }

  export type DraftMappingResult = {
    draft: any
    matches: Array<{ canonical: string; score?: number; raw?: { label?: string } }>
    extracted: ExtractedLabelValue[]
  }

  export const MLS_FIELD_DEFINITIONS: Array<{ standardName?: string; required?: boolean }>
  export function buildCanonicalDraft(input: any): { draft: any; matches: DraftMappingResult['matches'] }
  export function mapCSVHeaders(headers: string[], threshold?: number): any
  export function validateMLSData(row: Record<string, unknown>, mappings?: any): any
  export function processFieldValueCSV(field: string, value: unknown): unknown
}

declare module '@hatch/shared/*' {
  const mod: any
  export = mod
}

