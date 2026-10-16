import { describe, expect, it } from 'vitest';
import { ApiError } from '@/helpers/api-error';
import { assertSameOrigin } from '@/helpers/csrf';

function post(headers: Record<string, string>, url = 'http://localhost:3000/api/auth/logout') {
  return new Request(url, { method: 'POST', headers });
}

function rejection(request: Request): ApiError | null {
  try {
    assertSameOrigin(request);
    return null;
  } catch (error) {
    return error as ApiError;
  }
}

describe('assertSameOrigin', () => {
  it('allows a same-origin Origin header', () => {
    expect(rejection(post({ origin: 'http://localhost:3000' }))).toBeNull();
  });

  it('allows the client-facing host forwarded by the hosting proxy', () => {
    const request = post(
      { origin: 'https://school.example.com', 'x-forwarded-host': 'school.example.com' },
      'http://internal:3000/api/auth/logout',
    );
    expect(rejection(request)).toBeNull();
  });

  it.each([
    ['a different site', 'https://evil.example'],
    ['a different port', 'http://localhost:4000'],
    ['a look-alike subdomain', 'http://localhost:3000.evil.example'],
    ["the opaque 'null' origin", 'null'],
    ['a malformed origin', 'not a url'],
  ])('rejects %s with 403 CSRF_REJECTED', (_label, origin) => {
    const error = rejection(post({ origin }));
    expect(error?.status).toBe(403);
    expect(error?.code).toBe('CSRF_REJECTED');
  });

  it('falls back to Sec-Fetch-Site when Origin is absent', () => {
    expect(rejection(post({ 'sec-fetch-site': 'same-origin' }))).toBeNull();
    expect(rejection(post({ 'sec-fetch-site': 'none' }))).toBeNull();
    expect(rejection(post({ 'sec-fetch-site': 'cross-site' }))?.status).toBe(403);
    expect(rejection(post({ 'sec-fetch-site': 'same-site' }))?.status).toBe(403);
  });

  it('rejects requests carrying neither header', () => {
    expect(rejection(post({}))?.code).toBe('CSRF_REJECTED');
  });
});
