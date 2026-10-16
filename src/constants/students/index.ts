import { z } from 'zod';
import type { DbErrorContext } from '@/types/supabase';

const STUDENT_FIELDS =
  'id, userId, admissionNumber, admissionDate, dateOfBirth, gender, bloodGroup, fatherName, motherName, address, createdAt, updatedAt';
export const STUDENT_COLUMNS = `${STUDENT_FIELDS}, user:users!studentsUserFkey(fullName, email, phone, isActive)`;
/** INNER JOIN ON THE ACCOUNT, SO A LIST CAN BE FILTERED BY `user.isActive`. */
export const STUDENT_COLUMNS_FILTERABLE = `${STUDENT_FIELDS}, user:users!studentsUserFkey!inner(fullName, email, phone, isActive)`;
export const STUDENT_STATUS_COLUMNS = 'id, user:users!studentsUserFkey(isActive)';

export const STUDENT_ERRORS: DbErrorContext = {
  notFoundMessage: 'Student not found.',
  constraints: {
    students_admissionNumber_key: { message: 'A student with this admission number already exists.', field: 'admissionNumber' },
    studentsAdmissionNumberNotBlank: { message: 'admissionNumber is required.', field: 'admissionNumber' },
    usersFullNameNotBlank: { message: 'fullName is required.', field: 'fullName' },
  },
};

export const ADMISSION_NUMBER_SCHEMA = z.string().trim().min(1).max(50);
