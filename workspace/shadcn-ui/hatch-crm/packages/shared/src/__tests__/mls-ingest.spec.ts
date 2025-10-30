import { describe, expect, it } from 'vitest';

import type { ExtractedLabelValue } from '../mls-ingest';
import { buildCanonicalDraft } from '../mls-ingest';

const REMARKS_TEXT =
  'Brand New Construction! Beautiful 3-bedroom, 2-bath home featuring stainless appliances, open concept, large backyard, and proximity to schools, supermarkets, and main roads.';

const SAMPLE_FIELDS: ExtractedLabelValue[] = [
  {
    label: 'MLS#',
    value: '2025014110',
    section: 'General Information',
    bold: true
  },
  {
    label: 'List Price',
    value: '$264,800',
    section: 'General Information',
    bold: true
  },
  {
    label: 'Address',
    value: '3302 39TH ST W, LEHIGH ACRES, FL 33971',
    section: 'General Information',
    bold: true
  },
  {
    label: 'Bedrooms',
    value: '3',
    section: 'General Information'
  },
  {
    label: 'Bathrooms',
    value: '2 (2 0)',
    section: 'General Information'
  },
  {
    label: 'Year Built',
    value: '2025',
    section: 'General Information'
  },
  {
    label: 'Approx. Living Area',
    value: '1,150 Sq Ft',
    section: 'General Information'
  },
  {
    label: 'Approx. Total Area',
    value: '1,500 Sq Ft',
    section: 'General Information'
  },
  {
    label: 'Lot Size',
    value: '0.25 Acres / 10,890 Sq Ft',
    section: 'Lot & Taxes'
  },
  {
    label: 'Property Type',
    value: 'Single Family',
    section: 'General Information'
  },
  {
    label: 'Subdivision',
    value: 'No Subdivision',
    section: 'General Information'
  },
  {
    label: 'Waterfront',
    value: 'No',
    section: 'General Information'
  },
  {
    label: 'Private Pool',
    value: 'No',
    section: 'General Information'
  },
  {
    label: '# Garage Spaces',
    value: '1',
    section: 'General Information'
  },
  {
    label: 'Images',
    value: '29',
    section: 'Media'
  }
];

describe('MLS fuzzy ingest', () => {
  it('maps the real MLS sample into the canonical draft schema', () => {
    const { draft, matches } = buildCanonicalDraft({
      source: {
        ingest_type: 'pdf',
        vendor: '360 Property View',
        document_version: 'residential_realtor_report'
      },
      extracted: SAMPLE_FIELDS,
      remarks: REMARKS_TEXT,
      media: {
        urls: [],
        detectedTotal: 29
      }
    });

    expect(draft.source.mls_number).toBe('2025014110');
    expect(draft.basic.list_price).toBe(264800);
    expect(draft.basic.property_type).toBe('Single Family');

    expect(draft.basic.address).toEqual({
      street: '3302 39TH ST W',
      city: 'Lehigh Acres',
      state: 'FL',
      postal_code: '33971',
      country: 'US'
    });

    expect(draft.details.beds).toBe(3);
    expect(draft.details.baths_total).toBe(2);
    expect(draft.details.baths_full).toBe(2);
    expect(draft.details.baths_half).toBe(0);
    expect(draft.details.year_built).toBe(2025);
    expect(draft.details.living_area_sqft).toBe(1150);
    expect(draft.details.total_area_sqft).toBe(1500);
    expect(draft.details.lot_acres).toBeCloseTo(0.25, 5);
    expect(draft.details.lot_sqft).toBe(10890);
    expect(draft.details.garage_spaces).toBe(1);
    expect(draft.details.waterfront).toBe(false);
    expect(draft.details.pool).toBe(false);
    expect(draft.details.subdivision).toBe('No Subdivision');

    expect(draft.remarks.public).toBe(REMARKS_TEXT);
    expect(draft.media.detected_total).toBe(29);
    expect(draft.media.images).toHaveLength(0);
    expect(draft.media.cover_image_index).toBe(0);

    expect(draft.diagnostics?.missing ?? []).toEqual([]);
    expect(matches.length).toBeGreaterThanOrEqual(10);
  });
});
