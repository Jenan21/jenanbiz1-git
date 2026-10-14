import { PRODUCTION_ORIGIN } from "@/config/site";

function readOptionalEnv(
  name: "DATABASE_URL" | "AUTH_SECRET" | "NEXT_PUBLIC_APP_URL",
) {
  return process.env[name];
}

export const env = {
  databaseUrl: readOptionalEnv("DATABASE_URL"),
  authSecret: readOptionalEnv("AUTH_SECRET"),
  appUrl:
    readOptionalEnv("NEXT_PUBLIC_APP_URL") ??
    (process.env.VERCEL_ENV === "production" ? PRODUCTION_ORIGIN : "http://localhost:3000"),
};
