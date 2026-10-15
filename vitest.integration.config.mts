import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

/**
 * Integration tests against the REAL Supabase project configured in
 * .env.local. Kept out of `npm test`; run with `npm run test:integration`.
 * Fails loudly (never skips) when configuration is missing.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    env: loadEnv("", process.cwd(), ""),
    // Tests share one database; run files one at a time.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
