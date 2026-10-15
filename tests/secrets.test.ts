import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");

/** Every file git would commit: tracked plus untracked-but-not-ignored. */
function committableFiles(): string[] {
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8" },
  );
  return output
    .split("\0")
    .filter(Boolean)
    .filter((file) => existsSync(path.join(root, file)));
}

function textContent(file: string): string | null {
  const buffer = readFileSync(path.join(root, file));
  return buffer.includes(0) ? null : buffer.toString("utf8");
}

const SECRET_PATTERNS: [string, RegExp][] = [
  ["JWT (Supabase anon/service-role keys)", /eyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]{10,}/],
  ["Supabase secret key", /sb_secret_[\w-]{10,}/],
  ["Supabase publishable key", /sb_publishable_[\w-]{10,}/],
  ["Supabase project URL", /https:\/\/[a-z0-9]{20}\.supabase\.co/],
  ["Postgres connection string with password", /postgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]+@/],
  ["Private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

const SUPABASE_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_DB_URL",
];

describe("committed files contain no credentials", () => {
  const files = committableFiles();

  it("finds files to scan", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(SECRET_PATTERNS)("no %s", (_label, pattern) => {
    const hits = files.filter((file) => {
      const text = textContent(file);
      return text !== null && pattern.test(text);
    });
    expect(hits).toEqual([]);
  });

  it("no dotenv-style assignment gives a Supabase variable a value", () => {
    const assignment = new RegExp(`^\\s*(?:export\\s+)?(?:${SUPABASE_VARS.join("|")})[ \\t]*=[ \\t]*\\S`, "m");
    const hits = files.filter((file) => {
      const text = textContent(file);
      return text !== null && assignment.test(text);
    });
    expect(hits).toEqual([]);
  });

  it("no real env file is committable — only .env.example", () => {
    const envFiles = files.filter((file) => /(^|\/)\.env/.test(file));
    expect(envFiles).toEqual([".env.example"]);
  });

  it(".env.example documents each Supabase variable with an empty value", () => {
    const lines = readFileSync(path.join(root, ".env.example"), "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    expect(lines).toEqual(SUPABASE_VARS.map((name) => `${name}=`));
  });

  it("a real .env file would be ignored by git", () => {
    const ignored = execFileSync("git", ["check-ignore", ".env", ".env.local"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(ignored.trim().split("\n")).toEqual([".env", ".env.local"]);
  });
});
