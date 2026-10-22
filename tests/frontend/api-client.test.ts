import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, countRecords, fetchAllPages } from '@/functions/api-client';
import { buildApiUrl, toFieldErrors, toSearchTerm, toUserMessage } from '@/helpers/api-client';

/**
 * THE BROWSER API CLIENT: ONE { success, message, data } RESULT FOR EVERY
 * OUTCOME, PLAIN-LANGUAGE MESSAGES, AND A SIGN-IN REDIRECT WHEN THE SESSION ENDS.
 * fetch AND window.location ARE STUBBED; NOTHING LEAVES THE PROCESS.
 */

const fetchMock = vi.fn();
const locationReplace = vi.fn();

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('window', { location: { replace: locationReplace, pathname: '/admin/classes' } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  locationReplace.mockReset();
});

describe('apiRequest', () => {
  it('returns the data of a successful envelope', async () => {
    respond(200, { data: { id: 'x' }, error: null });
    await expect(apiRequest('/api/subjects/x')).resolves.toEqual({ success: true, message: 'Operation successful', data: { id: 'x' } });
  });

  it('sends JSON bodies same-origin, uncached, and drops empty query values', async () => {
    respond(201, { data: {}, error: null });
    await apiRequest('/api/subjects', { method: 'POST', body: { code: 'MATH' }, query: { page: 2, search: '', classId: undefined, isActive: false } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/subjects?page=2&isActive=false');
    expect(init).toMatchObject({ method: 'POST', body: '{"code":"MATH"}', credentials: 'same-origin', cache: 'no-store' });
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('keeps specific server messages and the field details of a failure', async () => {
    respond(409, { data: null, error: { code: 'CONFLICT', message: 'A subject with this code already exists.' } });
    await expect(apiRequest('/api/subjects')).resolves.toEqual({
      success: false,
      message: 'A subject with this code already exists.',
      data: { status: 409, code: 'CONFLICT', details: [] },
    });
  });

  it('replaces generic or technical messages with plain language', async () => {
    respond(429, { data: null, error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } });
    expect((await apiRequest('/api/auth/admin/login', { isSessionRequired: false })).message).toBe('Too many attempts. Please wait a minute and try again.');
    respond(503, { data: null, error: { code: 'SERVICE_UNAVAILABLE', message: 'A required service is temporarily unavailable.' } });
    expect((await apiRequest('/api/x')).message).toBe('The school portal is temporarily unavailable. Please try again in a few minutes.');
  });

  it("keeps each sign-in form's own credential message", async () => {
    respond(401, { data: null, error: { code: 'INVALID_CREDENTIALS', message: 'The phone number or password is incorrect.' } });
    expect((await apiRequest('/api/auth/teacher/login', { isSessionRequired: false })).message).toBe('The phone number or password is incorrect.');
  });

  it("sends an expired session to its portal's sign-in, but not for sign-in itself", async () => {
    respond(401, { data: null, error: { code: 'UNAUTHORIZED', message: 'Authentication is required.' } });
    await apiRequest('/api/classes');
    expect(locationReplace).toHaveBeenCalledWith('/admin/sign-in?reason=session-expired');

    locationReplace.mockReset();
    respond(401, { data: null, error: { code: 'UNAUTHORIZED', message: 'Authentication is required.' } });
    await apiRequest('/api/auth/admin/login', { method: 'POST', body: {}, isSessionRequired: false });
    expect(locationReplace).not.toHaveBeenCalled();
  });

  it.each([
    ['an HTML error page', '<html>Bad gateway</html>'],
    ['an empty body', ''],
    ['JSON without the envelope', { ok: true }],
  ])('treats %s as an invalid response, never as success', async (_label, body) => {
    respond(502, body);
    await expect(apiRequest('/api/classes')).resolves.toMatchObject({ success: false, data: { status: 502, code: 'INVALID_RESPONSE' } });
  });

  it('reports a network failure without throwing', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(apiRequest('/api/classes')).resolves.toEqual({
      success: false,
      message: "We couldn't reach the school portal. Check your internet connection and try again.",
      data: { status: 0, code: 'NETWORK_ERROR', details: [] },
    });
  });

  it('reports an aborted (stale) request as ABORTED', async () => {
    fetchMock.mockRejectedValueOnce(new DOMException('The operation was aborted.', 'AbortError'));
    await expect(apiRequest('/api/classes')).resolves.toMatchObject({ success: false, data: { code: 'ABORTED' } });
  });
});

describe('fetchAllPages and countRecords', () => {
  it('follows pagination, 100 rows at a time', async () => {
    respond(200, { data: { items: [1, 2], pagination: { page: 1, limit: 100, total: 3, totalPages: 2 } }, error: null });
    respond(200, { data: { items: [3], pagination: { page: 2, limit: 100, total: 3, totalPages: 2 } }, error: null });
    await expect(fetchAllPages('/api/classes', { academicYearId: 'y' })).resolves.toMatchObject({ success: true, data: [1, 2, 3] });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/classes?academicYearId=y&page=1&limit=100', '/api/classes?academicYearId=y&page=2&limit=100']);
  });

  it('fails as a whole if any page fails, so a list is never silently partial', async () => {
    respond(200, { data: { items: [1], pagination: { page: 1, limit: 100, total: 2, totalPages: 2 } }, error: null });
    respond(503, { data: null, error: { code: 'SERVICE_UNAVAILABLE', message: 'x' } });
    await expect(fetchAllPages('/api/classes')).resolves.toMatchObject({ success: false, data: { code: 'SERVICE_UNAVAILABLE' } });
  });

  it('counts with a single limit=1 request', async () => {
    respond(200, { data: { items: [{}], pagination: { page: 1, limit: 1, total: 41, totalPages: 41 } }, error: null });
    await expect(countRecords('/api/students', { isActive: true })).resolves.toMatchObject({ success: true, data: 41 });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/students?isActive=true&page=1&limit=1');
  });
});

describe('api-client helpers', () => {
  it('builds URLs without empty parameters', () => {
    expect(buildApiUrl('/api/x')).toBe('/api/x');
    expect(buildApiUrl('/api/x', { a: null, b: '' })).toBe('/api/x');
    expect(buildApiUrl('/api/x', { search: 'a b', page: 1 })).toBe('/api/x?search=a+b&page=1');
  });

  it('keeps the first message per field', () => {
    expect(
      toFieldErrors({ status: 422, code: 'VALIDATION_ERROR', details: [{ path: 'code', message: 'first' }, { path: 'code', message: 'second' }, { path: 'name', message: 'n' }] }),
    ).toEqual({ code: 'first', name: 'n' });
  });

  it('falls back to a safe message when the server sent none', () => {
    expect(toUserMessage('NOT_FOUND', undefined)).toBe('Something went wrong on our side. Please try again.');
    expect(toUserMessage('NOT_FOUND', 'Class not found.')).toBe('Class not found.');
  });

  it('reduces search input to the characters the API accepts', () => {
    expect(toSearchTerm('  Asha (10-A), 2026* ')).toBe('Asha 10-A 2026');
    expect(toSearchTerm('राम कुमार')).toBe('राम कुमार');
    expect(toSearchTerm('x'.repeat(80))).toHaveLength(50);
  });
});
