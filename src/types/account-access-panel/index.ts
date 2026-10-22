/** HOW A PERSON SIGNS IN: A TEACHER WITH THEIR PHONE NUMBER (ONCE SIGNED UP), A STUDENT WITH THEIR ADMISSION NUMBER. */
export type AccountAccess =
  | { role: 'teacher'; phone: string | null; isSignedUp: boolean }
  | { role: 'student'; admissionNumber: string };
