export function isPublicRegistrationAllowed(
  environment: Record<string, string | undefined> = process.env,
) {
  return environment.NODE_ENV !== "production" || environment.ALLOW_PUBLIC_REGISTRATION === "true";
}