// Minimal no-op stubs so controllers/DTOs can instantiate cleanly in a docs-only context.
export class StubPrismaService {
  async $connect() {}
  async $disconnect() {}
}

export class StubFlsService {
  readableSet() {
    return new Set<string>();
  }
  writableSet() {
    return new Set<string>();
  }
  async filterRead(_ctx: any, _obj: string, p: any) {
    return p;
  }
  async filterWrite(_ctx: any, _obj: string, p: any) {
    return p;
  }
}

export class StubCanService {
  async can() {
    return true;
  }
}

export class StubAuditService {
  async log() {
    /* noop */
  }
}

// Interceptors/guards are resolved as providers; make a harmless interceptor.
export class StubAuditInterceptor {
  intercept(_c: any, next: any) {
    return next.handle();
  }
}

// Config/token/oidc stubs to satisfy constructor injection
export class StubConfigService {
  get() {
    return undefined;
  }
}

export class StubTokensService {
  issueAccess() {
    return 'stub';
  }
  issueRefresh() {
    return 'stub';
  }
  verifyAccess() {
    return {};
  }
}

// Storage adapter stub for Files
export class StubStorageAdapter {
  async createUploadUrl() {
    return { uploadUrl: 'https://example/upload', storageKey: 'stub/key' };
  }
}

export class StubOutboxService {
  async processPending(_limit?: number, _options?: { tenantId?: string }) {
    return { processed: 0 };
  }

  async enqueue(_payload: unknown) {
    return { status: 'queued' };
  }
}

type AsyncOverride = (...args: any[]) => any;

export const createAsyncServiceStub = <T extends object>(overrides: Record<string, AsyncOverride> = {}) => {
  const store: Record<string | symbol, AsyncOverride> = { ...overrides };
  return new Proxy(store, {
    get(target, prop: string | symbol) {
      if (prop === 'then' || prop === 'catch' || prop === 'finally') {
        return undefined;
      }
      if (prop in target) {
        const value = target[prop];
        if (typeof value === 'function') {
          return value;
        }
      }
      return async () => undefined;
    }
  }) as unknown as T;
};
