import { connection } from 'next/server';

/**
 * LIVENESS CHECK: CONFIRMS THE Next.js SERVER IS HANDLING REQUESTS.
 * DELIBERATELY DOES NOT TOUCH SUPABASE OR EXPOSE ANY CONFIGURATION.
 */
export async function GET() {
  // OPT OUT OF BUILD-TIME PRERENDERING SO THE RESPONSE REFLECTS A LIVE SERVER.
  await connection();

  return Response.json(
    { data: { status: 'ok' }, error: null },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
