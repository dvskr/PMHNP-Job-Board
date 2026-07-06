import "dotenv/config";
import { defineConfig } from "prisma/config";

// DIRECT_URL (5432, non-pooled) for migrations; DATABASE_URL as fallback.
// The final placeholder exists because this config loads during
// `prisma generate` (postinstall), which never connects — the previous
// hard env("DIRECT_URL") requirement broke `npm ci` in every CI job
// without DB credentials (pr-gate/seo-guard, failing since 2026-06).
// Commands that DO connect (migrate deploy/status) fail loudly on the
// placeholder, and migrate-prod.yml verifies its secret before running.
// || (not ??) so a present-but-empty env line (e.g. `DIRECT_URL=` in a
// copied .env template) falls through instead of yielding an empty URL.
const url =
    process.env.DIRECT_URL ||
    process.env.DATABASE_URL ||
    "postgresql://placeholder:placeholder@localhost:5432/placeholder";

export default defineConfig({
    schema: "prisma/schema.prisma",
    datasource: { url },
});
