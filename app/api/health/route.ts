import { connection } from "next/server";

/**
 * Liveness check: confirms the Next.js server is handling requests.
 * Deliberately does not touch Supabase or expose any configuration.
 */
export async function GET() {
  // Opt out of build-time prerendering so the response reflects a live server.
  await connection();

  return Response.json(
    { data: { status: "ok" }, error: null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
