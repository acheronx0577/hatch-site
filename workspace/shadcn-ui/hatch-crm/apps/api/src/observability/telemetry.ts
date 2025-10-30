import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

let PrismaInstrumentationCtor: (new (...args: any[]) => unknown) | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
  PrismaInstrumentationCtor = require('@prisma/instrumentation').PrismaInstrumentation;
} catch {
  PrismaInstrumentationCtor = undefined;
}

let sdk: NodeSDK | null = null;

const shouldEnableTelemetry = () =>
  process.env.NODE_ENV !== 'test' && process.env.OTEL_DISABLED?.toLowerCase() !== 'true';

export async function initTelemetry(): Promise<NodeSDK | null> {
  if (!shouldEnableTelemetry()) {
    return null;
  }

  if (sdk) {
    return sdk;
  }

  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);

  const traceExporter =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT && process.env.OTEL_EXPORTER_OTLP_ENDPOINT.length > 0
      ? new OTLPTraceExporter({
          url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
        })
      : undefined;

  const serviceName = process.env.OTEL_SERVICE_NAME?.trim() || 'hatch-crm-api';
  const resource = defaultResource().merge(
    resourceFromAttributes({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName
    })
  );

  const instrumentationInstances: unknown[] = [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': { enabled: true },
      '@opentelemetry/instrumentation-fastify': { enabled: true },
      '@opentelemetry/instrumentation-nestjs-core': { enabled: true }
    })
  ];

  if (typeof PrismaInstrumentationCtor === 'function') {
    instrumentationInstances.push(new PrismaInstrumentationCtor());
  }

  sdk = new NodeSDK({
    resource,
    traceExporter,
    // Cast to align with NodeSDK typings without pulling the instrumentation package into build output.
    instrumentations: instrumentationInstances as any
  });

  await sdk.start();

  process.on('SIGTERM', () => {
    void shutdownTelemetry();
  });

  process.on('SIGINT', () => {
    void shutdownTelemetry();
  });

  return sdk;
}

export async function shutdownTelemetry(): Promise<void> {
  if (!sdk) {
    return;
  }

  try {
    await sdk.shutdown();
  } finally {
    sdk = null;
  }
}
