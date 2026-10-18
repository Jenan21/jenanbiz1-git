import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/jenan-map/schema.prisma",
  migrations: { path: "prisma/jenan-map/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
