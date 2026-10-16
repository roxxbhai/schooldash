import 'server-only';
import { STUDENT_ATTENDANCE_ERRORS } from '@/constants/student-attendance';
import { teachesClass } from '@/functions/authorization';
import { studentEligibilityIssues } from '@/functions/enrollments';
import { forbidden, validationError } from '@/helpers/api-error';
import { maybeOne } from '@/helpers/db-query';
import { functionFailure, functionSuccess, unwrapResult } from '@/helpers/function-result';
import type { AppUser } from '@/types/auth';
import type { FunctionResult } from '@/types/function-result';
import type { ClassWithYear } from '@/types/student-attendance';
import type { DbClient } from '@/types/supabase';

/**
 * STUDENT ATTENDANCE RULES SHARED BY THE SINGLE, BULK AND CORRECTION ENDPOINTS.
 * THE DATABASE ENFORCES THE SAME RULES (MIGRATION 8) FOR DIRECT DATA API WRITES.
 */

/** ADMINS MAY WRITE ANY CLASS'S ATTENDANCE; TEACHERS ONLY CLASSES THEY TEACH; STUDENTS NEVER. */
export async function requireClassAttendanceWriter(client: DbClient, actor: AppUser, classId: string): Promise<FunctionResult<null>> {
  try {
    if (actor.role === 'ADMIN') return functionSuccess(null);
    if (actor.role !== 'TEACHER') throw forbidden();
    if (!unwrapResult(await teachesClass(client, actor, { classId }))) {
      throw forbidden('You can only record attendance for classes you teach.');
    }
    return functionSuccess(null);
  } catch (error) {
    return functionFailure(error, 'studentAttendance.authorize');
  }
}

/**
 * THE DATE MUST FALL IN THE CLASS'S ACADEMIC YEAR, AND EVERY STUDENT MUST BE
 * ACTIVE AND ENROLLED IN THE CLASS. ALL PROBLEMS ARE REPORTED TOGETHER (422).
 * `studentFieldPaths[i]` IS THE REQUEST FIELD OF `studentIds[i]`.
 */
export async function validateAttendanceRecords(
  client: DbClient,
  classId: string,
  attendanceDate: string,
  studentIds: string[],
  studentFieldPaths: string[],
): Promise<FunctionResult<null>> {
  try {
    const query = client
      .from('classes')
      .select('id, academicYear:academicYears!classes_academicYearId_fkey(startDate, endDate)')
      .eq('id', classId)
      .maybeSingle()
      .overrideTypes<ClassWithYear, { merge: false }>();
    const schoolClass = await maybeOne<ClassWithYear>('classes.withYear', query, STUDENT_ATTENDANCE_ERRORS);
    if (!schoolClass?.academicYear) throw validationError([{ path: 'classId', message: 'Class not found.' }]);
    const { startDate, endDate } = schoolClass.academicYear;
    if (attendanceDate < startDate || attendanceDate > endDate) {
      throw validationError([{ path: 'attendanceDate', message: "The date is outside the class's academic year." }]);
    }

    const issues = unwrapResult(
      await studentEligibilityIssues(client, classId, studentIds, studentFieldPaths, 'The student is not enrolled in this class.'),
    );
    if (issues.length > 0) throw validationError(issues);
    return functionSuccess(null);
  } catch (error) {
    return functionFailure(error, 'studentAttendance.validate');
  }
}
