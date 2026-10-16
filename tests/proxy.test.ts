import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { updateSession } from '@/helpers/supabase-proxy';
import { config } from '@/proxy';

// Offline behaviour of the session-refresh proxy. Refreshing a real session
// is covered by tests/integration/auth.test.ts.

const fetchMock = vi.fn();

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function configure() {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key');
  vi.stubGlobal('fetch', fetchMock);
}

describe('updateSession', () => {
  it('passes anonymous requests through without any network call', async () => {
    configure();
    const response = await updateSession(new NextRequest('http://localhost/student', { headers: { cookie: 'theme=dark' } }));
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.cookies.getAll()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes requests through when Supabase is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubGlobal('fetch', fetchMock);
    const request = new NextRequest('http://localhost/', { headers: { cookie: 'sb-example-auth-token=base64-x' } });
    const response = await updateSession(request);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not fail the request when the session cookie is garbage', async () => {
    configure();
    const request = new NextRequest('http://localhost/', { headers: { cookie: 'sb-example-auth-token=base64-garbage' } });
    const response = await updateSession(request);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });
});

describe('proxy matcher', () => {
  const matcher = new RegExp(`^${config.matcher[0]}$`);

  it.each(['/', '/student', '/api/auth/me', '/teachers/home'])('runs on %s', (path) => {
    expect(matcher.test(path)).toBe(true);
  });

  it.each(['/_next/static/chunk.js', '/_next/image', '/favicon.ico', '/logo.png', '/file.svg'])(
    'skips static asset %s',
    (path) => {
      expect(matcher.test(path)).toBe(false);
    },
  );
});
