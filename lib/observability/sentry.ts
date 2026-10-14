import type { ErrorEvent } from "@sentry/nextjs";

export function sanitizeSentryEvent(event: ErrorEvent): ErrorEvent {
  // Auth callbacks, request bodies and console breadcrumbs can contain credentials or private business inputs.
  delete event.request;
  delete event.user;
  delete event.breadcrumbs;
  delete event.extra;
  return event;
}

export function sentryOptions(dsn: string | undefined) {
  return {
    dsn,
    enabled: process.env.NODE_ENV === "production" && Boolean(dsn),
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: sanitizeSentryEvent,
  };
}
