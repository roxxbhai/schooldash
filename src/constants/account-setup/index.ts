import { z } from 'zod';

/**
 * ADMIN-ISSUED ACCOUNT SETUP CODES (MIGRATION 13).
 *
 * CROCKFORD BASE32 WITHOUT I, L, O AND U, SO A HANDWRITTEN OR PRINTED CODE
 * CANNOT BE MISREAD. 12 CHARACTERS = 60 BITS OF ENTROPY.
 */
export const SETUP_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const SETUP_CODE_LENGTH = 12;
export const SETUP_CODE_VALIDITY_DAYS = 7;

/** ACCEPTS "ABCD-EFGH-JKMN", LOWER CASE AND SPACES; NORMALIZED BEFORE HASHING. */
export const SETUP_CODE_INPUT_SCHEMA = z
  .string({ error: 'Setup code is required.' })
  .trim()
  .min(1, { error: 'Setup code is required.' })
  .max(30, { error: 'Enter the setup code exactly as it was given to you.' });
