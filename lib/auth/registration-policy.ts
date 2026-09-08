export function isPublicRegistrationAllowed(environment = process.env) {
  return environment.NODE_ENV !== "production" || environment.ALLOW_PUBLIC_REGISTRATION === "true";
}