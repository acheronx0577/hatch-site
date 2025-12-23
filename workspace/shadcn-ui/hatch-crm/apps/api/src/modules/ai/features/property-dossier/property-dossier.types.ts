export type GenerateDossierRequest = {
  address?: string;
  listingId?: string;
  documentIds?: string[];
  notes?: string;
};

export type PropertyDossierResult = {
  dossier: any;
  requestId: string;
};

