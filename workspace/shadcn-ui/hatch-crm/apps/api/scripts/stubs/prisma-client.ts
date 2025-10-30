/* Docs-only stub for @prisma/client */
class Decimal {
  constructor(public value?: unknown) {}
}

class PrismaClientKnownRequestError extends Error {}
class PrismaClientInitializationError extends Error {}
class PrismaClientValidationError extends Error {}

const SortOrder = { asc: 'asc', desc: 'desc' } as const;
const QueryMode = { default: 'default', insensitive: 'insensitive' } as const;
const NullTypes = {
  DbNull: Symbol('DbNull'),
  JsonNull: Symbol('JsonNull'),
  AnyNull: Symbol('AnyNull')
};

export class PrismaClient {
  async $connect(): Promise<void> {}
  async $disconnect(): Promise<void> {}
}

export const Prisma: any = {
  Decimal,
  PrismaClientKnownRequestError,
  PrismaClientInitializationError,
  PrismaClientValidationError,
  SortOrder,
  QueryMode,
  NullTypes,
  validator: () => (payload: unknown) => payload,
  getExtensionContext: () => ({}),
  defineExtension: (extension: unknown) => extension
};

export {
  Decimal,
  PrismaClientKnownRequestError,
  PrismaClientInitializationError,
  PrismaClientValidationError,
  SortOrder,
  QueryMode,
  NullTypes
};

export default PrismaClient;
