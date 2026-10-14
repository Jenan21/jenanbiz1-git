import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { normalizeDatabaseUrl } from "@/lib/db-url";

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createPrismaClient> };

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured");
  const adapter = new PrismaPg({ connectionString: normalizeDatabaseUrl(connectionString) });
  // The password hash stays in the database unless a query asks for it with `omit: { passwordHash: false }`,
  // so a forgotten `include` can never carry it into a response.
  return new PrismaClient({ adapter, omit: { user: { passwordHash: true } } });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

/** What both the client and an interactive transaction can do; use it where a helper accepts either. */
export type DbExecutor = Omit<typeof db, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
