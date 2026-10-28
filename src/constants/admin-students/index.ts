import { z } from 'zod';
import { ROLL_NUMBER_FIELD } from '@/constants/admin-enrollments';
import { FULL_NAME_FIELD, OPTIONAL_DATE_FIELD, OPTIONAL_EMAIL_FIELD } from '@/constants/people';
import type { SelectOption } from '@/types/reference-labels';

export const GENDER_OPTIONS: SelectOption[] = [
  { value: 'Female', label: 'Female' },
  { value: 'Male', label: 'Male' },
  { value: 'Other', label: 'Other' },
];

/** STORED AS PLAIN ASCII ('A-'); SHOWN WITH A TRUE MINUS SIGN. */
export const BLOOD_GROUP_OPTIONS: SelectOption[] = [
  { value: 'A+', label: 'A+' },
  { value: 'A-', label: 'A−' },
  { value: 'B+', label: 'B+' },
  { value: 'B-', label: 'B−' },
  { value: 'AB+', label: 'AB+' },
  { value: 'AB-', label: 'AB−' },
  { value: 'O+', label: 'O+' },
  { value: 'O-', label: 'O−' },
];

/** THE PROFILE FIELDS A STUDENT HAS BOTH WHEN CREATED AND WHEN EDITED. */
export const STUDENT_PROFILE_FIELDS = z.object({
  fullName: FULL_NAME_FIELD,
  admissionNumber: z.string().trim().min(1, { error: 'Enter the admission number.' }).max(50, { error: 'Use at most 50 characters.' }),
  admissionDate: OPTIONAL_DATE_FIELD,
  dateOfBirth: OPTIONAL_DATE_FIELD,
  gender: z.string().max(30).nullable(),
  bloodGroup: z.string().max(10).nullable(),
  fatherName: z.string().trim().max(200, { error: 'Use at most 200 characters.' }),
  motherName: z.string().trim().max(200, { error: 'Use at most 200 characters.' }),
  address: z.string().trim().max(500, { error: 'Use at most 500 characters.' }),
});

/** A NEW STUDENT. NO PASSWORD: THEY SIGN IN WITH THEIR ADMISSION NUMBER. OPTIONALLY ENROLLED IN A CLASS RIGHT AWAY. */
export const STUDENT_FORM_SCHEMA = STUDENT_PROFILE_FIELDS.extend({
  email: OPTIONAL_EMAIL_FIELD,
  classId: z.string().nullable(),
  rollNumber: ROLL_NUMBER_FIELD,
});

export type StudentForm = z.input<typeof STUDENT_FORM_SCHEMA>;
export type StudentValues = z.output<typeof STUDENT_FORM_SCHEMA>;

export const EMPTY_STUDENT_FORM: StudentForm = {
  fullName: '',
  email: '',
  admissionNumber: '',
  admissionDate: '',
  dateOfBirth: '',
  gender: null,
  bloodGroup: null,
  fatherName: '',
  motherName: '',
  address: '',
  classId: null,
  rollNumber: '',
};
