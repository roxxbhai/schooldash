import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DEFAULT_LIMIT, MAX_LIMIT } from '@/constants/api';
import { ApiError } from '@/helpers/api-error';
import { assertUuid, getPagination, paginationShape, parseJsonBody, parseParams, parseQuery, toPagination, uuidSchema } from '@/helpers/request-validation';

const UUID = '3f2b8c1e-9d4a-4f6b-8e2c-1a7d5b9c0e3f';

function jsonRequest(body: string, contentType = 'application/json'): Request {
  return new Request('http://localhost/api/test', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  });
}

async function captureApiError(promise: Promise<unknown> | (() => unknown)): Promise<ApiError> {
  try {
    await (typeof promise === 'function' ? promise() : promise);
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error('Expected an ApiError');
}

const bodySchema = z.strictObject({ name: z.string().min(1), age: z.number().int() });

describe('parseJsonBody', () => {
  it('returns validated data', async () => {
    await expect(
      parseJsonBody(jsonRequest('{"name":"Asha","age":12}'), bodySchema),
    ).resolves.toEqual({ name: 'Asha', age: 12 });
  });

  it('accepts JSON content types with parameters or +json suffixes', async () => {
    for (const type of ['application/json; charset=utf-8', 'application/merge-patch+json']) {
      await expect(
        parseJsonBody(jsonRequest('{"name":"A","age":1}', type), bodySchema),
      ).resolves.toBeTruthy();
    }
  });

  it('rejects non-JSON content types with 400', async () => {
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', '']) {
      const error = await captureApiError(parseJsonBody(jsonRequest('{}', type), bodySchema));
      expect(error.status).toBe(400);
      expect(error.code).toBe('BAD_REQUEST');
    }
  });

  it('rejects malformed JSON with 400 INVALID_JSON', async () => {
    for (const body of ['{not json', '', '{"name": "A",}']) {
      const error = await captureApiError(parseJsonBody(jsonRequest(body), bodySchema));
      expect(error.status).toBe(400);
      expect(error.code).toBe('INVALID_JSON');
      expect(error.message).toBe('The request body is not valid JSON.');
    }
  });

  it('rejects valid JSON that fails the schema with 422 and per-field issues', async () => {
    const error = await captureApiError(
      parseJsonBody(jsonRequest('{"name":"","age":"twelve","extra":1}'), bodySchema),
    );
    expect(error.status).toBe(422);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details?.map((d) => d.path).sort()).toEqual(['', 'age', 'name']);
  });

  it('never echoes submitted values or stack traces in validation details', async () => {
    const error = await captureApiError(
      parseJsonBody(jsonRequest('{"name":"s3cr3t-value","age":"s3cr3t-age"}'), z.strictObject({
        name: z.email(),
        age: z.number(),
      })),
    );
    const serialized = JSON.stringify({ message: error.message, details: error.details });
    expect(serialized).not.toContain('s3cr3t');
    expect(serialized).not.toMatch(/\bat \S+:\d+/);
    for (const issue of error.details ?? []) {
      expect(Object.keys(issue).sort()).toEqual(['message', 'path']);
    }
  });
});

describe('parseParams', () => {
  const schema = z.object({ id: uuidSchema });

  it('accepts the params promise Next.js passes to Route Handlers', async () => {
    await expect(parseParams(Promise.resolve({ id: UUID }), schema)).resolves.toEqual({ id: UUID });
  });

  it('rejects invalid params with 400 VALIDATION_ERROR', async () => {
    const error = await captureApiError(parseParams({ id: '123' }, schema));
    expect(error.status).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual([{ path: 'id', message: 'Must be a valid UUID.' }]);
  });
});

describe('parseQuery', () => {
  it('validates query parameters with 400 on failure', async () => {
    const schema = z.object({ status: z.enum(['draft', 'published']) });
    expect(parseQuery(new URLSearchParams('status=draft'), schema)).toEqual({ status: 'draft' });

    const error = await captureApiError(() =>
      parseQuery(new URLSearchParams('status=deleted'), schema),
    );
    expect(error.status).toBe(400);
  });

  it('represents repeated keys as arrays so single-value schemas reject them', async () => {
    const schema = z.object({ tag: z.string() });
    const error = await captureApiError(() => parseQuery(new URLSearchParams('tag=a&tag=b'), schema));
    expect(error.status).toBe(400);
    expect(parseQuery(new URLSearchParams('tag=a&tag=b'), z.object({ tag: z.array(z.string()) })))
      .toEqual({ tag: ['a', 'b'] });
  });
});

describe('UUID validation', () => {
  it('accepts UUIDs and rejects anything else', () => {
    expect(uuidSchema.safeParse(UUID).success).toBe(true);
    for (const bad of ['', 'abc', `${UUID}x`, '00000000-0000-0000-0000-00000000000g', 42]) {
      expect(uuidSchema.safeParse(bad).success, String(bad)).toBe(false);
    }
  });

  it('assertUuid throws a 400 naming the field', async () => {
    expect(assertUuid(UUID, 'studentId')).toBe(UUID);
    const error = await captureApiError(() => assertUuid('nope', 'studentId'));
    expect(error.status).toBe(400);
    expect(error.details).toEqual([{ path: 'studentId', message: 'Must be a valid UUID.' }]);
  });
});

describe('pagination', () => {
  const paginate = (query: string) => getPagination(new URLSearchParams(query));

  it('defaults to page 1, limit 20', () => {
    expect(paginate('')).toEqual({ page: 1, limit: 20, offset: 0, from: 0, to: 19 });
    expect(DEFAULT_LIMIT).toBe(20);
  });

  it('computes offset as (page - 1) * limit', () => {
    expect(paginate('page=3&limit=25')).toEqual({
      page: 3,
      limit: 25,
      offset: 50,
      from: 50,
      to: 74,
    });
    expect(toPagination({ page: 7, limit: 10 }).offset).toBe(60);
  });

  it('allows the maximum limit of 100', () => {
    expect(MAX_LIMIT).toBe(100);
    expect(paginate('limit=100').limit).toBe(100);
  });

  it.each([
    ['page=0', 'page'],
    ['page=-1', 'page'],
    ['page=1.5', 'page'],
    ['page=abc', 'page'],
    ['page=', 'page'],
    ['page=1e3', 'page'],
    ['limit=0', 'limit'],
    ['limit=101', 'limit'],
    ['limit=99999', 'limit'],
    ['limit=ten', 'limit'],
    ['page=1&page=2', 'page'],
    [`page=${'9'.repeat(20)}`, 'page'],
  ])('rejects %s with a 400 validation error', async (query, field) => {
    const error = await captureApiError(() => paginate(query));
    expect(error.status).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details?.[0]?.path).toBe(field);
  });

  it('ignores unrelated query parameters', () => {
    expect(paginate('page=2&search=maths').page).toBe(2);
  });

  it('composes into larger query schemas', () => {
    const schema = z.object({ ...paginationShape, classId: uuidSchema });
    expect(parseQuery(new URLSearchParams(`classId=${UUID}`), schema)).toEqual({
      page: 1,
      limit: 20,
      classId: UUID,
    });
  });
});
