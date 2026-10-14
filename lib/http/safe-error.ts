import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";

const MAX_PUBLIC_MESSAGE_LENGTH = 300;
// Stack frames, file locations, SQL fragments and driver codes: anything that describes our internals.
const INTERNAL_DETAIL =
  /prisma|invocation|\n\s+at\s|node_modules|\.(?:ts|tsx|js|mjs|cjs):\d+|\bE(?:CONN|TIMEDOUT|NOTFOUND|AI_AGAIN)\w*|\b(?:SELECT|INSERT INTO|UPDATE|DELETE FROM)\b/i;

function isDatabaseError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientValidationError ||
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError
  );
}

/**
 * The text a client may see for a failed request. Errors that service code raises on purpose (a plain `Error` with a
 * short, human-readable message) pass through unchanged. Everything else — database, runtime and library errors —
 * is logged together with a short reference and replaced by a generic sentence carrying that reference.
 */
export function publicErrorMessage(error: unknown, fallback = "The request could not be completed."): string {
  // The one subclass that is safe to show: it only asks the person to verify their e-mail address.
  if (error instanceof Error && (error as { code?: unknown }).code === "EMAIL_NOT_VERIFIED" && error.name === "EmailNotVerifiedError") {
    return error.message;
  }
  if (
    error instanceof Error &&
    error.constructor === Error &&
    !isDatabaseError(error) &&
    error.message.trim() &&
    error.message.length <= MAX_PUBLIC_MESSAGE_LENGTH &&
    !INTERNAL_DETAIL.test(error.message)
  ) {
    return error.message;
  }
  const reference = randomUUID().slice(0, 8);
  console.error(`[api-error ${reference}]`, error);
  return `${fallback} (ref ${reference})`;
}
