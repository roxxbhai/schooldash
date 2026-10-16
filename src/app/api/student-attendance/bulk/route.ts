import { z } from 'zod';
import { MAX_BULK_ATTENDANCE_RECORDS, STUDENT_ATTENDANCE_COLUMNS, STUDENT_ATTENDANCE_ERRORS } from '@/constants/student-attendance';
import { requireRole } from '@/functions/authorization';
import { requireClassAttendanceWriter, validateAttendanceRecords } from '@/functions/student-attendance';
import { apiRoute, created } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { many } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { parseJsonBody, uuidSchema } from '@/helpers/request-validation';
import { attendanceDateSchema, attendanceStatusSchema, optionalText } from '@/helpers/school-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import type { StudentAttendance } from '@/types/student-attendance';

const bulkStudentAttendanceSchema = z
  .strictObject({
    classId: uuidSchema,
    attendanceDate: attendanceDateSchema,
    records: z
      .array(z.strictObject({ studentId: uuidSchema, status: attendanceStatusSchema, remarks: optionalText(500) }))
      .min(1)
      .max(MAX_BULK_ATTENDANCE_RECORDS),
  })
  .superRefine((submission, ctx) => {
    const seenStudentIds = new Set<string>();
    submission.records.forEach((record, index) => {
      if (seenStudentIds.has(record.studentId)) {
        ctx.addIssue({ code: 'custom', path: ['records', index, 'studentId'], message: 'Duplicate student in this submission.' });
      }
      seenStudentIds.add(record.studentId);
    });
  });

/**
 * ADMINS, OR TEACHERS OF THE CLASS. RECORDS A WHOLE CLASS FOR ONE DAY:
 * { classId, attendanceDate, RECORDS: [{ studentId, STATUS, REMARKS? }] } (MAX 200).
 * ALL-OR-NOTHING: EVERY INVALID RECORD IS REPORTED BY INDEX, AND THE ROWS ARE
 * WRITTEN IN ONE INSERT STATEMENT, SO EITHER ALL ARE SAVED OR NONE.
 */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  const actor = unwrapResult(await requireRole(supabase, ['ADMIN', 'TEACHER']));
  const { classId, attendanceDate, records } = await parseJsonBody(request, bulkStudentAttendanceSchema);
  unwrapResult(await requireClassAttendanceWriter(supabase, actor, classId));
  const studentIds = records.map((record) => record.studentId);
  const fieldPaths = records.map((_record, index) => `records.${index}.studentId`);
  unwrapResult(await validateAttendanceRecords(supabase, classId, attendanceDate, studentIds, fieldPaths));

  const rows = records.map((record) => ({ ...record, classId, attendanceDate, markedByUserId: actor.id }));
  const query = supabase.from('studentAttendance').insert(rows).select(STUDENT_ATTENDANCE_COLUMNS);
  const items = await many<StudentAttendance>('studentAttendance.insert', query, STUDENT_ATTENDANCE_ERRORS);
  return created({ items, count: items.length });
});
