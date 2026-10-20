import 'server-only';
import { createHash, randomInt } from 'node:crypto';
import { SETUP_CODE_ALPHABET, SETUP_CODE_LENGTH } from '@/constants/account-setup';

/** A NEW RANDOM CODE (UNFORMATTED), FROM A CRYPTOGRAPHICALLY SECURE SOURCE. */
export function generateSetupCode(): string {
  let code = '';
  for (let index = 0; index < SETUP_CODE_LENGTH; index += 1) {
    code += SETUP_CODE_ALPHABET[randomInt(SETUP_CODE_ALPHABET.length)];
  }
  return code;
}

/** "7K2MQ9TB4HXD" → "7K2M-Q9TB-4HXD". */
export function formatSetupCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code;
}

/**
 * UPPER-CASES, DROPS SEPARATORS, AND MAPS THE LOOK-ALIKE LETTERS CROCKFORD
 * EXCLUDES (O → 0, I/L → 1), SO "7k2m q9tb 4hxd" MATCHES "7K2M-Q9TB-4HXD".
 */
export function normalizeSetupCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

/** SHA-256 HEX. CODES ARE RANDOM AND HIGH-ENTROPY, SO A FAST HASH IS SUFFICIENT. */
export function hashSetupCode(normalizedCode: string): string {
  return createHash('sha256').update(normalizedCode).digest('hex');
}
