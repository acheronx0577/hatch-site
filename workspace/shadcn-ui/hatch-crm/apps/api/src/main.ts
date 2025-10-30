import cors, { type FastifyCorsOptions, type FastifyCorsOptionsDelegate } from '@fastify/cors';
import cookie, { type FastifyCookieOptions } from '@fastify/cookie';
import helmet, { type FastifyHelmetOptions } from '@fastify/helmet';
import multipart, { type FastifyMultipartOptions } from '@fastify/multipart';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import pino from 'pino';
import { v4 as uuid } from 'uuid';

import { AppModule } from './app.module';
import { initTelemetry, shutdownTelemetry } from './observability/telemetry';
import {
  isMetricsTokenValid,
  metricsAuthRequired,
  metricsEnabled,
  metricsRegistry,
  observeRequestMetrics,
  resolveMetricsToken
} from './observability/metrics';

let cachedServer: any = null;
let appPromise: Promise<NestFastifyApplication> | null = null;

export async function createApp(): Promise<NestFastifyApplication> {
  await initTelemetry();

  const logger = pino({
    level: process.env.LOG_LEVEL ?? 'info',
    base: {
      service: 'hatch-crm-api'
    },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-api-key"]',
        'req.headers["x-auth-token"]',
        'req.headers["set-cookie"]',
        'res.headers["set-cookie"]',
        'req.body.password',
        'req.body.confirmPassword',
        'req.body.token',
        '*.email',
        '*.phone',
        '*.ssn'
      ],
      censor: '[REDACTED]'
    },
    transport:
      process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test'
        ? {
            target: 'pino-pretty',
            options: {
              ignore: 'pid,hostname',
              singleLine: true
            }
          }
        : undefined
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger })
  );

  if (process.env.NODE_ENV !== 'test') {
    app.setGlobalPrefix('api');
  }

  const helmetOptions: FastifyHelmetOptions = { contentSecurityPolicy: false };
  await app.register(helmet as unknown as Parameters<typeof app.register>[0], helmetOptions);

  const corsOptions: FastifyCorsOptions = {
    origin: true,
    credentials: true
  } satisfies FastifyCorsOptions;
  await app.register(
    cors as unknown as Parameters<typeof app.register>[0],
    corsOptions as FastifyCorsOptions | FastifyCorsOptionsDelegate
  );

  const multipartOptions: FastifyMultipartOptions = {
    limits: {
      fileSize: 25 * 1024 * 1024,
      files: 1,
      fields: 10
    }
  };
  await app.register(multipart as unknown as Parameters<typeof app.register>[0], multipartOptions);

  const cookieSecret = process.env.COOKIE_SECRET ?? 'local-test-cookie-secret';

  const cookieOptions: FastifyCookieOptions = {
    secret: cookieSecret,
    hook: 'onRequest'
  };
  await app.register(cookie as unknown as Parameters<typeof app.register>[0], cookieOptions);

  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );

  const shouldEnableSwagger =
    process.env.NODE_ENV !== 'test' && process.env.SKIP_SWAGGER !== 'true';
  if (shouldEnableSwagger) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Hatch CRM API')
      .setDescription('API surface for Hatch CRM MVP')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  await app.init();

  const fastify = app.getHttpAdapter().getInstance();

  // Ensure preParsing hook list is initialized to avoid Fastify internal null checks
  fastify.addHook('preParsing', (_request, _reply, payload, done) => {
    done(null, payload);
  });

  fastify.addHook('onRequest', (request, reply, done) => {
    const currentId = typeof request.id === 'string' && request.id.length > 0 ? request.id : null;
    const requestId = currentId ?? uuid();

    reply.header('x-request-id', requestId);

    (request as any)._requestStart = process.hrtime.bigint();
    request.log = request.log.child({
      requestId,
      orgId: request.headers['x-org-id'],
      userId: request.headers['x-user-id']
    });

    done();
  });

  fastify.addHook('onResponse', (request, reply, done) => {
    const start = (request as any)._requestStart as bigint | undefined;
    const diff = start ? process.hrtime.bigint() - start : BigInt(0);
    const durationMs = Number(diff) / 1_000_000;
    const durationSeconds = Number(diff) / 1_000_000_000;
    const route =
      (request as any).routerPath ??
      (request as any).context?.config?.url ??
      request.url ??
      request.raw?.url ??
      'unknown';

    request.log.info(
      {
        event: 'request.completed',
        method: request.method,
        route,
        statusCode: reply.statusCode,
        orgId: request.headers['x-org-id'],
        userId: request.headers['x-user-id'],
        durationMs
      },
      'Request completed'
    );

    if (metricsEnabled()) {
      observeRequestMetrics({
        method: request.method ?? 'GET',
        route,
        statusCode: reply.statusCode,
        durationSeconds
      });
    }

    done();
  });

  if (metricsEnabled()) {
    fastify.get<{ Querystring: { token?: string } }>('/metrics', async (request, reply) => {
      if (metricsAuthRequired()) {
        const providedToken = resolveMetricsToken({
          headerToken: request.headers['x-metrics-token'],
          authorization: request.headers.authorization,
          queryToken: request.query.token
        });

        if (!isMetricsTokenValid(providedToken)) {
          reply.code(401).send({
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Invalid or missing metrics token'
          });
          return;
        }
      }

      reply.header('content-type', metricsRegistry.contentType);
      reply.send(await metricsRegistry.metrics());
    });
  }

  fastify.addHook('onClose', async () => {
    await shutdownTelemetry();
  });

  // Ensure Fastify lifecycle hooks (like preParsing) are initialized before handling requests
  await fastify.ready();

  return app;
}

async function ensureServer() {
  if (!cachedServer) {
    appPromise = appPromise ?? createApp();
    const app = await appPromise;
    cachedServer = app.getHttpAdapter().getInstance();
  }

  return cachedServer;
}

async function bootstrap() {
  const app = await createApp();
  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') ?? 4000;
  const host = configService.get<string>('app.host') ?? '0.0.0.0';

  await app.listen({ port, host });
}

if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') {
  void bootstrap();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const fastifyInstance = await ensureServer();
  await fastifyInstance.ready();
  return fastifyInstance.routing(req, res);
}
