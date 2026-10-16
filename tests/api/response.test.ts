import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EnvValidationError } from '@/configs';
import { DataAccessError } from '@/helpers/api-error';
import { ApiError } from '@/helpers/api-error';
import { apiRoute, created, errorResponse, ok, toErrorResponse } from '@/helpers/api-response';

const connection = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('next/server', () => ({ connection }));

import * as errors from '@/helpers/api-error';

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

const loggedText = () => consoleError.mock.calls.flat().map(String).join('\n');

describe('success responses', () => {
  it('ok() wraps data in the { data, error: null } envelope with 200', async () => {
    const response = ok({ hello: 'world' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { hello: 'world' }, error: null });
  });

  it('created() uses 201', async () => {
    const response = created({ id: 'x' });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ data: { id: 'x' }, error: null });
  });

  it('is never cacheable', () => {
    const response = ok(null);
    expect(response.headers.get('cache-control')).toBe(
      'private, no-cache, no-store, must-revalidate, max-age=0',
    );
    expect(response.headers.get('content-type')).toMatch(/application\/json/);
  });
});

describe('error responses', () => {
  it('use the { data: null, error: { code, message } } envelope', async () => {
    const response = errorResponse(errors.unauthorized());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      data: null,
      error: { code: 'UNAUTHORIZED', message: 'Authentication is required.' },
    });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('include validation details only when present', async () => {
    const response = errorResponse(
      errors.validationError([{ path: 'email', message: 'Enter a valid email address.' }]),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The request failed validation.',
        details: [{ path: 'email', message: 'Enter a valid email address.' }],
      },
    });
  });

  it.each([
    [errors.badRequest(), 400, 'BAD_REQUEST'],
    [errors.invalidJson(), 400, 'INVALID_JSON'],
    [errors.validationError([], 400), 400, 'VALIDATION_ERROR'],
    [errors.validationError([]), 422, 'VALIDATION_ERROR'],
    [errors.unauthorized(), 401, 'UNAUTHORIZED'],
    [errors.invalidCredentials(), 401, 'INVALID_CREDENTIALS'],
    [errors.forbidden(), 403, 'FORBIDDEN'],
    [errors.accountNotProvisioned(), 403, 'ACCOUNT_NOT_PROVISIONED'],
    [errors.accountInactive(), 403, 'ACCOUNT_INACTIVE'],
    [errors.csrfRejected(), 403, 'CSRF_REJECTED'],
    [errors.notFound(), 404, 'NOT_FOUND'],
    [errors.conflict(), 409, 'CONFLICT'],
    [errors.rateLimited(), 429, 'RATE_LIMITED'],
    [errors.internalError(), 500, 'INTERNAL_ERROR'],
    [errors.serviceUnavailable(), 503, 'SERVICE_UNAVAILABLE'],
  ] as const)('%o → %i %s', async (error, status, code) => {
    const response = errorResponse(error);
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
  });
});

describe('toErrorResponse', () => {
  it('passes known ApiErrors through unchanged', async () => {
    const response = toErrorResponse(errors.forbidden());
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('FORBIDDEN');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('hides unexpected errors behind a generic 500', async () => {
    const internal = new Error('relation "users" does not exist at /srv/app/lib/db.ts:42');
    const response = toErrorResponse(internal);
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toEqual({
      data: null,
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
    });
    expect(text).not.toContain('relation');
    expect(text).not.toContain('/srv/app');
    expect(text).not.toContain('at ');
  });

  it('logs only metadata for unexpected errors, never the message', () => {
    const leaky = Object.assign(new Error('password=hunter2 token=abc.def'), { code: 'XX000' });
    toErrorResponse(leaky);

    const logged = loggedText();
    expect(logged).toContain('XX000');
    expect(logged).not.toContain('hunter2');
    expect(logged).not.toContain('abc.def');
  });

  it('maps missing Supabase configuration to 503 without revealing values', async () => {
    const response = toErrorResponse(new EnvValidationError(['NEXT_PUBLIC_SUPABASE_URL']));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(JSON.stringify(body)).not.toContain('SUPABASE');
  });

  it('maps unreachable-database errors to 503 and query bugs to 500', () => {
    expect(toErrorResponse(new DataAccessError('users.find', '')).status).toBe(503);
    expect(toErrorResponse(new DataAccessError('users.find', '42703')).status).toBe(500);
  });

  it('does not expose raw Supabase/PostgREST error objects', async () => {
    const postgrest = { message: 'permission denied for table users', code: '42501', hint: 'x' };
    const text = await toErrorResponse(postgrest).text();
    expect(text).not.toContain('permission denied');
    expect(text).not.toContain('42501');
  });
});

describe('apiRoute', () => {
  it('awaits connection() so handlers always run at request time', async () => {
    connection.mockClear();
    const handler = apiRoute(async () => ok('done'));
    await handler();
    expect(connection).toHaveBeenCalledTimes(1);
  });

  it('converts thrown errors into safe responses', async () => {
    const handler = apiRoute(async () => {
      throw errors.notFound();
    });
    const response = await handler();
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('NOT_FOUND');
  });

  it('converts unexpected throws into a 500', async () => {
    const handler = apiRoute(async () => {
      throw new TypeError('Cannot read properties of undefined');
    });
    const response = await handler();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('Cannot read');
  });

  it('passes handler arguments through', async () => {
    const handler = apiRoute(async (request: Request) => ok(new URL(request.url).pathname));
    const response = await handler(new Request('http://localhost/api/x'));
    expect(await response.json()).toEqual({ data: '/api/x', error: null });
  });
});

describe('ApiError', () => {
  it('is an Error carrying status and code', () => {
    const error = new ApiError(409, 'CONFLICT', 'Duplicate.');
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(409);
    expect(error.code).toBe('CONFLICT');
  });
});
