'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { toFieldErrors } from '@/helpers/api-client';
import type { ApiResult, FieldErrors } from '@/types/api-client';

interface MutationOptions<TResult> {
  /** SHOWN AS A TOAST ONLY AFTER THE SERVER HAS CONFIRMED THE CHANGE. */
  successMessage?: string | ((data: TResult) => string);
  onSuccess?: (data: TResult) => void;
}

/**
 * RUNS A CREATE/UPDATE/ACTION CALL FOR A FORM OR BUTTON.
 * - IGNORES A SECOND CALL WHILE ONE IS IN FLIGHT (NO DOUBLE SUBMISSIONS).
 * - FIELD-LEVEL VALIDATION ERRORS GO TO `fieldErrors`; ANYTHING ELSE TO `formError`.
 */
export function useMutation<TInput, TResult>(mutate: (input: TInput) => Promise<ApiResult<TResult>>, options: MutationOptions<TResult> = {}) {
  const [isPending, setIsPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const isPendingRef = useRef(false);

  async function run(input: TInput): Promise<ApiResult<TResult> | null> {
    if (isPendingRef.current) return null;
    isPendingRef.current = true;
    setIsPending(true);
    setFormError(null);
    setFieldErrors({});

    const result = await mutate(input);

    isPendingRef.current = false;
    setIsPending(false);
    if (result.success) {
      const message = typeof options.successMessage === 'function' ? options.successMessage(result.data) : options.successMessage;
      if (message) toast.success(message);
      options.onSuccess?.(result.data);
      return result;
    }

    const errors = toFieldErrors(result.data);
    setFieldErrors(errors);
    // A VALIDATION FAILURE WITH FIELD DETAILS IS SHOWN NEXT TO THE FIELDS; EVERYTHING ELSE AS ONE MESSAGE.
    if (result.data.code !== 'VALIDATION_ERROR' || Object.keys(errors).length === 0) setFormError(result.message);
    return result;
  }

  function reset() {
    setFieldErrors({});
    setFormError(null);
  }

  return { run, isPending, fieldErrors, setFieldErrors, formError, reset };
}
