// Enhanced Property interface with comprehensive MLS fields
export interface Property {
  id: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  neighborhood: string;
  price: number;
  bedrooms?: number;
  bathrooms?: number;
  squareFeet: number;
  lotSize?: number;
  propertyType: PropertyType;
  propertyCategory: PropertyCategory;
  yearBuilt: number;
  daysOnMarket: number;
  listingStatus: 'Active' | 'New' | 'Price Reduced' | 'Open House' | 'Under Contract' | 'Sold' | 'For Lease' | 'Leased';
  listingType: 'For Sale' | 'For Lease' | 'Sale/Leaseback' | 'Build-to-Suit' | 'NNN Lease';
  hoaFees?: number;
  features: string[];
  imageUrl: string;
  listingDate: string;
  description: string;
  isSaved: boolean;
  
  // Commercial/Investment specific fields
  capRate?: number;
  noi?: number;
  pricePerSqft?: number;
  occupancyRate?: number;
  parkingSpaces?: number;
  zoning?: string;
  tenantInfo?: string;
  leaseTerms?: string;
  condition: 'Excellent' | 'Good' | 'Fair' | 'Needs Work' | 'Distressed';
  
  // Agricultural specific fields
  acres?: number;
  soilType?: string;
  waterRights?: boolean;
  
  agent: {
    name: string;
    phone: string;
    email: string;
    company: string;
  };

  // Comprehensive MLS Data
  mls: MLSData;
}

export interface MLSData {
  // Owner Information
  owner: {
    ownerName: string;
    mailingOwnerName?: string;
    ownerAddress: {
      street: string;
      city: string;
      state: string;
      zip: string;
      zipPlusFour?: string;
      carrierRoute?: string;
    };
    ownerOccupied: boolean;
  };

  // Location Information
  location: {
    subdivisionName: string;
    subdivisionNumber?: string;
    section: string;
    township: string;
    range: string;
    propertyZip: string;
    propertyZipPlusFour?: string;
    propertyCarrierRoute?: string;
    censusTract: string;
    censusBlockGroup: string;
    schoolDistrict: string;
    highSchoolDistrict?: string;
    highSchoolName?: string;
    elementarySchoolDistrict?: string;
    elementarySchoolName?: string;
    neighborhoodCode: string;
    zoning: string;
    taxingAuthority: string;
  };

  // Estimated Value
  estimatedValue: {
    realAVMValue: number;
    valueRangeLow: number;
    valueRangeHigh: number;
    valueAsOfDate: string;
    confidenceScore: number; // 0-100
    forecastStandardDeviation: number;
  };

  // Tax Information
  taxInfo: {
    pid: string;
    strap: string;
    parcelId: string;
    percentImproved: number;
    taxArea: string;
    lotNumber: string;
    exemptions: string[];
    legalDescription: string;
  };

  // Assessment & Taxes
  assessmentTaxes: {
    assessmentYear: number;
    marketValueTotal: number;
    marketValueLand: number;
    marketValueImproved: number;
    assessedValueTotal: number;
    yoyAssessedChangeAmount: number;
    yoyAssessedChangePercent: number;
    taxYear: number;
    totalTax: number;
    yoyTaxChangeAmount: number;
    yoyTaxChangePercent: number;
  };

  // Lot & Property Characteristics
  lotProperty: {
    lotShape: string;
    lotAcres: number;
    lotSqFt: number;
    countyUseCode: string;
    stateLandUse: string;
    buildingSqFtLivingArea: number;
    grossArea: number;
    totalBuildingSqFt: number;
    firstFloorSqFt: number;
    stories: number;
    quality: string;
    totalUnits: number;
    bedrooms: number;
    bathroomsTotal: number;
    bathroomsFull: number;
    coolingType: string;
    heatingType: string;
    heatingFuel: string;
    porchType: string;
    patioType: string;
    garageType: string;
    garageCapacity: number;
    garageSqFt: number;
    roofMaterial: string;
    interiorWallMaterial: string;
    exteriorMaterial: string;
    floorCovering: string;
    hasPool: boolean;
    poolSize?: string;
    yearBuilt: number;
    effectiveYearBuilt: number;
  };

  // Building Features
  buildingFeatures: {
    lawnIrrigationSystem: boolean;
    lawnIrrigationYearBuilt?: number;
    poolResidential: boolean;
    poolSize?: string;
    poolYearBuilt?: number;
    patioConcretePoolDeck: boolean;
    patioSqFt?: number;
    patioYearBuilt?: number;
    garageFinished: boolean;
    garageSize?: string;
    porchOpen: boolean;
    porchEnclosed: boolean;
    porchSqFt?: number;
    screenEnclosureSqFt?: number;
    basementSqFt?: number;
  };
}

export type PropertyCategory = 
  | 'Residential' 
  | 'Commercial' 
  | 'Industrial' 
  | 'Agricultural' 
  | 'Special Purpose' 
  | 'Investment' 
  | 'Land';

export type PropertyType = 
  // Residential
  | 'Single Family' 
  | 'Condo' 
  | 'Townhouse' 
  | 'Multi-Family' 
  | 'Duplex' 
  | 'Triplex' 
  | 'Apartment Complex'
  // Commercial
  | 'Office Building' 
  | 'Retail Space' 
  | 'Shopping Center' 
  | 'Mall' 
  | 'Restaurant' 
  | 'Hotel' 
  | 'Warehouse'
  // Industrial
  | 'Manufacturing' 
  | 'Distribution Center' 
  | 'Flex Space' 
  | 'Cold Storage' 
  | 'Data Center'
  // Agricultural
  | 'Farm Land' 
  | 'Ranch' 
  | 'Orchard' 
  | 'Vineyard' 
  | 'Timber Land' 
  | 'Hunting Land'
  // Special Purpose
  | 'Church' 
  | 'School' 
  | 'Hospital' 
  | 'Gas Station' 
  | 'Car Wash' 
  | 'Self Storage'
  // Land
  | 'Vacant Land' 
  | 'Development Land';

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'closed'
  | 'cold'
  | 'warm'
  | 'hot'
  | 'converted';

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  source: string;
  status: LeadStatus;
  score: number;
  assignedAgent?: string;
  propertyInterest?: string;
  budget?: number;
  notes?: string;
  lastContact?: string;
  propertyId?: string;
  createdAt: string;
  updatedAt?: string;
}

// Form interface for Add Property
export interface MLSPropertyForm {
  // Basic Property Info
  address: string;
  city: string;
  state: string;
  zipCode: string;
  neighborhood: string;
  price: number;
  propertyType: PropertyType;
  propertyCategory: PropertyCategory;
  description: string;
  features: string[];
  condition: 'Excellent' | 'Good' | 'Fair' | 'Needs Work' | 'Distressed';
  listingStatus: 'Active' | 'New' | 'Price Reduced' | 'Open House' | 'Under Contract' | 'Sold' | 'For Lease' | 'Leased';
  listingType: 'For Sale' | 'For Lease' | 'Sale/Leaseback' | 'Build-to-Suit' | 'NNN Lease';
  imageUrl: string;

  // Agent Info
  agentName: string;
  agentPhone: string;
  agentEmail: string;
  agentCompany: string;

  // MLS Data
  mls: MLSData;
}
