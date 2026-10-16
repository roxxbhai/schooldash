import type { ApiErrorCode, ApiErrorStatus, ValidationIssue } from '@/types/api';

/**
 * THE STANDARD RESPONSE OF EVERY FUNCTION IN src/functions (AGENTS.MD).
 * A FAILURE CARRIES THE HTTP STATUS, ERROR CODE AND FIELD DETAILS SO ROUTES
 * CAN RETURN EXACTLY THE SAME API ERROR AS BEFORE.
 */
export interface FunctionFailureData {
  status: ApiErrorStatus;
  code: ApiErrorCode;
  details?: readonly ValidationIssue[];
}

export interface FunctionSuccess<T> {
  success: true;
  message: string;
  data: T;
}

export interface FunctionFailure {
  success: false;
  message: string;
  data: FunctionFailureData;
}

export type FunctionResult<T> = FunctionSuccess<T> | FunctionFailure;
