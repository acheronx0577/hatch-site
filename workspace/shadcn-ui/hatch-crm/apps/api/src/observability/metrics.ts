import client from 'prom-client';

const METRICS_DISABLED = process.env.METRICS_DISABLED?.toLowerCase() === 'true';
const METRICS_TOKEN = process.env.METRICS_TOKEN?.trim() || null;

export const metricsRegistry = new client.Registry();

client.collectDefaultMetrics({
  register: metricsRegistry,
  prefix: 'hatch_crm_',
  labels: { service: 'hatch-crm-api' }
});

const requestCounter = new client.Counter({
  name: 'hatch_crm_http_requests_total',
  help: 'Total number of HTTP requests processed.',
  labelNames: ['method', 'route', 'status_code']
});

const requestDuration = new client.Histogram({
  name: 'hatch_crm_http_request_duration_seconds',
  help: 'HTTP request duration in seconds.',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
});

metricsRegistry.registerMetric(requestCounter);
metricsRegistry.registerMetric(requestDuration);

export const metricsEnabled = () => !METRICS_DISABLED;
export const metricsAuthRequired = () => !!METRICS_TOKEN;

const normaliseHeaderValue = (value?: string | string[] | null): string | undefined => {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    return value.length > 0 ? value[0] : undefined;
  }
  return value;
};

export const resolveMetricsToken = ({
  headerToken,
  authorization,
  queryToken
}: {
  headerToken?: string | string[] | null;
  authorization?: string | string[] | null;
  queryToken?: unknown;
}): string | undefined => {
  const header = normaliseHeaderValue(headerToken)?.trim();
  const auth = normaliseHeaderValue(authorization)?.trim();
  const query =
    typeof queryToken === 'string'
      ? queryToken
      : Array.isArray(queryToken) && queryToken.length > 0
        ? queryToken[0]
        : undefined;

  if (header) {
    return header;
  }

  if (auth) {
    if (auth.toLowerCase().startsWith('bearer ')) {
      return auth.slice(7).trim();
    }
    return auth;
  }

  return query?.trim();
};

export const isMetricsTokenValid = (token?: string | null) => {
  if (!METRICS_TOKEN) {
    return true;
  }

  if (!token) {
    return false;
  }

  return token === METRICS_TOKEN;
};

const normaliseRoute = (route?: string | null) => {
  if (!route || route === '') {
    return 'unknown';
  }
  return route.startsWith('/') ? route : `/${route}`;
};

export function observeRequestMetrics({
  method,
  route,
  statusCode,
  durationSeconds
}: {
  method: string;
  route?: string | null;
  statusCode: number;
  durationSeconds: number;
}) {
  if (METRICS_DISABLED) {
    return;
  }

  const labels = {
    method: method.toUpperCase(),
    route: normaliseRoute(route),
    status_code: String(statusCode)
  };

  requestCounter.inc(labels);
  requestDuration.observe(labels, durationSeconds);
}
