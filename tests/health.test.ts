import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// `connection()` needs the request scope Next.js provides at runtime; stub it
// so the handler can be called directly. The real server is exercised by
// `next build` + a request against `next start`.
const connection = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("next/server", () => ({ connection }));

import { GET } from "@/app/api/health/route";

const routePath = path.resolve(__dirname, "../app/api/health/route.ts");

describe("GET /api/health", () => {
  it("returns 200 with the exact minimal envelope", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    expect(await response.json()).toEqual({ data: { status: "ok" }, error: null });
  });

  it("defers to request time instead of being prerendered at build", async () => {
    connection.mockClear();
    await GET();
    expect(connection).toHaveBeenCalledTimes(1);
  });

  it("is not cacheable", async () => {
    const response = await GET();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("does not depend on Supabase or environment configuration", () => {
    const source = readFileSync(routePath, "utf8");
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    expect(imports).toEqual(["next/server"]);
    expect(source).not.toMatch(/process\.env/);
  });
});
