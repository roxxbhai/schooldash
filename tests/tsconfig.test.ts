import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");

function loadCompilerOptions(): ts.CompilerOptions {
  const configPath = path.join(root, "tsconfig.json");
  const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
  expect(error).toBeUndefined();
  return ts.parseJsonConfigFileContent(config, ts.sys, root).options;
}

describe("TypeScript configuration", () => {
  it("enables strict mode", () => {
    expect(loadCompilerOptions().strict).toBe(true);
  });

  it("does not opt out of any strict-family check", () => {
    const options = loadCompilerOptions();
    const strictFamily = [
      "noImplicitAny",
      "noImplicitThis",
      "strictNullChecks",
      "strictFunctionTypes",
      "strictBindCallApply",
      "strictPropertyInitialization",
      "useUnknownInCatchVariables",
      "alwaysStrict",
    ] as const;

    for (const flag of strictFamily) {
      expect(options[flag], flag).not.toBe(false);
    }
  });
});
