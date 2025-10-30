import { BadRequestException } from '@nestjs/common';

export type BinaryOperator = '==' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'contains';
export type LogicalOperator = 'and' | 'or';

export interface ExpressionContext {
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
}

export interface ParsedExpression {
  ast: AstNode;
  identifiers: Set<string>;
  functions: Set<string>;
}

type TokenType =
  | 'lparen'
  | 'rparen'
  | 'lbracket'
  | 'rbracket'
  | 'comma'
  | 'operator'
  | 'logical'
  | 'identifier'
  | 'string'
  | 'number'
  | 'boolean'
  | 'null';

interface Token {
  type: TokenType;
  value: string;
}

type AstNode =
  | { type: 'Literal'; value: unknown }
  | { type: 'Identifier'; path: string }
  | { type: 'Logical'; operator: LogicalOperator; left: AstNode; right: AstNode }
  | { type: 'Binary'; operator: BinaryOperator; left: AstNode; right: AstNode }
  | { type: 'Call'; name: string; args: AstNode[] }
  | { type: 'Array'; items: AstNode[] };

const BINARY_OPERATORS: BinaryOperator[] = ['==', '!=', '>', '>=', '<', '<=', 'in', 'contains'];
const LOGICAL_OPERATORS: LogicalOperator[] = ['and', 'or'];

const isAlpha = (char: string) => /[a-zA-Z_]/.test(char);
const isNumeric = (char: string) => /[0-9]/.test(char);
const isIdentifierChar = (char: string) => /[a-zA-Z0-9_.]/.test(char);

export class ExpressionParser {
  private readonly tokens: Token[];
  private index = 0;
  private readonly identifiers = new Set<string>();
  private readonly functions = new Set<string>();

  constructor(private readonly expression: string) {
    this.tokens = tokenize(expression);
  }

  static parse(expression: string): ParsedExpression {
    const parser = new ExpressionParser(expression);
    const ast = parser.parseExpression();
    if (!parser.isAtEnd()) {
      throw new BadRequestException(`Unexpected token near "${parser.peek()?.value ?? ''}"`);
    }
    return { ast, identifiers: parser.identifiers, functions: parser.functions };
  }

  private parseExpression(): AstNode {
    return this.parseOr();
  }

  private parseOr(): AstNode {
    let node = this.parseAnd();
    while (this.matchLogical('or')) {
      const operator = 'or';
      const right = this.parseAnd();
      node = { type: 'Logical', operator, left: node, right };
    }
    return node;
  }

  private parseAnd(): AstNode {
    let node = this.parseComparison();
    while (this.matchLogical('and')) {
      const operator = 'and';
      const right = this.parseComparison();
      node = { type: 'Logical', operator, left: node, right };
    }
    return node;
  }

  private parseComparison(): AstNode {
    let node = this.parseUnary();
    while (true) {
      const token = this.peek();
      if (token && token.type === 'operator' && isBinaryOperator(token.value)) {
        this.advance();
        const operator = token.value as BinaryOperator;
        const right = this.parseUnary();
        node = { type: 'Binary', operator, left: node, right };
      } else {
        break;
      }
    }
    return node;
  }

  private parseUnary(): AstNode {
    return this.parsePrimary();
  }

  private parsePrimary(): AstNode {
    const token = this.peek();
    if (!token) {
      throw new BadRequestException('Unexpected end of expression');
    }

    if (token.type === 'lparen') {
      this.advance(); // consume '('
      const expr = this.parseExpression();
      this.consume('rparen', "Expected ')' after expression");
      return expr;
    }

    if (token.type === 'lbracket') {
      return this.parseArray();
    }

    if (token.type === 'string') {
      this.advance();
      return { type: 'Literal', value: token.value };
    }

    if (token.type === 'number') {
      this.advance();
      return { type: 'Literal', value: Number(token.value) };
    }

    if (token.type === 'boolean') {
      this.advance();
      return { type: 'Literal', value: token.value === 'true' };
    }

    if (token.type === 'null') {
      this.advance();
      return { type: 'Literal', value: null };
    }

    if (token.type === 'identifier') {
      this.advance();
      const next = this.peek();
      if (next?.type === 'lparen') {
        this.advance(); // consume '('
        const args: AstNode[] = [];
        if (!this.check('rparen')) {
          do {
            args.push(this.parseExpression());
          } while (this.match('comma'));
        }
        this.consume('rparen', "Expected ')' after arguments");
        this.functions.add(token.value);
        this.registerFunctionFieldRefs(token.value, args);
        return { type: 'Call', name: token.value, args };
      }
      this.identifiers.add(token.value);
      return { type: 'Identifier', path: token.value };
    }

    throw new BadRequestException(`Unexpected token "${token.value}" in expression`);
  }

  private parseArray(): AstNode {
    this.consume('lbracket', "Expected '[' to begin array");
    const items: AstNode[] = [];
    if (!this.check('rbracket')) {
      do {
        items.push(this.parseExpression());
      } while (this.match('comma'));
    }
    this.consume('rbracket', "Expected ']' after array items");
    return { type: 'Array', items };
  }

  private registerFunctionFieldRefs(name: string, args: AstNode[]) {
    if (name === 'changed' || name === 'get') {
      const [first] = args;
      if (first?.type === 'Literal' && typeof first.value === 'string') {
        this.identifiers.add(first.value);
      }
    }
  }

  private match(type: TokenType): boolean {
    const token = this.peek();
    if (token?.type === type) {
      this.advance();
      return true;
    }
    return false;
  }

  private matchLogical(operator: LogicalOperator): boolean {
    const token = this.peek();
    if (token?.type === 'logical' && normaliseLogical(token.value) === operator) {
      this.advance();
      return true;
    }
    if (operator === 'and' && token?.type === 'operator' && token.value === '&&') {
      this.advance();
      return true;
    }
    if (operator === 'or' && token?.type === 'operator' && token.value === '||') {
      this.advance();
      return true;
    }
    return false;
  }

  private consume(type: TokenType, message: string) {
    if (this.check(type)) {
      this.advance();
      return;
    }
    throw new BadRequestException(message);
  }

  private check(type: TokenType) {
    const token = this.peek();
    return token?.type === type;
  }

  private advance() {
    this.index += 1;
  }

  private peek(): Token | null {
    return this.tokens[this.index] ?? null;
  }

  private isAtEnd() {
    return this.index >= this.tokens.length;
  }
}

function isBinaryOperator(value: string): value is BinaryOperator {
  if (value === '&&' || value === '||') {
    return false;
  }
  return BINARY_OPERATORS.includes(value as BinaryOperator);
}

function normaliseLogical(value: string): LogicalOperator {
  if (value === '&&') {
    return 'and';
  }
  if (value === '||') {
    return 'or';
  }
  const lower = value.toLowerCase();
  if (lower === 'and' || lower === 'or') {
    return lower;
  }
  throw new BadRequestException(`Unsupported logical operator "${value}"`);
}

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  const push = (type: TokenType, value: string) => {
    tokens.push({ type, value });
  };

  const length = expression.length;
  while (i < length) {
    const char = expression[i]!;

    if (char.trim().length === 0) {
      i += 1;
      continue;
    }

    if (char === '(') {
      push('lparen', char);
      i += 1;
      continue;
    }
    if (char === ')') {
      push('rparen', char);
      i += 1;
      continue;
    }
    if (char === '[') {
      push('lbracket', char);
      i += 1;
      continue;
    }
    if (char === ']') {
      push('rbracket', char);
      i += 1;
      continue;
    }
    if (char === ',') {
      push('comma', char);
      i += 1;
      continue;
    }

    const twoChar = expression.slice(i, i + 2);
    if (twoChar === '==' || twoChar === '!=' || twoChar === '>=' || twoChar === '<=' || twoChar === '&&' || twoChar === '||') {
      push(twoChar === '&&' || twoChar === '||' ? 'operator' : 'operator', twoChar);
      i += 2;
      continue;
    }

    if (char === '>' || char === '<') {
      push('operator', char);
      i += 1;
      continue;
    }

    if (char === '\'' || char === '"') {
      const quote = char;
      let value = '';
      i += 1;
      let closed = false;
      while (i < length) {
        const current = expression[i]!;
        if (current === '\\') {
          const next = expression[i + 1];
          if (next !== undefined) {
            value += next;
            i += 2;
            continue;
          }
        }
        if (current === quote) {
          closed = true;
          i += 1;
          break;
        }
        value += current;
        i += 1;
      }
      if (!closed) {
        throw new BadRequestException('Unterminated string literal in expression');
      }
      push('string', value);
      continue;
    }

    if (isNumeric(char) || (char === '-' && isNumeric(expression[i + 1] ?? ''))) {
      let value = char;
      i += 1;
      while (i < length) {
        const current = expression[i]!;
        if (isNumeric(current) || current === '.') {
          value += current;
          i += 1;
        } else {
          break;
        }
      }
      push('number', value);
      continue;
    }

    if (isAlpha(char)) {
      let value = char;
      i += 1;
      while (i < length) {
        const current = expression[i]!;
        if (isIdentifierChar(current)) {
          value += current;
          i += 1;
        } else {
          break;
        }
      }

      const lower = value.toLowerCase();
      if (lower === 'true' || lower === 'false') {
        push('boolean', lower);
      } else if (lower === 'null') {
        push('null', lower);
      } else if (lower === 'and' || lower === 'or') {
        push('logical', lower);
      } else if (lower === 'in' || lower === 'contains') {
        push('operator', lower);
      } else {
        push('identifier', value);
      }
      continue;
    }

    throw new BadRequestException(`Unexpected character "${char}" in expression`);
  }

  return tokens;
}

export interface EvaluationOptions {
  onFieldReference?: (path: string) => void;
}

export function evaluateExpression(
  expression: string,
  context: ExpressionContext,
  options: EvaluationOptions = {}
): boolean {
  const parsed = ExpressionParser.parse(expression);
  for (const field of parsed.identifiers) {
    options.onFieldReference?.(field);
  }
  return Boolean(evaluateNode(parsed.ast, context));
}

function evaluateNode(node: AstNode, context: ExpressionContext): unknown {
  switch (node.type) {
    case 'Literal':
      return node.value;
    case 'Identifier':
      return resolveValue(context, node.path);
    case 'Array':
      return node.items.map((item) => evaluateNode(item, context));
    case 'Call':
      return evaluateCall(node, context);
    case 'Logical': {
      const left = Boolean(evaluateNode(node.left, context));
      if (node.operator === 'and') {
        return left && Boolean(evaluateNode(node.right, context));
      }
      return left || Boolean(evaluateNode(node.right, context));
    }
    case 'Binary': {
      const left = evaluateNode(node.left, context);
      const right = evaluateNode(node.right, context);
      return evaluateBinary(node.operator, left, right);
    }
    default:
      throw new BadRequestException('Unsupported expression node');
  }
}

function evaluateCall(node: Extract<AstNode, { type: 'Call' }>, context: ExpressionContext): unknown {
  const name = node.name.toLowerCase();
  if (name === 'changed') {
    if (node.args.length !== 1) {
      throw new BadRequestException(`changed() expects exactly one argument`);
    }
    const target = node.args[0];
    const path = resolveCallPathArgument('changed', target, context);
    const before = resolveRaw(context.before, path);
    const after = resolveRaw(context.after, path);
    return !valuesEqual(normaliseValue(before), normaliseValue(after));
  }
  if (name === 'get') {
    if (node.args.length !== 1) {
      throw new BadRequestException(`get() expects exactly one argument`);
    }
    const path = resolveCallPathArgument('get', node.args[0], context);
    return resolveRaw(context.after, path);
  }
  throw new BadRequestException(`Unsupported function "${node.name}" in expression`);
}

function resolveCallPathArgument(
  fn: string,
  node: AstNode,
  context: ExpressionContext
): string {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  if (node.type === 'Identifier') {
    const value = resolveValue(context, node.path);
    if (typeof value === 'string') {
      return value;
    }
  }
  throw new BadRequestException(`${fn}() expects a string path argument`);
}

function evaluateBinary(operator: BinaryOperator, left: unknown, right: unknown): boolean {
  const lhs = normaliseValue(left);
  const rhs = normaliseValue(right);

  switch (operator) {
    case '==':
      return valuesEqual(lhs, rhs);
    case '!=':
      return !valuesEqual(lhs, rhs);
    case '>':
    case '>=':
    case '<':
    case '<=': {
      const leftNum = toComparable(lhs);
      const rightNum = toComparable(rhs);
      switch (operator) {
        case '>':
          return leftNum > rightNum;
        case '>=':
          return leftNum >= rightNum;
        case '<':
          return leftNum < rightNum;
        case '<=':
          return leftNum <= rightNum;
      }
      return false;
    }
    case 'in': {
      if (!Array.isArray(rhs)) {
        throw new BadRequestException('Right-hand side of "in" must be an array');
      }
      return rhs.some((entry) => valuesEqual(normaliseValue(entry), lhs));
    }
    case 'contains': {
      if (typeof lhs === 'string' && typeof rhs === 'string') {
        return lhs.includes(rhs);
      }
      if (Array.isArray(lhs)) {
        return lhs.some((entry) => valuesEqual(normaliseValue(entry), rhs));
      }
      throw new BadRequestException('Left-hand side of "contains" must be a string or array');
    }
    default:
      throw new BadRequestException(`Unsupported operator "${operator}"`);
  }
}

function toComparable(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return numeric;
    }
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  throw new BadRequestException(`Value "${String(value)}" is not comparable`);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    return a.every((value, index) => valuesEqual(value, b[index]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const aEntries = Object.entries(a as Record<string, unknown>).sort(([keyA], [keyB]) =>
      keyA.localeCompare(keyB)
    );
    const bEntries = Object.entries(b as Record<string, unknown>).sort(([keyA], [keyB]) =>
      keyA.localeCompare(keyB)
    );
    if (aEntries.length !== bEntries.length) {
      return false;
    }
    return aEntries.every(([key, value], index) => {
      const [otherKey, otherValue] = bEntries[index]!;
      return key === otherKey && valuesEqual(value, otherValue);
    });
  }
  return a === b;
}

function resolveValue(context: ExpressionContext, path: string): unknown {
  const fromAfter = resolveRaw(context.after, path);
  if (fromAfter !== undefined) {
    return fromAfter;
  }
  if (context.before) {
    return resolveRaw(context.before, path);
  }
  return undefined;
}

function resolveRaw(source: Record<string, unknown> | null, path: string): unknown {
  if (!source) {
    return undefined;
  }
  if (path === '' || path === '.') {
    return source;
  }
  const segments = path.split('.').map((segment) => segment.trim()).filter(Boolean);
  let current: any = source;
  for (const segment of segments) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    if (Object.prototype.hasOwnProperty.call(current, segment)) {
      current = current[segment];
    } else if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isNaN(index) && index >= 0 && index < current.length) {
        current = current[index];
      } else {
        return undefined;
      }
    } else {
      return undefined;
    }
  }
  return current;
}

function normaliseValue(input: unknown): unknown {
  if (!input) {
    return input;
  }
  if (typeof input === 'object') {
    if ('toNumber' in (input as any) && typeof (input as any).toNumber === 'function') {
      try {
        return (input as any).toNumber();
      } catch {
        return Number((input as any).value ?? NaN);
      }
    }
    if (Array.isArray(input)) {
      return input.map((entry) => normaliseValue(entry));
    }
    if (input instanceof Date) {
      return input;
    }
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      output[key] = normaliseValue(value);
    }
    return output;
  }
  return input;
}
