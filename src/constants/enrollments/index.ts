import { z } from 'zod';
import type { DbErrorContext } from '@/types/supabase';

export const ENROLLMENT_COLUMNS = 'id, studentId, classId, academicYearId, rollNumber, enrolledOn, createdAt, updatedAt';

export const ENROLLMENT_ERRORS: DbErrorContext = {
  notFoundMessage: 'Enrollment not found.',
  constraints: {
    studentEnrollmentsStudentYearKey: { message: 'This student is already enrolled in a class for that academic year.', field: 'studentId' },
    studentEnrollmentsStudentClassKey: { message: 'This student is already enrolled in that class.', field: 'classId' },
    studentEnrollmentsClassRollKey: { message: 'This roll number is already used in the class.', field: 'rollNumber' },
    studentEnrollmentsRollNumberPositive: { message: 'rollNumber must be a positive integer.', field: 'rollNumber' },
    // INSERT/UPDATE: THE CLASS DOESN'T EXIST IN THAT YEAR. MOVING AN ENROLLMENT THAT ALREADY HAS
    // ATTENDANCE OR RESULTS IS REPORTED AS 409 (STILL REFERENCED) BY THE TWO RULES BELOW.
    studentEnrollmentsClassFkey: { message: "The class does not exist in the enrollment's academic year.", field: 'classId' },
    studentEnrollments_studentId_fkey: { message: 'Student not found.', field: 'studentId' },
    studentAttendanceEnrollmentFkey: { message: 'This enrollment has attendance records; the student cannot be moved to another class.' },
    resultsEnrollmentFkey: { message: 'This enrollment has results; the student cannot be moved to another class.' },
  },
};

export const ROLL_NUMBER_SCHEMA = z.number().int().positive().max(100000);
