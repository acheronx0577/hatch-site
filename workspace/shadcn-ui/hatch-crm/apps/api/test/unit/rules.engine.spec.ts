import { BadRequestException } from '@nestjs/common';

import { evaluateExpression } from '../../src/modules/rules/expression';

describe('Rules expression engine', () => {
  it('evaluates comparison and in operator', () => {
    expect(
      evaluateExpression('amount >= 50000', {
        before: null,
        after: { amount: 60000 }
      })
    ).toBe(true);

    expect(
      evaluateExpression("status in ['Resolved','Closed']", {
        before: null,
        after: { status: 'New' }
      })
    ).toBe(false);
  });

  it('evaluates changed and contains helpers', () => {
    const context = {
      before: { status: 'New', tags: ['vip'] },
      after: { status: 'Closed', tags: ['vip', 'priority'] }
    };

    expect(evaluateExpression("changed('status')", context)).toBe(true);
    expect(evaluateExpression("tags contains 'priority'", context)).toBe(true);
    expect(evaluateExpression("get('status') == 'Closed'", context)).toBe(true);
  });

  it('throws on unsupported operator', () => {
    expect(() =>
      evaluateExpression('amount ~~ 50000', {
        before: null,
        after: { amount: 50000 }
      })
    ).toThrow(BadRequestException);
  });
});
