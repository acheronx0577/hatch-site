import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { setupServer } from 'msw/node';
import '@testing-library/jest-dom';

import { offersHandlers } from '../msw/handlers/offers';

const server = setupServer(...offersHandlers);
const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
  debugSpy.mockRestore();
});
