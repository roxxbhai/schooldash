import "server-only";
import {
  ApiError,
  badRequest,
  conflict,
  forbidden,
  notFound,
  serviceUnavailable,
  unauthorized,
  validationError,
} from "@/lib/api/errors";
import { DataAccessError } from "@/lib/auth/repository";

/**
 * Translates PostgreSQL / PostgREST errors into safe API errors.
 *
 * Decisions are made on the error CODE and, for constraint violations, the
 * constraint NAME. The raw message, details and hint are never returned to
 * clients. Unknown errors become a `DataAccessError` (→ generic 500, logged
 * with code only); network failures (no code) become 503.
 */

/** The shape supabase-js returns for PostgREST/Postgres errors. */
export interface DbErrorLike {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

export interface ConstraintRule {
  /** Client-facing message. */
  message: string;
  /** Request field the constraint relates to (for 422 details). */
  field?: string;
}

export interface DbErrorContext {
  /** Friendly messages for specific constraints, keyed by constraint name. */
  constraints?: Record<string, ConstraintRule>;
  /** Message for "no such row" (PGRST116 / P0002). */
  notFoundMessage?: string;
}

const VALIDATION_CODES = new Set([
  "23502", // not_null_violation
  "23514", // check_violation
  "22001", // string_data_right_truncation
  "22007", // invalid_datetime_format
  "22008", // datetime_field_overflow
  "22023", // invalid_parameter_value
]);

const MALFORMED_INPUT_CODES = new Set([
  "22P02", // invalid_text_representation (bad uuid/enum literal)
  "22003", // numeric_value_out_of_range
]);

const RETRYABLE_CODES = new Set([
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  "57014", // query_canceled (statement timeout)
  "53300", // too_many_connections
]);

const AUTH_CODES = new Set(["PGRST301", "PGRST302", "PGRST303"]);

/** Extracts `constraint "name"` from a Postgres error message (server-side only). */
export function constraintName(error: DbErrorLike): string | undefined {
  return /constraint "([^"]+)"/.exec(error.message ?? "")?.[1];
}

export function mapDbError(
  error: DbErrorLike,
  operation: string,
  context: DbErrorContext = {},
): ApiError | DataAccessError {
  const code = error.code ?? "";
  const rule = context.constraints?.[constraintName(error) ?? ""];
  const fieldIssue = (fallback: string) => [{ path: rule?.field ?? "", message: rule?.message ?? fallback }];

  if (code === "23505") {
    return conflict(rule?.message ?? "A record with these details already exists.");
  }

  // exclusion_violation, e.g. overlapping timetable periods.
  if (code === "23P01") {
    return conflict(rule?.message ?? "This overlaps with an existing record.");
  }

  // object_not_in_prerequisite_state: a state rule (e.g. a notice that is no longer a draft).
  if (code === "55000") {
    return conflict(rule?.message ?? "The record is not in a state that allows this change.");
  }

  if (code === "23503") {
    // Deleting/updating a row that others reference vs. pointing at a row that doesn't exist.
    const referenced = /still referenced|update or delete on table/i.test(`${error.message} ${error.details}`);
    if (referenced) {
      return conflict(
        rule?.message ?? "This record is referenced by other records and cannot be changed or removed.",
      );
    }
    return validationError(fieldIssue("A referenced record does not exist."));
  }

  if (VALIDATION_CODES.has(code)) return validationError(fieldIssue("A value is not allowed."));
  if (MALFORMED_INPUT_CODES.has(code)) return badRequest("A value in the request is malformed.");
  if (code === "42501") return forbidden();
  if (code === "PGRST116" || code === "P0002") return notFound(context.notFoundMessage);
  if (AUTH_CODES.has(code)) return unauthorized();
  if (code === "SD001") return forbidden("You cannot change your own account status.");
  if (code === "SD002") return conflict("At least one active administrator must remain.");
  if (RETRYABLE_CODES.has(code)) return serviceUnavailable();

  // No code: supabase-js network failure (Supabase unreachable) → 503 via DataAccessError.
  return new DataAccessError(operation, code);
}
