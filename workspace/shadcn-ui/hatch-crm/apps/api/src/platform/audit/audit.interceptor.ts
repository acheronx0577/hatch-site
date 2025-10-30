import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import { AuditAction } from '@hatch/db';

import { AuditService } from './audit.service';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const method = request?.method?.toUpperCase();

    if (!method || !MUTATING_METHODS.has(method)) {
      return next.handle();
    }

    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: (responseBody) => {
          void this.emitAuditEvent(request, responseBody, start, null);
        },
        error: (err: unknown) => {
          void this.emitAuditEvent(request, null, start, err);
        }
      })
    );
  }

  private async emitAuditEvent(
    request: any,
    responseBody: unknown,
    startedAt: number,
    error: unknown | null
  ) {
    const durationMs = Date.now() - startedAt;
    const platformContext = request?.platformContext ?? {};
    const orgId: string | undefined = platformContext.orgId ?? request?.headers?.['x-org-id'];

    const method = request?.method;
    const action = this.resolveAction(method);

    if (!orgId || !action) {
      return;
    }

    const responseRecordId =
      typeof responseBody === 'object' && responseBody !== null ? (responseBody as any).id : undefined;
    const recordId = request?.auditRecordId ?? request?.params?.id ?? responseRecordId;
    const object = request?.auditObject ?? undefined;
    const diff = request?.auditDiff ?? undefined;
    const actorId = request?.user?.sub ?? platformContext.userId ?? null;

    try {
      await this.audit.log({
        orgId,
        actorId,
        object,
        recordId,
        action,
        diff,
        ip: request?.ip,
        userAgent: request?.headers?.['user-agent']
      });
    } catch (auditError) {
      this.logger.error('Failed to persist audit event', auditError as Error);
    }

    this.logger.debug({
      event: 'audit_event',
      method,
      path: request?.url,
      actor: actorId,
      orgId,
      statusCode: request?.res?.statusCode,
      durationMs,
      error: error ? String(error) : undefined,
      recordId,
      object
    });
  }

  private resolveAction(method?: string): AuditAction | null {
    switch ((method ?? '').toUpperCase()) {
      case 'POST':
        return AuditAction.CREATE;
      case 'PATCH':
      case 'PUT':
        return AuditAction.UPDATE;
      case 'DELETE':
        return AuditAction.DELETE;
      default:
        return null;
    }
  }
}
