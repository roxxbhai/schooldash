import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src/", import.meta.url)),
      // Next.js resolves `server-only` to an empty module on the server. Vitest
      // runs as a plain Node process, so mirror that here. The real guard is
      // verified in tests/server-only.test.ts.
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Real-Supabase tests run separately: npm run test:integration
    exclude: ["tests/integration/**", "node_modules/**"],
  },
});
