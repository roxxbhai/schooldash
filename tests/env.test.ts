import { describe, expect, it } from 'vitest';
import { EnvValidationError, getSupabaseAdminEnv, getSupabaseEnv } from '@/configs';

const validPublic = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-anon-key',
};

function captureError(fn: () => unknown): EnvValidationError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(EnvValidationError);
    return error as EnvValidationError;
  }
  throw new Error('Expected EnvValidationError to be thrown');
}

describe('getSupabaseEnv', () => {
  it('reports every missing variable when none are set', () => {
    const error = captureError(() => getSupabaseEnv({}));
    expect([...error.variables].sort()).toEqual([
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'NEXT_PUBLIC_SUPABASE_URL',
    ]);
  });

  it('treats empty and whitespace-only values (as in .env.example) as missing', () => {
    const error = captureError(() =>
      getSupabaseEnv({
        NEXT_PUBLIC_SUPABASE_URL: '',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '   ',
      }),
    );
    expect([...error.variables].sort()).toEqual([
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'NEXT_PUBLIC_SUPABASE_URL',
    ]);
  });

  it('rejects a malformed URL', () => {
    const error = captureError(() =>
      getSupabaseEnv({ ...validPublic, NEXT_PUBLIC_SUPABASE_URL: 'not a url' }),
    );
    expect(error.variables).toEqual(['NEXT_PUBLIC_SUPABASE_URL']);
  });

  it('does not require the service-role key', () => {
    expect(getSupabaseEnv(validPublic)).toEqual(validPublic);
  });

  it('never includes variable values in the error message', () => {
    const error = captureError(() =>
      getSupabaseEnv({
        NEXT_PUBLIC_SUPABASE_URL: 'leaky-value-123',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
      }),
    );
    expect(error.message).not.toContain('leaky-value-123');
    expect(error.message).toContain('NEXT_PUBLIC_SUPABASE_URL');
  });

  it('reads process.env by default', () => {
    const saved = { ...process.env };
    try {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      expect(() => getSupabaseEnv()).toThrow(EnvValidationError);
    } finally {
      process.env = saved;
    }
  });
});

describe('getSupabaseAdminEnv', () => {
  it('requires the service-role key in addition to the public config', () => {
    const error = captureError(() => getSupabaseAdminEnv(validPublic));
    expect(error.variables).toEqual(['SUPABASE_SECRET_KEY']);
  });

  it('reports all three variables when nothing is configured', () => {
    const error = captureError(() => getSupabaseAdminEnv({}));
    expect([...error.variables].sort()).toEqual([
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SECRET_KEY',
    ]);
  });

  it('returns the validated config when complete', () => {
    const source = { ...validPublic, SUPABASE_SECRET_KEY: 'test-service-key' };
    expect(getSupabaseAdminEnv(source)).toEqual(source);
  });
});
