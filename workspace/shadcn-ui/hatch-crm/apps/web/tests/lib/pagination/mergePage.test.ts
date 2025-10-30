import { mergePage } from '../../../lib/pagination/mergePage';

describe('mergePage', () => {
  it('deduplicates items by id', () => {
    const current = [{ id: 1 }, { id: 2 }];
    const incoming = [{ id: 2 }, { id: 3 }];
    expect(mergePage(current, incoming)).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });

  it('allows overriding key field', () => {
    const current = [{ uuid: 'a' }, { uuid: 'b' }];
    const incoming = [{ uuid: 'b' }, { uuid: 'c' }];
    expect(mergePage(current, incoming, 'uuid')).toEqual([
      { uuid: 'a' },
      { uuid: 'b' },
      { uuid: 'c' }
    ]);
  });

  it('returns original array reference when next is empty', () => {
    const current = [{ id: 1 }];
    const merged = mergePage(current, []);
    expect(merged).toBe(current);
  });
});
