import 'server-only';
import { ENROLLMENT_COLUMNS, ENROLLMENT_ERRORS } from '@/constants/enrollments';
import { many, maybeOne, one } from '@/helpers/db-query';
import { functionFailure, functionSuccess, unwrapResult } from '@/helpers/function-result';
import { studentActiveStates } from '@/functions/students';
import type { ValidationIssue } from '@/types/api';
import type { Enrollment } from '@/types/enrollments';
import type { FunctionResult } from '@/types/function-result';
import type { DbClient } from '@/types/supabase';

/** ONE ENROLLMENT, AS THE CALLER MAY SEE IT (RLS); 404 OTHERWISE. */
export async function findEnrollment(client: DbClient, id: string): Promise<FunctionResult<Enrollment>> {
  try {
    const query = client.from('studentEnrollments').select(ENROLLMENT_COLUMNS).eq('id', id).maybeSingle();
    return functionSuccess(await one<Enrollment>('enrollments.get', query, ENROLLMENT_ERRORS));
  } catch (error) {
    return functionFailure(error, 'enrollments.get');
  }
}

/** THE STUDENTS (AMONG `studentIds`) ENROLLED IN `classId`. */
async function enrolledStudentIds(client: DbClient, classId: string, studentIds: string[]): Promise<FunctionResult<Set<string>>> {
  try {
    const query = client.from('studentEnrollments').select('studentId').eq('classId', classId).in('studentId', studentIds);
    const rows = await many<{ studentId: string }>('studentEnrollments.inClass', query, ENROLLMENT_ERRORS);
    return functionSuccess(new Set(rows.map((row) => row.studentId)));
  } catch (error) {
    return functionFailure(error, 'studentEnrollments.inClass');
  }
}

/** A STUDENT'S ENROLLMENT IN A GIVEN ACADEMIC YEAR, OR NULL. */
export async function findEnrollmentForYear(
  client: DbClient,
  studentId: string,
  academicYearId: string,
): Promise<FunctionResult<Enrollment | null>> {
  try {
    const query = client
      .from('studentEnrollments')
      .select(ENROLLMENT_COLUMNS)
      .eq('studentId', studentId)
      .eq('academicYearId', academicYearId)
      .maybeSingle();
    return functionSuccess(await maybeOne<Enrollment>('enrollments.forYear', query, ENROLLMENT_ERRORS));
  } catch (error) {
    return functionFailure(error, 'enrollments.forYear');
  }
}

/**
 * WHY EACH STUDENT CANNOT RECEIVE A RECORD (ATTENDANCE, MARKS) IN `classId`:
 * UNKNOWN, DEACTIVATED, OR NOT ENROLLED. `fieldPaths[i]` IS THE REQUEST FIELD
 * OF `studentIds[i]`. AN EMPTY LIST MEANS EVERY STUDENT IS ELIGIBLE.
 */
export async function studentEligibilityIssues(
  client: DbClient,
  classId: string,
  studentIds: string[],
  fieldPaths: string[],
  notEnrolledMessage: string,
): Promise<FunctionResult<ValidationIssue[]>> {
  try {
    const [activeResult, enrolledResult] = await Promise.all([
      studentActiveStates(client, studentIds),
      enrolledStudentIds(client, classId, studentIds),
    ]);
    const activeStates = unwrapResult(activeResult);
    const enrolled = unwrapResult(enrolledResult);

    const issues: ValidationIssue[] = [];
    studentIds.forEach((studentId, index) => {
      const path = fieldPaths[index];
      if (!activeStates.has(studentId)) issues.push({ path, message: 'Student not found.' });
      else if (!activeStates.get(studentId)) issues.push({ path, message: "The student's account is deactivated." });
      else if (!enrolled.has(studentId)) issues.push({ path, message: notEnrolledMessage });
    });
    return functionSuccess(issues);
  } catch (error) {
    return functionFailure(error, 'enrollments.studentEligibility');
  }
}
