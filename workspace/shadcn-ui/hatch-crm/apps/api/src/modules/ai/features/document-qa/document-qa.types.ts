export type PageContent = {
  pageNumber: number;
  content: string;
};

export type ProcessedDocumentChunk = {
  chunkIndex: number;
  pageNumber: number;
  content: string;
  embedding: number[];
};

export type ProcessedDocument = {
  filename: string;
  mimeType: string;
  fullText: string;
  pages: PageContent[];
  chunks: ProcessedDocumentChunk[];
};

export type UploadDocumentResult = {
  documentId: string;
  filename: string;
  mimeType: string;
  status: string;
  pageCount: number;
};

export type DocumentCitation = {
  citation: number;
  chunkId: string;
  chunkIndex: number;
  pageNumber: number;
  snippet: string;
};

export type DocumentQaResponse = {
  answer: string;
  citations: DocumentCitation[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  requestId: string;
};

