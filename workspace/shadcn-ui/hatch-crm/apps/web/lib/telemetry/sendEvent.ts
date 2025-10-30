type TelemetryProps = Record<string, string | number | boolean | null | undefined>;

export function sendEvent(name: string, props: TelemetryProps = {}) {
  try {
    // Replace with real analytics sink (PostHog/Segment/etc.) when available.
    // eslint-disable-next-line no-console
    console.debug('[telemetry]', name, props);
  } catch {
    // swallow logging errors
  }
}
