import { Injectable, Logger } from '@nestjs/common';
import type { DraftMappingResult, ExtractedLabelValue } from '@hatch/shared';
import { buildCanonicalDraft } from '@hatch/shared';
import { createHash } from 'crypto';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const pdfParseModule: any = require('pdf-parse');

type ExtractedPdfImage = {
  ref: string;
  data: Buffer;
  mimeType: string;
  extension: string;
};

export interface DraftIngestOptions {
  tenantId: string;
  filename: string;
  vendor?: string;
  documentVersion?: string;
}

export interface DraftIngestResult {
  draft: DraftMappingResult['draft'];
  matches: DraftMappingResult['matches'];
  extracted: ExtractedLabelValue[];
  text: string;
}

@Injectable()
export class DraftsService {
  private readonly logger = new Logger(DraftsService.name);
  private readonly supabase: SupabaseClient | null;
  private readonly imageBucket: string;
  private readonly maxImagesPerPdf: number;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.imageBucket =
      process.env.SUPABASE_STORAGE_PROPERTY_PHOTOS_BUCKET ?? 'property-photos';
    const maxImagesEnv = Number(process.env.PDF_MAX_IMAGE_EXTRACTIONS ?? '40');
    this.maxImagesPerPdf = Number.isFinite(maxImagesEnv) && maxImagesEnv > 0 ? maxImagesEnv : 40;
    this.supabase =
      supabaseUrl && supabaseServiceRoleKey
        ? createClient(supabaseUrl, supabaseServiceRoleKey, {
            auth: { persistSession: false }
          })
        : null;
    if (!this.supabase) {
      this.logger.warn(
        '[pdf-ingest] Supabase storage client not configured; extracted photos will be skipped'
      );
    }
  }

  async ingestPdf(buffer: Buffer, options: DraftIngestOptions): Promise<DraftIngestResult> {
    let parsedText = '';
    if (typeof pdfParseModule === 'function') {
      const parsed = await pdfParseModule(buffer);
      parsedText = parsed?.text ?? '';
    } else if (typeof pdfParseModule?.PDFParse === 'function') {
      const parser = new pdfParseModule.PDFParse({ data: buffer });
      const result = await parser.getText();
      parsedText = result?.text ?? '';
    } else {
      throw new Error('Unable to resolve pdf-parse parser function');
    }

    parsedText = this.normalizeInlineLabels(parsedText);

    if (process.env.NODE_ENV !== 'production') {
      console.debug('[pdf-ingest] text preview:', parsedText.slice(0, 500));
    }

    const extracted: ExtractedLabelValue[] = [];
    const addExtracted = (label: string, value: string | number, section = 'General Information') => {
      if (value === undefined || value === null) return
      if (typeof value === 'number') {
        extracted.push({ label, value, section })
        return
      }
      const trimmed = value.trim()
      if (!trimmed) return
      const { baseValue, extras } = this.splitInlineFields(label, trimmed, section)
      if (baseValue) {
        extracted.push({ label, value: baseValue, section })
      }
      extras.forEach((extra) => extracted.push(extra))
    }

    const embeddedImages = await this.extractImagesFromPdf(buffer);
    let uploadedImageUrls: string[] = [];
    if (embeddedImages.length > 0) {
      if (this.supabase) {
        uploadedImageUrls = await this.uploadExtractedImages(embeddedImages, options);
        if (uploadedImageUrls.length === 0) {
          this.logger.warn(
            '[pdf-ingest] Supabase upload returned 0 URLs; falling back to inline data URLs'
          );
          uploadedImageUrls = this.encodeImagesAsDataUrls(embeddedImages);
        }
      } else {
        this.logger.warn(
          '[pdf-ingest] Supabase storage unavailable; generating inline data URLs for extracted photos'
        );
        uploadedImageUrls = this.encodeImagesAsDataUrls(embeddedImages);
      }
    }

    this.extractFieldsFromText(parsedText).forEach((item) => extracted.push(item));

    const lines = parsedText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const remarkLabels = new Set(['public remarks', 'remarks', 'public remark', 'remarks public']);
    const remarksParts: string[] = [];

    const determineSection = (label: string): string => {
      const lowerLabel = label.toLowerCase();
      if (
        lowerLabel.includes('lot') ||
        lowerLabel.includes('tax') ||
        lowerLabel.includes('fee') ||
        lowerLabel.includes('hoa') ||
        lowerLabel.includes('assessment')
      ) {
        return 'Lot & Taxes';
      }
      if (lowerLabel.includes('image') || lowerLabel.includes('photo')) {
        return 'Media';
      }
      if (lowerLabel.includes('remark')) {
        return 'Remarks';
      }
      return 'General Information';
    };

    const colonRegex =
      /([A-Za-z0-9/#&\-\(\) ,]+?):\s*([^:]+?)(?=(?:\s{2,}[A-Za-z0-9/#&\-\(\) ,]+:\s)|$)/g;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line.includes(':')) continue;

      const matches = Array.from(line.matchAll(colonRegex));
      if (matches.length > 0) {
        let consumedRemark = false;
        for (const match of matches) {
          const label = match[1]?.trim() ?? '';
          const value = match[2]?.trim() ?? '';
          if (!label || !value) continue;

          const lowerLabel = label.toLowerCase();
          if (remarkLabels.has(lowerLabel)) {
            const remarkLines = [value];
            let cursor = index + 1;
            while (cursor < lines.length && !lines[cursor].includes(':')) {
              const remarkLine = lines[cursor].trim();
              if (remarkLine.length === 0) break;
              remarkLines.push(remarkLine);
              cursor += 1;
            }
            remarksParts.push(remarkLines.join(' '));
            index = cursor - 1;
            consumedRemark = true;
            break;
          }

          addExtracted(label, value, determineSection(label));
        }

        if (consumedRemark) {
          continue;
        }

        continue;
      }

      const [rawLabel, ...rest] = line.split(':');
      const label = rawLabel.trim();
      const value = rest.join(':').trim();
      if (!label || !value) continue;

      const lowerLabel = label.toLowerCase();
      if (remarkLabels.has(lowerLabel)) {
        const remarkLines = [value];
        let cursor = index + 1;
        while (cursor < lines.length && !lines[cursor].includes(':')) {
          const remarkLine = lines[cursor].trim();
          if (remarkLine.length === 0) break;
          remarkLines.push(remarkLine);
          cursor += 1;
        }
        remarksParts.push(remarkLines.join(' '));
        index = cursor - 1;
        continue;
      }

      addExtracted(label, value, determineSection(label));
    }

    uploadedImageUrls.forEach((url, index) => {
      addExtracted(`Photo URL ${index + 1}`, url, 'Media');
    });

    const detectedFromLabels = this.extractImageCount(extracted);
    const detectedTotal =
      uploadedImageUrls.length > 0
        ? uploadedImageUrls.length
        : detectedFromLabels ?? (embeddedImages.length > 0 ? embeddedImages.length : null);

    const { draft, matches } = buildCanonicalDraft({
      source: {
        ingest_type: 'pdf',
        vendor: options.vendor ?? 'unknown',
        document_version: options.documentVersion ?? 'unspecified',
        mls_number: undefined
      },
      extracted,
      remarks: remarksParts.join('\n\n') || null,
      media: {
        urls: uploadedImageUrls,
        coverIndex: 0,
        detectedTotal
      }
    });

    if (process.env.NODE_ENV !== 'production') {
      console.debug(
        '[pdf-ingest] extracted preview',
        extracted.slice(0, 15).map((item) => `${item.label}: ${item.value}`)
      );
    }

    if (process.env.NODE_ENV !== 'production') {
      console.debug('[pdf-ingest] canonical summary', {
        listPrice: draft.basic.list_price,
        mls: draft.source.mls_number,
        address: draft.basic.address,
        beds: draft.details.beds,
        baths: draft.details.baths_total,
        livingSqft: draft.details.living_area_sqft,
        lotSqft: draft.details.lot_sqft,
        lotAcres: draft.details.lot_acres,
        propertyType: draft.basic.property_type,
        subdivision: draft.details.subdivision
      });
    }

    if (!draft.source.mls_number) {
      const mls = this.findValueByLabel(extracted, ['mls#', 'mls id', 'mls number', 'listing number']);
      if (mls) draft.source.mls_number = mls;
    }

    return {
      draft,
      matches,
      extracted,
      text: parsedText
    };
  }

  private readonly INLINE_FIXUP_LABELS = [
    'ML#',
    'MLS#',
    'Status',
    'Status Type',
    'Property Class',
    'Development',
    'Subdivision',
    'GEO Area',
    'List Price/Sqft',
    'Property ID',
    'DOM'
  ];

  private normalizeInlineLabels(text: string): string {
    let normalized = text;

    this.INLINE_FIXUP_LABELS.forEach((label) => {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`${escaped}\\s{2,}([^:\\n]+)`, 'gi');
      normalized = normalized.replace(regex, (_match, value) => {
        const cleanedValue = String(value).trim();
        return `${label}: ${cleanedValue}`;
      });
    });

    return normalized;
  }

  private extractFieldsFromText(text: string): ExtractedLabelValue[] {
    const results: ExtractedLabelValue[] = [];
    const push = (label: string, value: string | number, section = 'General Information') => {
      if (value === undefined || value === null) return;
      const trimmed = typeof value === 'string' ? value.trim() : value;
      if (String(trimmed).length === 0) return;
      results.push({ label, value: trimmed, section });
    };

    const find = (regex: RegExp): string | null => {
      const match = regex.exec(text);
      return match ? match[1].trim() : null;
    };

    const findNumber = (regex: RegExp): string | null => {
      const raw = find(regex);
      if (!raw) return null;
      const numeric = raw.replace(/[^0-9.\-]/g, '');
      return numeric.length ? numeric : null;
    };

    const listPrice =
      find(/List\s*(?:Price|Prc)\s*[:\$\s]*([\d,]+)/i) || find(/LP\s*[:\$\s]*([\d,]+)/i);
    if (listPrice) push('List Price', listPrice);

    const pricePerSqft = find(/List\s*Price\/Sqft\s*[:\$\s]*([\d.,]+)/i);
    if (pricePerSqft) push('List Price Per Sqft', pricePerSqft);

    const mlsNumber =
      find(/(?:MLS|ML)\s*(?:#|Number|ID)?\s*[:\-]?\s*([A-Z0-9-]+)/i) ||
      find(/(?:MLS|ML)#\s*([A-Z0-9-]+)/i);
    if (mlsNumber) push('MLS Number', mlsNumber);

    const addressBlock = text.match(
      /Address\s*:\s*([^\n]+)\n\s*([A-Za-z0-9\s\.,'-]+,\s*[A-Z]{2}\s*\d{5})/i
    );
    if (addressBlock) {
      const streetLine = addressBlock[1].replace(/\s+/g, ' ').trim();
      const cityStateZip = addressBlock[2].replace(/\s+/g, ' ').trim();
      const combined = `${streetLine}, ${cityStateZip}`;
      push('Property Address', combined);

      const streetMatch = streetLine.match(/^(\d+[A-Za-z-]*)\s+(.+)$/);
      if (streetMatch) {
        const streetNumber = streetMatch[1];
        const streetRemainder = streetMatch[2];
        const streetParts = streetRemainder.split(/\s+/);
        const suffix = streetParts.length > 1 ? streetParts[streetParts.length - 1] : '';
        const name = streetParts.length > 1 ? streetParts.slice(0, -1).join(' ') : streetRemainder;

        push('Street Number', streetNumber);
        push('Street Name', name);
        if (suffix) {
          push('Street Suffix', suffix);
        }
      }

      const [cityRaw, stateZipRaw] = cityStateZip.split(',');
      if (cityRaw) push('City', cityRaw.trim());
      if (stateZipRaw) {
        const stateZipParts = stateZipRaw.trim().split(/\s+/);
        if (stateZipParts[0]) push('State', stateZipParts[0]);
        if (stateZipParts[1]) push('Zip', stateZipParts[1]);
      }
    } else {
      const fallbackAddress =
        find(/(\d{2,6}\s+[A-Z0-9\s]+,\s*[A-Za-z\s]+,\s*[A-Z]{2}\s*\d{5})/i) ||
        find(/Address\s*[:\s]*([\dA-Za-z\s]+,\s*[A-Za-z\s]+,\s*[A-Z]{2}\s*\d{5})/i) ||
        find(/Address\s*[:\s]*([\d\w\s]+)(?:\s+County:|\s+Property Class)/i);
      if (fallbackAddress) {
        const cleaned = fallbackAddress.replace(/\s+County.+$/, '').trim();
        push('Property Address', cleaned);
      }
    }

    const status = find(/Status(?!\s*Type)\s*[:\s]*([A-Za-z\s\/\(\)]+)/i);
    if (status) push('Status', status.replace(/\(.*?\)/g, '').trim());

    const statusType = find(/Status\s*Type\s*[:\s]*([^\n]+)/i);
    if (statusType) push('Status Type', statusType);

    const propertyClass = find(/Property\s*Class\s*[:\s]*([^\n]+)/i);
    if (propertyClass) push('Property Class', propertyClass);

    const propertyType =
      find(/Property\s*Type\s*[:\s]*([^\n]+)/i) || find(/Building\s*Design\s*[:\s]*([^\n]+)/i);
    if (propertyType) push('Property Type', propertyType);

    const ownership = find(/Ownership\s*[:\s]*([^\n]+)/i);
    if (ownership) push('Ownership', ownership);

    const development = find(/Development\s*[:\s]*([^\n]+)/i);
    if (development) push('Development', development);

    const geoArea = find(/GEO\s*Area\s*[:\s]*([^\n]+)/i);
    if (geoArea) push('GEO Area', geoArea);

    const subdivision =
      find(/Subdivision\s*[:\s]*([^\n]+)/i) || find(/Subdiv(?:ision)?\s*[:\s]*([^\n]+)/i);
    if (subdivision) push('Subdivision', subdivision);

    const county = find(/County\s*[:\s]*([A-Za-z]+)/i);
    if (county) push('County', county);

    const bedrooms = find(/Bedrooms?\s*[:\s]*([0-9]+)/i) || find(/Beds?\s*[:\s]*([0-9]+)/i);
    if (bedrooms) push('Bedrooms', bedrooms);

    const bathsComposite =
      text.match(/Baths?\s*[:\s]*([0-9]+)\s*\(([0-9]+)\s*([0-9]+)\)/i) ||
      text.match(/Bathrooms?\s*[:\s]*([0-9]+)\s*\(([0-9]+)\s*([0-9]+)\)/i);
    if (bathsComposite) {
      push('Bathrooms', `${bathsComposite[1]} (${bathsComposite[2]} ${bathsComposite[3]})`);
      push('Full Baths', bathsComposite[2]);
      push('Half Baths', bathsComposite[3]);
    } else {
      const bathsValue = find(/Baths?\s*[:\s]*([0-9\.]+)/i);
      if (bathsValue) push('Bathrooms', bathsValue);
    }

    const den = find(/Den\/Flex\s*[:\s]*([^\n]+)/i);
    if (den) push('Den', den);

    const livingArea =
      find(/Approx\.?\s*Living\s*Area\s*[:\s]*([^\n]+)/i) ||
      find(/Living\s*Area\s*[:\s]*([^\n]+)/i);
    if (livingArea) push('Living Area', livingArea);

    const totalArea =
      find(/Approx\.?\s*Total\s*Area\s*[:\s]*([^\n]+)/i) ||
      find(/Total\s*Area\s*[:\s]*([^\n]+)/i);
    if (totalArea) push('Total Area', totalArea);

    const lotCombo =
      text.match(/Lot\s*Size\s*[:\s]*([\d.,]+|\.\d+)\s*\(acres?\)\s*\/\s*([\d,]+)\s*\(sqft\)/i);
    if (lotCombo) {
      push('Lot Acres', lotCombo[1], 'Lot & Taxes');
      push('Lot Size SqFt', lotCombo[2], 'Lot & Taxes');
    } else {
      const lotAcresOnly = find(/Lot\s*Size\s*[:\s]*([\d.,]+|\.\d+)\s*\(acres?\)/i);
      if (lotAcresOnly) push('Lot Acres', lotAcresOnly, 'Lot & Taxes');
      const lotSqftOnly = find(/Lot\s*Size\s*[:\s]*([\d,]+)\s*\(sqft\)/i);
      if (lotSqftOnly) push('Lot Size SqFt', lotSqftOnly, 'Lot & Taxes');
    }

    const lotDescription = find(/Lot\s*Description\s*[:\s]*([^\n]+)/i);
    if (lotDescription) push('Lot Description', lotDescription, 'Lot & Taxes');

    const lotDimensions = find(/Approx\.?\s*Lot\s*Size\s*[:\s]*([^\n]+)/i);
    if (lotDimensions) push('Lot Dimensions', lotDimensions, 'Lot & Taxes');

    const parcelId =
      find(/Property\s*ID\s*[:\s]*([A-Z0-9\-\.]+)/i) || find(/Parcel\s*(?:ID|#)\s*[:\s]*([A-Z0-9\-\.]+)/i);
    if (parcelId) push('Parcel ID', parcelId, 'Lot & Taxes');

    const yearBuilt = find(/Year\s*Built\s*[:\s]*([0-9]{4})/i);
    if (yearBuilt) push('Year Built', yearBuilt);

    const furnished = find(/Furnished\s*[:\s]*([^\n]+)/i);
    if (furnished) push('Furnished', furnished);

    const pets = find(/Pets\s*[:\s]*([^\n]+)/i);
    if (pets) push('Pets', pets);

    const windows = find(/Windows\s*[:\s]*([^\n]+)/i);
    if (windows) push('Windows', windows);

    const exteriorFinish = find(/Exterior\s*Finish\s*[:\s]*([^\n]+)/i);
    if (exteriorFinish) push('Exterior Finish', exteriorFinish);

    const flooring = find(/Flooring\s*[:\s]*([^\n]+)/i);
    if (flooring) push('Flooring', flooring);

    const floorPlan = find(/Floor\s*Plan\s*Type\s*[:\s]*([^\n]+)/i);
    if (floorPlan) push('Floor Plan Type', floorPlan);

    const cooling = find(/Cooling\s*[:\s]*([^\n]+)/i);
    if (cooling) push('Cooling', cooling);

    const heating = find(/Heating\s*[:\s]*([^\n]+)/i);
    if (heating) push('Heating', heating);

    const kitchen = find(/Kitchen\s*[:\s]*([^\n]+)/i);
    if (kitchen) push('Kitchen', kitchen);

    const equipment = find(/Equipment\s*[:\s]*([^\n]+)/i);
    if (equipment) push('Equipment', equipment);

    const interiorFeatures = find(/Interior\s*Features\s*[:\s]*([^\n]+)/i);
    if (interiorFeatures) push('Interior Features', interiorFeatures);

    const exteriorFeatures = find(/Exterior\s*Features\s*[:\s]*([^\n]+)/i);
    if (exteriorFeatures) push('Exterior Features', exteriorFeatures);

    const masterBath = find(/Master\s*Bath\s*[:\s]*([^\n]+)/i);
    if (masterBath) push('Master Bath', masterBath);

    const additionalRooms = find(/Additional\s*Rooms\s*[:\s]*([^\n]+)/i);
    if (additionalRooms) push('Additional Rooms', additionalRooms);

    const privatePool = find(/Private\s*Pool\s*[:\s]*([^\n]+)/i);
    if (privatePool) push('Private Pool', privatePool);

    const privateSpa = find(/Private\s*Spa\s*[:\s]*([^\n]+)/i);
    if (privateSpa) push('Private Spa', privateSpa);

    const view = find(/View\s*[:\s]*([^\n]+)/i);
    if (view) push('View', view);

    const amenities = find(/Amenities\s*[:\s]*([^\n]+)/i);
    if (amenities) push('Amenities', amenities);

    const parking = find(/Parking\s*[:\s]*([^\n]+)/i);
    if (parking) push('Parking', parking);

    const garageSpaces =
      find(/#?\s*Garage\s*Spaces\s*[:\s]*([0-9]+)/i) || find(/Garage\s*[:\s]*([0-9]+)/i);
    if (garageSpaces) push('# Garage Spaces', garageSpaces);

    const carportSpaces = find(/#?\s*Carport\s*Spaces\s*[:\s]*([0-9]+)/i);
    if (carportSpaces) push('# Carport Spaces', carportSpaces);

    const water = find(/Water\s*[:\s]*([^\n]+)/i);
    if (water) push('Water', water, 'Lot & Taxes');

    const sewer = find(/Sewer\s*[:\s]*([^\n]+)/i);
    if (sewer) push('Sewer', sewer, 'Lot & Taxes');

    const irrigation = find(/Irrigation\s*[:\s]*([^\n]+)/i);
    if (irrigation) push('Irrigation', irrigation, 'Lot & Taxes');

    const waterfront = find(/Waterfront\s*[:\s]*([^\n]+)/i);
    if (waterfront) push('Waterfront', waterfront, 'Lot & Taxes');

    const gulfAccess = find(/Gulf\s*Access\s*[:\s]*([^\n]+)/i);
    if (gulfAccess) push('Gulf Access', gulfAccess, 'Lot & Taxes');

    const canalWidth = find(/Canal\s*Width\s*[:\s]*([^\n]+)/i);
    if (canalWidth) push('Canal Width', canalWidth, 'Lot & Taxes');

    const zoning = find(/Zoning\s*[:\s]*([^\n]+)/i);
    if (zoning) push('Zoning', zoning, 'Lot & Taxes');

    const taxBill = findNumber(/Total\s*Tax\s*Bill\s*[:\s]*([\d\$,]+)/i);
    if (taxBill) push('Total Tax Bill', taxBill, 'Lot & Taxes');

    const taxYear = find(/Tax\s*Year\s*[:\s]*([0-9]{4})/i);
    if (taxYear) push('Tax Year', taxYear, 'Lot & Taxes');

    const taxDesc = find(/Tax\s*Desc\s*[:\s]*([^\n]+)/i);
    if (taxDesc) push('Tax Description', taxDesc, 'Lot & Taxes');

    const hoaFee = findNumber(/HOA\s*Fee\s*[:\s]*([\d\$,]+)/i);
    if (hoaFee) push('HOA Fee', hoaFee, 'Lot & Taxes');

    const masterHoaFee = findNumber(/Master\s*HOA\s*Fee\s*[:\s]*([\d\$,]+)/i);
    if (masterHoaFee) push('Master HOA Fee', masterHoaFee, 'Lot & Taxes');

    const condoFee = findNumber(/Condo\s*Fee\s*[:\s]*([\d\$,]+)/i);
    if (condoFee) push('Condo Fee', condoFee, 'Lot & Taxes');

    const specAssessment = findNumber(/Spec\s*Assessment\s*[:\s]*([\d\$,]+)/i);
    if (specAssessment) push('Special Assessment', specAssessment, 'Lot & Taxes');

    const otherFee = findNumber(/Other\s*Fee\s*[:\s]*([\d\$,]+)/i);
    if (otherFee) push('Other Fee', otherFee, 'Lot & Taxes');

    const landLease = findNumber(/Land\s*Lease\s*[:\s]*([\d\$,]+)/i);
    if (landLease) push('Land Lease', landLease, 'Lot & Taxes');

    const mandatoryClubFee = findNumber(/Mandatory\s*Club\s*Fee\s*[:\s]*([\d\$,]+)/i);
    if (mandatoryClubFee) push('Mandatory Club Fee', mandatoryClubFee, 'Lot & Taxes');

    const terms = find(/Terms\s*[:\s]*([^\n]+)/i);
    if (terms) push('Terms', terms);

    const ownerName = find(/Owner\s*Name\s*[:\s]*([^\n]+)/i);
    if (ownerName) push('Owner Name', ownerName);

    const ownerPhone = find(/Owner\s*Phone\s*[:\s]*([^\n]+)/i);
    if (ownerPhone) push('Owner Phone', ownerPhone);

    const ownerEmail = find(/Owner\s*Email\s*[:\s]*([^\n]+)/i);
    if (ownerEmail) push('Owner Email', ownerEmail);

    const listingBroker = find(/Listing\s*Broker\s*[:\s]*([^\n]+)/i);
    if (listingBroker) push('Listing Broker', listingBroker);

    const officeName = find(/Office\s*Name\s*[:\s]*([^\n]+)/i);
    if (officeName) push('Office Name', officeName);

    const officePhone = find(/Office\s*Ph\s*[:\s]*([^\n]+)/i);
    if (officePhone) push('Office Phone', officePhone);

    const agentName = find(/Agent\s*Name\s*[:\s]*([^\n]+)/i);
    if (agentName) push('Agent Name', agentName);

    const agentPhone = find(/Agent\s*Phone\s*[:\s]*([^\n]+)/i);
    if (agentPhone) push('Agent Phone', agentPhone);

    const agentEmail = find(/Agent\s*Email\s*[:\s]*([^\n]+)/i);
    if (agentEmail) push('Agent Email', agentEmail);

    const appointmentPhone = find(/Appointment\s*Phone\s*[:\s]*([^\n]+)/i);
    if (appointmentPhone) push('Appointment Phone', appointmentPhone);

    const listingDate = find(/Listing\s*Date\s*[:\s]*([^\n]+)/i);
    if (listingDate) push('Listing Date', listingDate);

    const contractClosingDate = find(/Contract\s*Closing\s*Date\s*[:\s]*([^\n]+)/i);
    if (contractClosingDate) push('Contract Closing Date', contractClosingDate);

    const expirationDate = find(/Date\s*Expiration\s*[:\s]*([^\n]+)/i);
    if (expirationDate) push('Expiration Date', expirationDate);

    const listingType = find(/Listing\s*Type\s*[:\s]*([^\n]+)/i);
    if (listingType) push('Listing Type', listingType);

    const showingInstructions = find(/Showing\s*Inst\.\s*[:\s]*([^\n]+)/i);
    if (showingInstructions) push('Showing Instructions', showingInstructions);

    const stormProtection = find(/Storm\s*Protection\s*[:\s]*([^\n]+)/i);
    if (stormProtection) push('Storm Protection', stormProtection);

    const geoLegalDesc = find(/Legal\s*Desc\s*[:\s]*([^\n]+)/i);
    if (geoLegalDesc) push('Legal Description', geoLegalDesc, 'Lot & Taxes');

    return results;
  }

  private async extractImagesFromPdf(buffer: Buffer): Promise<ExtractedPdfImage[]> {
    try {
      const document = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false });
      const images: ExtractedPdfImage[] = [];
      const seen = new Set<string>();

      for (const [ref, object] of document.context.enumerateIndirectObjects()) {
        if (!(object instanceof PDFRawStream)) {
          continue;
        }

        const subtype = object.dict.get(PDFName.of('Subtype'));
        if (!(subtype instanceof PDFName) || subtype.toString() !== '/Image') {
          continue;
        }

        const filterNames = this.extractFilterNames(object.dict.get(PDFName.of('Filter')));
        const lowerFilters = filterNames.map((name) => name.toLowerCase());
        let extension = '';
        let mimeType = '';

        if (lowerFilters.includes('dctdecode')) {
          extension = 'jpg';
          mimeType = 'image/jpeg';
        } else if (lowerFilters.includes('jpxdecode')) {
          extension = 'jp2';
          mimeType = 'image/jp2';
        } else {
          continue;
        }

        const refId = ref.toString();
        if (seen.has(refId)) {
          continue;
        }
        seen.add(refId);

        const contents = object.getContents();
        if (!contents || contents.length === 0) {
          continue;
        }

        const data = Buffer.from(contents);
        if (data.length === 0) {
          continue;
        }

        images.push({ ref: refId, data, extension, mimeType });

        if (images.length >= this.maxImagesPerPdf) {
          break;
        }
      }

      return images;
    } catch (error) {
      this.logger.warn(
        `[pdf-ingest] failed to extract embedded images: ${(error as Error).message}`
      );
      return [];
    }
  }

  private extractFilterNames(filter: unknown): string[] {
    const names: string[] = [];
    const pushName = (candidate: unknown) => {
      if (candidate instanceof PDFName) {
        const raw = candidate.toString();
        names.push(raw.startsWith('/') ? raw.substring(1) : raw);
      }
    };

    if (filter instanceof PDFName) {
      pushName(filter);
      return names;
    }

    const filterObj = filter as { size?: () => number; get?: (idx: number) => unknown };
    if (
      filterObj &&
      typeof filterObj.size === 'function' &&
      typeof filterObj.get === 'function'
    ) {
      const length = filterObj.size();
      for (let idx = 0; idx < length; idx += 1) {
        pushName(filterObj.get(idx));
      }
    }

    return names;
  }

  private async uploadExtractedImages(
    images: ExtractedPdfImage[],
    options: DraftIngestOptions
  ): Promise<string[]> {
    if (!this.supabase || images.length === 0) {
      return [];
    }

    const urls: string[] = [];
    const tenantSegment = this.sanitizeStorageKeySegment(options.tenantId ?? 'tenant');
    const baseSegment = this.sanitizeStorageKeySegment(
      options.filename.replace(/\.[^/.]+$/, '') || 'listing'
    );
    const timestamp = Date.now();

    for (let index = 0; index < images.length; index += 1) {
      const image = images[index];
      try {
        const hash = createHash('sha1').update(image.data).digest('hex').slice(0, 12);
        const storageKey = `${tenantSegment}/drafts/${baseSegment}/${timestamp}-${index}-${hash}.${image.extension}`;
        const { error } = await this.supabase.storage
          .from(this.imageBucket)
          .upload(storageKey, image.data, {
            contentType: image.mimeType,
            upsert: false
          });

        if (error) {
          if (process.env.NODE_ENV !== 'production') {
            this.logger.warn(
              `[pdf-ingest] failed to upload extracted image ${storageKey}: ${error.message}`
            );
          }
          continue;
        }

        const { data: publicUrl } = this.supabase.storage
          .from(this.imageBucket)
          .getPublicUrl(storageKey);

        if (publicUrl?.publicUrl) {
          urls.push(publicUrl.publicUrl);
          continue;
        }

        const { data: signed, error: signedError } = await this.supabase.storage
          .from(this.imageBucket)
          .createSignedUrl(storageKey, 60 * 60 * 24 * 30);

        if (!signedError && signed?.signedUrl) {
          urls.push(signed.signedUrl);
        }
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
          this.logger.warn(
            `[pdf-ingest] unexpected error uploading extracted image: ${(error as Error).message}`
          );
        }
      }
    }

    return urls;
  }

  private encodeImagesAsDataUrls(images: ExtractedPdfImage[]): string[] {
    return images.map((image) => {
      const mimeType = image.mimeType || 'image/jpeg';
      const base64 = image.data.toString('base64');
      return `data:${mimeType};base64,${base64}`;
    });
  }

  private sanitizeStorageKeySegment(value: string, fallback = 'draft'): string {
    const cleaned = value
      .toLowerCase()
      .replace(/[^a-z0-9/_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/\/{2,}/g, '/')
      .replace(/^-+|-+$/g, '');
    return cleaned.length > 0 ? cleaned : fallback;
  }

  private splitInlineFields(
    label: string,
    raw: string,
    section: string
  ): { baseValue: string; extras: ExtractedLabelValue[] } {
    const extras: ExtractedLabelValue[] = []
    if (!raw) {
      return { baseValue: '', extras }
    }

    const normalized = raw.replace(/\r?\n/g, ' ').replace(/\s{2,}/g, ' ').trim()
    if (!normalized) {
      return { baseValue: '', extras }
    }

    const tokens = normalized.split(/\t+/).map((token) => token.trim()).filter(Boolean)
    let baseValue = tokens.length > 0 ? tokens[0] : normalized

    const addExtra = (rawLabel: string, rawValue: string | undefined) => {
      const labelCandidate = (rawLabel ?? '').replace(/[:]+$/, '').trim()
      const valueCandidate = (rawValue ?? '').replace(/\s{2,}/g, ' ').trim()
      if (!labelCandidate || !valueCandidate) return
      extras.push({ label: labelCandidate, value: valueCandidate, section })
    }

    if (tokens.length > 1) {
      for (let index = 1; index < tokens.length; index += 1) {
        const token = tokens[index]
        if (!token) continue

        let handled = false
        const colonIndex = token.indexOf(':')
        if (colonIndex > -1) {
          const labelPart = token.slice(0, colonIndex).trim()
          const valuePart = token.slice(colonIndex + 1).trim()
          if (valuePart) {
            addExtra(labelPart, valuePart)
            handled = true
          } else if (index + 1 < tokens.length) {
            addExtra(labelPart, tokens[index + 1])
            index += 1
            handled = true
          }
        }

        if (!handled && token.endsWith(':') && index + 1 < tokens.length) {
          addExtra(token.slice(0, -1), tokens[index + 1])
          index += 1
          handled = true
        }

        if (!handled) {
          baseValue = `${baseValue} ${token}`.trim()
        }
      }
    } else {
      const colonMatch = normalized.match(/^([A-Za-z0-9#\/\(\) '&\-\.,]+):\s*(.+)$/)
      if (colonMatch) {
        addExtra(colonMatch[1], colonMatch[2])
        baseValue = ''
      }
    }

    baseValue = this.cleanInlineBaseValue(label, baseValue)
    return { baseValue, extras }
  }

  private cleanInlineBaseValue(label: string, value: string): string {
    if (!value) return ''
    let cleaned = value.replace(/\s{2,}/g, ' ').trim()
    cleaned = cleaned.replace(/[:·]+$/, '').replace(/\s*\($/, '').trim()
    if (!cleaned || cleaned === '-' || cleaned.toLowerCase() === label.toLowerCase()) {
      return ''
    }
    return cleaned
  }

  private extractImageCount(extracted: ExtractedLabelValue[]): number | null {
    const labelMatch = extracted.find((item) => item.label.toLowerCase().includes('image'));
    if (!labelMatch) return null;
    const numeric = String(labelMatch.value).replace(/[^\d]/g, '');
    if (!numeric) return null;
    const parsed = Number.parseInt(numeric, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private findValueByLabel(extracted: ExtractedLabelValue[], labels: string[]): string | null {
    for (const label of labels) {
      const match = extracted.find((item) => item.label.toLowerCase() === label.toLowerCase());
      if (match) return String(match.value);
    }
    return null;
  }
}
