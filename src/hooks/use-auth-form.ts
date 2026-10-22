'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { AUTH_ERROR_TITLES, DEFAULT_AUTH_ERROR_TITLE } from '@/constants/auth-forms';
import { toFieldErrors } from '@/helpers/api-client';
import { focusFirstInvalidField, withoutKey, zodFieldErrors } from '@/helpers/forms';
import type { FieldErrors } from '@/types/api-client';
import type { AuthFormError, AuthFormOptions } from '@/types/auth-forms';

/**
 * THE SHARED BEHAVIOUR OF EVERY SIGN-IN, SIGN-UP AND SETUP FORM: FIELD VALUES,
 * CLIENT CHECKS WITH FOCUS ON THE FIRST BAD FIELD, NO DOUBLE SUBMITS, SERVER
 * FIELD ERRORS NEXT TO THEIR FIELDS, ONE CLEAR MESSAGE FOR EVERYTHING ELSE,
 * AND NAVIGATION ONCE THE SERVER CONFIRMS.
 */
export function useAuthForm<Values extends Record<string, string>, Parsed, Outcome>(options: AuthFormOptions<Values, Parsed, Outcome>) {
  const [values, setValues] = useState<Values>(options.initialValues);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<AuthFormError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  /** THE DOCUMENT-UNIQUE ID OF A FIELD, E.G. "teacher-sign-up-phone". ERRORS STAY KEYED BY THE FIELD NAME. */
  function fieldId(field: keyof Values & string) {
    return `${options.formId}-${field}`;
  }

  function updateField(field: keyof Values & string) {
    return function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
      setValues((current) => ({ ...current, [field]: event.target.value }));
      setFieldErrors((errors) => withoutKey(errors, field));
    };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const parsed = options.schema.safeParse(values);
    if (!parsed.success) {
      setFormError(null);
      setFieldErrors(zodFieldErrors(parsed.error));
      requestAnimationFrame(() => focusFirstInvalidField(formRef.current));
      return;
    }

    setIsSubmitting(true);
    setFieldErrors({});
    setFormError(null);
    const result = await options.submit(parsed.data);

    if (result.success) {
      const message = options.successMessage?.(result.data);
      if (message) toast.success(message);
      // STAY IN THE SUBMITTING STATE WHILE THE NEXT PAGE LOADS, SO THE FORM CANNOT BE SENT TWICE.
      router.replace(options.destination(result.data));
      router.refresh();
      return;
    }

    setIsSubmitting(false);
    setFieldErrors(toFieldErrors(result.data));
    setFormError({ code: result.data.code, title: AUTH_ERROR_TITLES[result.data.code] ?? DEFAULT_AUTH_ERROR_TITLE, message: result.message });
  }

  return { values, fieldErrors, formError, isSubmitting, formRef, fieldId, updateField, handleSubmit };
}
