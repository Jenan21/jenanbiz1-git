import type { ErrorEvent } from "@sentry/nextjs";

export function sanitizeSentryEvent(event: ErrorEvent): ErrorEvent {
  // Auth callbacks, request bodies and console breadcrumbs can contain credentials or private business inputs.
  delete event.request;
  delete event.user;
  delete event.breadcrumbs;
  delete event.extra;
  if (event.contexts?.nextjs) delete event.contexts.nextjs.request_path;
  return event;
}

export function sentryOptions(dsn: string | undefined) {
  return {
    dsn,
    enabled: process.env.NODE_ENV === "production" && Boolean(dsn),
    sendDefaultPii: false,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      frameContextLines: 0,
    },
    tracesSampleRate: 0,
    beforeSend: sanitizeSentryEvent,
  };
}
