import { z } from 'zod';
import { FULL_NAME_FIELD } from '@/constants/people';

/** A NEW ADMINISTRATOR. NO PASSWORD: THEY CHOOSE ONE WITH THE ONE-TIME SETUP CODE SHOWN AFTER ADDING THEM. */
export const ADMINISTRATOR_FORM_SCHEMA = z.object({
  fullName: FULL_NAME_FIELD,
  email: z
    .string()
    .trim()
    .min(1, { error: 'Enter the email they will sign in with.' })
    .pipe(z.email({ error: 'Enter a valid email address, like name@example.com.' })),
});

export type AdministratorForm = z.input<typeof ADMINISTRATOR_FORM_SCHEMA>;

export const EMPTY_ADMINISTRATOR_FORM: AdministratorForm = { fullName: '', email: '' };
