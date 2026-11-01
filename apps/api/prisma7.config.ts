import "dotenv/config";
import { defineConfig } from "prisma/config";

const process = (globalThis as typeof globalThis & {
  process: { env: Record<string, string | undefined> };
}).process;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
