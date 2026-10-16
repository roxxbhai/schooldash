import { describe, expect, it } from 'vitest';
import { DataAccessError } from '@/helpers/api-error';
import { ApiError } from '@/helpers/api-error';
import { toErrorResponse } from '@/helpers/api-response';
import { constraintName, mapDbError } from '@/helpers/db-error';

const map = (code: string, message = '', details: string | null = null, context = {}) =>
  mapDbError({ code, message, details, hint: 'internal hint' }, 'test.op', context);

function asApi(error: unknown): ApiError {
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

describe('mapDbError', () => {
  it.each([
    ['23505', 409, 'CONFLICT'],
    ['23P01', 409, 'CONFLICT'],
    ['55000', 409, 'CONFLICT'],
    ['23502', 422, 'VALIDATION_ERROR'],
    ['23514', 422, 'VALIDATION_ERROR'],
    ['22001', 422, 'VALIDATION_ERROR'],
    ['22007', 422, 'VALIDATION_ERROR'],
    ['22008', 422, 'VALIDATION_ERROR'],
    ['22023', 422, 'VALIDATION_ERROR'],
    ['22P02', 400, 'BAD_REQUEST'],
    ['22003', 400, 'BAD_REQUEST'],
    ['42501', 403, 'FORBIDDEN'],
    ['PGRST116', 404, 'NOT_FOUND'],
    ['P0002', 404, 'NOT_FOUND'],
    ['PGRST301', 401, 'UNAUTHORIZED'],
    ['PGRST302', 401, 'UNAUTHORIZED'],
    ['SD001', 403, 'FORBIDDEN'],
    ['SD002', 409, 'CONFLICT'],
    ['40001', 503, 'SERVICE_UNAVAILABLE'],
    ['40P01', 503, 'SERVICE_UNAVAILABLE'],
    ['57014', 503, 'SERVICE_UNAVAILABLE'],
  ])('maps %s to %i %s', (code, status, apiCode) => {
    const error = asApi(map(code));
    expect(error.status).toBe(status);
    expect(error.code).toBe(apiCode);
  });

  it('distinguishes a missing reference (422) from a row still referenced (409)', () => {
    const missing = asApi(map(
      '23503',
      'insert or update on table "classes" violates foreign key constraint "classes_classTeacherId_fkey"',
      'Key ("classTeacherId")=(x) is not present in table "teachers".',
    ));
    expect([missing.status, missing.code]).toEqual([422, 'VALIDATION_ERROR']);

    const referenced = asApi(map(
      '23503',
      'update or delete on table "teacherAssignments" violates foreign key constraint "timetableEntriesAssignmentFkey" on table "timetableEntries"',
      'Key (id)=(x) is still referenced from table "timetableEntries".',
    ));
    expect([referenced.status, referenced.code]).toEqual([409, 'CONFLICT']);
  });

  it('uses constraint-specific messages and fields when provided', () => {
    const context = {
      constraints: {
        subjects_code_key: { message: 'A subject with this code already exists.', field: 'code' },
        classes_classTeacherId_fkey: { message: 'Class teacher not found.', field: 'classTeacherId' },
      },
    };
    expect(asApi(map('23505', 'duplicate key value violates unique constraint "subjects_code_key"', null, context)).message)
      .toBe('A subject with this code already exists.');
    expect(asApi(map('23503', 'violates foreign key constraint "classes_classTeacherId_fkey"', 'is not present', context)).details)
      .toEqual([{ path: 'classTeacherId', message: 'Class teacher not found.' }]);
  });

  it('uses a custom not-found message', () => {
    expect(asApi(map('PGRST116', '', null, { notFoundMessage: 'Subject not found.' })).message).toBe('Subject not found.');
  });

  it('returns DataAccessError for unknown codes (500) and network failures (503)', async () => {
    const unknown = map('XX000', 'internal error');
    expect(unknown).toBeInstanceOf(DataAccessError);
    expect(toErrorResponse(unknown).status).toBe(500);

    const network = mapDbError({ code: '', message: 'TypeError: fetch failed' }, 'test.op');
    expect(network).toBeInstanceOf(DataAccessError);
    expect(toErrorResponse(network).status).toBe(503);
  });

  it('never exposes the raw database message, details, hint or constraint name', async () => {
    const raw = {
      message: 'duplicate key value violates unique constraint "students_admissionNumber_key"',
      details: 'Key (admissionNumber)=(ADM-SECRET-42) already exists.',
    };
    for (const code of ['23505', '23503', '23514', '22P02', '42501', 'XX000']) {
      const body = await toErrorResponse(mapDbError({ code, ...raw, hint: 'hint' }, 'op')).text();
      expect(body, code).not.toContain('ADM-SECRET-42');
      expect(body, code).not.toContain('students_admissionNumber_key');
      expect(body, code).not.toContain('duplicate key');
      expect(body, code).not.toContain('hint');
    }
  });
});

describe('constraintName', () => {
  it('extracts the constraint from a Postgres message', () => {
    expect(constraintName({ message: 'violates check constraint "academicYearsDateRange"' })).toBe('academicYearsDateRange');
    expect(constraintName({ message: 'no constraint here' })).toBeUndefined();
  });
});
