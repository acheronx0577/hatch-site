import { AiPersonasService } from './ai-personas.service';

const createService = () =>
  new AiPersonasService(
    {} as any, // AiService
    {} as any, // AiPersonaRouterService
    {} as any, // PrismaService
    {} as any, // SemanticSearchService
    {} as any // S3Service
  );

describe('AiPersonasService.isFormsSearchQuery', () => {
  it('does not treat transaction checklist prompts as contract searches', () => {
    const service = createService();
    const query = [
      'Act as my transaction coordinator.',
      'Transaction: 200 Main Street, San Francisco CA 94102 (txn-2)',
      'Status: Under contract',
      'Closing: 1/6/2026',
      'What is missing or overdue on this transaction, and what should we do next? Please give me a prioritized checklist.'
    ].join('\n');

    expect(service.isFormsSearchQuery(query)).toBe(false);
  });

  it('does not treat contract timeline questions as contract searches', () => {
    const service = createService();
    expect(service.isFormsSearchQuery('What contract dates are next for this deal?')).toBe(false);
    expect(service.isFormsSearchQuery('Need contract dates + timeline for closing.')).toBe(false);
  });

  it('treats explicit forms requests as contract searches', () => {
    const service = createService();
    expect(service.isFormsSearchQuery('Which FAR/BAR form should I use for a residential purchase?')).toBe(true);
    expect(service.isFormsSearchQuery('Need NAB087 sales contract PDF')).toBe(true);
    expect(service.isFormsSearchQuery('What contract should I use for this transaction?')).toBe(true);
  });
});

