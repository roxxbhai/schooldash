import { z } from 'zod';
import type { DbErrorContext } from '@/types/supabase';

const TEACHER_FIELDS = 'id, userId, employeeCode, qualification, dateOfJoining, createdAt, updatedAt';
export const TEACHER_COLUMNS = `${TEACHER_FIELDS}, user:users!teachersUserFkey(fullName, email, phone, isActive, passwordSetAt)`;
/** INNER JOIN ON THE ACCOUNT, SO A LIST CAN BE FILTERED BY `user.isActive`. */
export const TEACHER_COLUMNS_FILTERABLE = `${TEACHER_FIELDS}, user:users!teachersUserFkey!inner(fullName, email, phone, isActive, passwordSetAt)`;
export const TEACHER_STATUS_COLUMNS = 'id, user:users!teachersUserFkey(isActive)';

export const TEACHER_ERRORS: DbErrorContext = {
  notFoundMessage: 'Teacher not found.',
  constraints: {
    teachers_employeeCode_key: { message: 'A teacher with this employee code already exists.', field: 'employeeCode' },
    teachersEmployeeCodeNotBlank: { message: 'employeeCode is required.', field: 'employeeCode' },
    usersFullNameNotBlank: { message: 'fullName is required.', field: 'fullName' },
    usersTeacherPhoneKey: { message: 'Another teacher already uses this phone number.', field: 'phone' },
    usersTeacherPhoneFormat: { message: 'Enter a 10-digit mobile number.', field: 'phone' },
  },
};

export const EMPLOYEE_CODE_SCHEMA = z.string().trim().min(1).max(50);
