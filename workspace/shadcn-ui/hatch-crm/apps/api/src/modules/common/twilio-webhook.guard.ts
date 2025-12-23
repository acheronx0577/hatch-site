import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import twilio from 'twilio';

const resolveTwilioWebhookValidationEnabled = () => {
  const configured = (process.env.TWILIO_VALIDATE_WEBHOOK_SIGNATURE ?? '').trim();
  if (configured) {
    return configured.toLowerCase() === 'true';
  }
  return process.env.NODE_ENV === 'production';
};

const firstHeaderValue = (value: string | string[] | undefined): string | undefined => {
  if (!value) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
};

const resolveRequestOrigin = (request: FastifyRequest) => {
  const forwardedProto = firstHeaderValue(request.headers['x-forwarded-proto'] as any)?.split(',')[0]?.trim();
  const forwardedHost = firstHeaderValue(request.headers['x-forwarded-host'] as any)?.split(',')[0]?.trim();
  const host = forwardedHost ?? firstHeaderValue(request.headers['host'] as any);
  const protocol = forwardedProto ?? ((request as any).protocol as string | undefined) ?? 'http';
  return host ? `${protocol}://${host}` : null;
};

@Injectable()
export class TwilioWebhookGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!resolveTwilioWebhookValidationEnabled()) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const signature =
      firstHeaderValue(request.headers['x-twilio-signature'] as any)?.trim() ??
      firstHeaderValue(request.headers['X-Twilio-Signature'] as any)?.trim();
    const authToken = (process.env.TWILIO_AUTH_TOKEN ?? '').trim();

    if (!authToken) {
      throw new UnauthorizedException('TWILIO_AUTH_TOKEN is not configured');
    }

    if (!signature) {
      throw new UnauthorizedException('Missing Twilio signature');
    }

    const origin = resolveRequestOrigin(request);
    if (!origin) {
      throw new UnauthorizedException('Unable to resolve request origin for Twilio signature validation');
    }

    const url = `${origin}${request.raw.url ?? request.url ?? ''}`;
    const params =
      request.method?.toUpperCase() === 'GET'
        ? ((request.query ?? {}) as Record<string, unknown>)
        : ((request.body ?? {}) as Record<string, unknown>);

    const valid = twilio.validateRequest(authToken, signature, url, params);
    if (!valid) {
      throw new UnauthorizedException('Invalid Twilio signature');
    }

    return true;
  }
}

