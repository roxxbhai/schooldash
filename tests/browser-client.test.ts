import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseBrowserClient } from '@/helpers/supabase-browser';

const createBrowserClient = vi.hoisted(() => vi.fn(() => ({ kind: 'browser' })));
vi.mock('@supabase/ssr', () => ({ createBrowserClient }));


afterEach(() => {
  vi.unstubAllEnvs();
  createBrowserClient.mockClear();
});

describe('createSupabaseBrowserClient', () => {
  it('uses only the URL and publishable key', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'test-secret-must-not-be-used');

    createSupabaseBrowserClient();
    expect(createBrowserClient).toHaveBeenCalledWith('https://example.supabase.co', 'test-publishable-key');
    expect(JSON.stringify(createBrowserClient.mock.calls)).not.toContain('test-secret');
  });

  it('throws a clear error when not configured', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    expect(() => createSupabaseBrowserClient()).toThrow(/not configured/);
    expect(createBrowserClient).not.toHaveBeenCalled();
  });
});
