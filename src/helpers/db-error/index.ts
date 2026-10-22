import 'server-only';
import { ApiError, badRequest, conflict, DataAccessError, forbidden, notFound, serviceUnavailable, unauthorized, validationError } from '@/helpers/api-error';
import type { ConstraintRule, DbErrorContext, DbErrorLike } from '@/types/supabase';

/**
 * TRANSLATES POSTGRESQL / POSTGREST ERRORS INTO SAFE API ERRORS.
 *
 * DECISIONS ARE MADE ON THE ERROR CODE AND, FOR CONSTRAINT VIOLATIONS, THE
 * CONSTRAINT NAME. THE RAW MESSAGE, DETAILS AND HINT ARE NEVER RETURNED TO
 * CLIENTS. UNKNOWN ERRORS BECOME A `DataAccessError` (→ GENERIC 500, LOGGED
 * WITH THE CODE ONLY); NETWORK FAILURES (NO CODE) BECOME 503.
 */

const VALIDATION_CODES = new Set([
  '23502', // not_null_violation
  '23514', // check_violation
  '22001', // string_data_right_truncation
  '22007', // invalid_datetime_format
  '22008', // datetime_field_overflow
  '22023', // invalid_parameter_value
]);

const MALFORMED_INPUT_CODES = new Set([
  '22P02', // invalid_text_representation (BAD uuid/enum LITERAL)
  '22003', // numeric_value_out_of_range
]);

const RETRYABLE_CODES = new Set([
  '40001', // serialization_failure
  '40P01', // deadlock_detected
  '57014', // query_canceled (STATEMENT TIMEOUT)
  '53300', // too_many_connections
]);

const AUTH_CODES = new Set(['PGRST301', 'PGRST302', 'PGRST303']);

/** EXTRACTS `constraint "name"` FROM A POSTGRES ERROR MESSAGE (SERVER-SIDE ONLY). */
export function constraintName(error: DbErrorLike): string | undefined {
  return /constraint "([^"]+)"/.exec(error.message ?? '')?.[1];
}

function fieldIssue(rule: ConstraintRule | undefined, fallbackMessage: string) {
  return [{ path: rule?.field ?? '', message: rule?.message ?? fallbackMessage }];
}

/** A 23503 ON DELETE/UPDATE OF A ROW OTHERS STILL REFERENCE (409), NOT A MISSING REFERENCE (422). */
function isStillReferenced(error: DbErrorLike): boolean {
  return /still referenced|update or delete on table/i.test(`${error.message} ${error.details}`);
}

export function mapDbError(
  error: DbErrorLike,
  operation: string,
  context: DbErrorContext = {},
): ApiError | DataAccessError {
  const code = error.code ?? '';
  const rule = context.constraints?.[constraintName(error) ?? ''];

  switch (code) {
    case '23505':
      return conflict(rule?.message ?? 'A record with these details already exists.');
    case '23P01': // EXCLUSION_VIOLATION, E.G. OVERLAPPING TIMETABLE PERIODS
      return conflict(rule?.message ?? 'This overlaps with an existing record.');
    case '55000': // OBJECT_NOT_IN_PREREQUISITE_STATE, E.G. A NOTICE THAT IS NO LONGER A DRAFT
      return conflict(rule?.message ?? 'The record is not in a state that allows this change.');
    case '23503':
      if (isStillReferenced(error)) {
        return conflict(rule?.message ?? 'This record is referenced by other records and cannot be changed or removed.');
      }
      return validationError(fieldIssue(rule, 'A referenced record does not exist.'));
    case '42501':
      return forbidden();
    case 'PGRST116':
    case 'P0002':
      return notFound(context.notFoundMessage);
    case 'SD001':
      return forbidden('You cannot change your own account status.');
    case 'SD002':
      return conflict('At least one active administrator must remain.');
    case 'SD003':
      return forbidden('Setup codes can only be issued for administrator accounts.');
    case 'SD004':
      return conflict('This account is deactivated. Reactivate it first.');
    case 'SD005':
      return forbidden('Sign-up can only be reset for teacher accounts.');
  }

  if (VALIDATION_CODES.has(code)) return validationError(fieldIssue(rule, 'A value is not allowed.'));
  if (MALFORMED_INPUT_CODES.has(code)) return badRequest('A value in the request is malformed.');
  if (AUTH_CODES.has(code)) return unauthorized();
  if (RETRYABLE_CODES.has(code)) return serviceUnavailable();

  // NO CODE: SUPABASE-JS NETWORK FAILURE (SUPABASE UNREACHABLE) → 503 VIA DataAccessError.
  return new DataAccessError(operation, code);
}
