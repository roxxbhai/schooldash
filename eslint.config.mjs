import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // AGENTS.MD: SINGLE QUOTES (INCLUDING JSX ATTRIBUTES) AND FUNCTION DECLARATIONS
  // INSTEAD OF ARROW FUNCTIONS ASSIGNED TO VARIABLES. INLINE CALLBACKS STAY ARROWS.
  // THE GENERATED DATABASE TYPES ARE WRITTEN BY THE SUPABASE CLI AND LEFT AS IS.
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.ts", "scripts/**/*.ts"],
    ignores: ["src/types/database/index.ts"],
    rules: {
      quotes: ["error", "single", { avoidEscape: true }],
      "jsx-quotes": ["error", "prefer-single"],
      semi: ["error", "always"],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/types/database/index.ts"],
    rules: { "func-style": ["error", "declaration"] },
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
