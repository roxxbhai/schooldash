import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EnvValidationError } from '@/configs';
import { createSupabaseAdminClient } from '@/helpers/supabase-admin';
import { createSupabaseServerClient } from '@/helpers/supabase-server';

// No network or Supabase project is involved: the SDK factories and Next's
// cookie store are replaced with spies.
const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(() => ({ kind: 'server-client' })),
  createClient: vi.fn(() => ({ kind: 'admin-client' })),
  cookieStore: {
    getAll: vi.fn(() => [{ name: 'sb-session', value: 'cookie-value' }]),
    set: vi.fn(),
  },
  cookies: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({ createServerClient: mocks.createServerClient }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('next/headers', () => ({ cookies: mocks.cookies }));


const URL = 'https://example.supabase.co';
const ANON = 'test-anon-key';
const SERVICE = 'test-service-key';

type CookieMethods = {
  getAll: () => unknown;
  setAll: (cookies: { name: string; value: string; options: object }[]) => void;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookies.mockResolvedValue(mocks.cookieStore);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
  vi.stubEnv('SUPABASE_SECRET_KEY', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createSupabaseServerClient', () => {
  it('fails before reading cookies or creating a client when unconfigured', async () => {
    await expect(createSupabaseServerClient()).rejects.toBeInstanceOf(
      EnvValidationError,
    );
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it('uses the anon key (never the service-role key) with request cookies', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', URL);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', ANON);
    vi.stubEnv('SUPABASE_SECRET_KEY', SERVICE);

    await createSupabaseServerClient();

    expect(mocks.createServerClient).toHaveBeenCalledTimes(1);
    const [url, key, options] = mocks.createServerClient.mock.calls[0] as unknown as [
      string,
      string,
      { cookies: CookieMethods },
    ];
    expect(url).toBe(URL);
    expect(key).toBe(ANON);
    expect(JSON.stringify(mocks.createServerClient.mock.calls)).not.toContain(SERVICE);

    expect(options.cookies.getAll()).toEqual([
      { name: 'sb-session', value: 'cookie-value' },
    ]);

    options.cookies.setAll([{ name: 'a', value: '1', options: { path: '/' } }]);
    expect(mocks.cookieStore.set).toHaveBeenCalledWith('a', '1', { path: '/' });
  });

  it('tolerates cookie writes being rejected in Server Components', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', URL);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', ANON);
    mocks.cookieStore.set.mockImplementationOnce(() => {
      throw new Error('Cookies can only be modified in a Server Action or Route Handler');
    });

    await createSupabaseServerClient();
    const options = (mocks.createServerClient.mock.calls[0] as unknown as [
      string,
      string,
      { cookies: CookieMethods },
    ])[2];

    expect(() =>
      options.cookies.setAll([{ name: 'a', value: '1', options: {} }]),
    ).not.toThrow();
  });
});

describe('createSupabaseAdminClient', () => {
  it('fails without creating a client when unconfigured', () => {
    expect(() => createSupabaseAdminClient()).toThrow(EnvValidationError);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('fails when only the public config is present', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', URL);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', ANON);

    expect(() => createSupabaseAdminClient()).toThrow(/SUPABASE_SECRET_KEY/);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('uses the service-role key without persisting any session', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', URL);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', ANON);
    vi.stubEnv('SUPABASE_SECRET_KEY', SERVICE);

    createSupabaseAdminClient();

    expect(mocks.createClient).toHaveBeenCalledWith(URL, SERVICE, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  });
});
