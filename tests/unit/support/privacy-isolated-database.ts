export function assertPrivacyAcceptanceDatabase(url: string | undefined) {
  if (!url) throw new Error("ISOLATED_CONFIGURATION_REQUIRED");
  const parsed = new URL(url);
  const allowed = parsed.protocol === "postgresql:" && parsed.hostname === "127.0.0.1" &&
    ((parsed.port === "55439" && parsed.pathname === "/privacy_m4_v3") ||
      (parsed.port === "55449" && parsed.pathname === "/privacy_m5"));
  if (!allowed || process.env.DATABASE_URL !== url) throw new Error("ISOLATED_CONFIGURATION_REQUIRED");
  return url;
}
