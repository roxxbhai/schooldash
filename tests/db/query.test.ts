import { describe, expect, it } from 'vitest';
import { ApiError } from '@/helpers/api-error';
import { many, maybeOne, one, page, pageMeta, rpcResult } from '@/helpers/db-query';
import { toPagination } from '@/helpers/request-validation';

const PAGE_2 = toPagination({ page: 2, limit: 20 });
const ok = <T>(data: T, count?: number) => Promise.resolve({ data, error: null, count });
const fail = (code: string) => Promise.resolve({ data: null, error: { code, message: 'x' }, count: null });

describe('query helpers', () => {
  it('return data on success', async () => {
    expect(await many('op', ok([{ id: 1 }]))).toEqual([{ id: 1 }]);
    expect(await maybeOne('op', ok(null))).toBeNull();
    expect(await one('op', ok({ id: 1 }))).toEqual({ id: 1 });
    expect(await rpcResult('op', ok(true))).toBe(true);
  });

  it('throw mapped errors instead of returning empty data', async () => {
    await expect(many('op', fail('42501'))).rejects.toMatchObject({ status: 403 });
    await expect(maybeOne('op', fail('23505'))).rejects.toMatchObject({ status: 409 });
    await expect(rpcResult('op', fail('P0002'))).rejects.toMatchObject({ status: 404 });
    await expect(page('op', fail('XX000'), PAGE_2)).rejects.not.toBeInstanceOf(ApiError);
  });

  it('one() returns 404 when the row is missing or hidden by RLS', async () => {
    await expect(one('op', ok(null), { notFoundMessage: 'Class not found.' })).rejects.toMatchObject({
      status: 404,
      message: 'Class not found.',
    });
  });

  it('page() returns items with pagination built from the exact total, and an empty page past the end', async () => {
    const meta = { page: 2, limit: 20, total: 41, totalPages: 3 };
    expect(await page('op', ok([{ id: 1 }], 41), PAGE_2)).toEqual({ items: [{ id: 1 }], pagination: meta });
    expect(
      await page('op', Promise.resolve({ data: null, error: { code: 'PGRST103', message: '' }, count: 41 }), PAGE_2),
    ).toEqual({ items: [], pagination: meta });
  });

  it('pageMeta() computes totalPages', () => {
    expect(pageMeta(toPagination({ page: 2, limit: 20 }), 41)).toEqual({ page: 2, limit: 20, total: 41, totalPages: 3 });
    expect(pageMeta(toPagination({ page: 1, limit: 20 }), 0)).toEqual({ page: 1, limit: 20, total: 0, totalPages: 0 });
  });
});
