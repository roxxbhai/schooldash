import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // AGENTS.MD: SINGLE QUOTES. ENFORCED FOR BACKEND, TEST AND SCRIPT CODE; THE
  // GENERATED DATABASE TYPES ARE WRITTEN BY THE SUPABASE CLI AND LEFT AS IS.
  {
    files: ["src/lib/**/*.ts", "src/configs/**/*.ts", "src/helpers/**/*.ts", "src/functions/**/*.ts", "src/types/**/*.ts", "src/constants/**/*.ts", "src/app/api/**/*.ts", "src/proxy.ts", "tests/**/*.ts", "scripts/**/*.ts"],
    ignores: ["src/types/database/index.ts"],
    rules: { quotes: ["error", "single", { avoidEscape: true }] },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
