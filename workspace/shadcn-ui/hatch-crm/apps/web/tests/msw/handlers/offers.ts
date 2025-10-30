import { http, HttpResponse } from 'msw';

const BASE = '/api/re/offers';

export const offersHandlers = [
  http.get(BASE, ({ request }) => {
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor');
    if (!cursor || cursor === 'null') {
      return HttpResponse.json({
        items: [{ id: 'o1' }, { id: 'o2' }],
        nextCursor: 'c2'
      });
    }
    if (cursor === 'c2') {
      return HttpResponse.json({
        items: [{ id: 'o3' }],
        nextCursor: null
      });
    }
    return HttpResponse.json({ items: [], nextCursor: null });
  }),
  http.post(`${BASE}/:id/accept`, () => HttpResponse.json({ ok: true })),
  http.post(`${BASE}/:id/reject`, () => HttpResponse.json({ ok: true }))
];
