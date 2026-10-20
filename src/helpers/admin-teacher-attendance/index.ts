import { attendanceRowState, draftFromRecord, latestRecord } from '@/helpers/admin-attendance';
import type { AttendanceRegisterRow, AttendanceSession } from '@/types/admin-attendance';
import type { TeacherRegisterData } from '@/types/admin-teacher-attendance';
import type { TeacherAttendance } from '@/types/teacher-attendance';
import type { Teacher } from '@/types/teachers';

/**
 * ONE ROW PER ACTIVE TEACHER, BY NAME. A DEACTIVATED TEACHER IS LISTED (READ-ONLY)
 * ONLY WHEN THEY ALREADY HAVE A RECORD FOR THE DATE, SO NO RECORD IS EVER HIDDEN.
 */
export function teacherRegisterRows(
  teachers: readonly Teacher[],
  data: TeacherRegisterData,
  session: AttendanceSession<TeacherAttendance>,
): AttendanceRegisterRow[] {
  const recordByTeacherId = new Map(data.records.map((record) => [record.teacherId, record]));

  return teachers
    .filter((teacher) => teacher.user.isActive || recordByTeacherId.has(teacher.id))
    .sort((first, second) => first.user.fullName.localeCompare(second.user.fullName))
    .map((teacher) => {
      const record = latestRecord(recordByTeacherId.get(teacher.id), session.saved[teacher.id]);
      const draft = session.edits[teacher.id] ?? draftFromRecord(record);
      return {
        id: teacher.id,
        leading: null,
        name: teacher.user.fullName,
        code: teacher.employeeCode,
        record,
        draft,
        state: attendanceRowState(record, draft),
        errorMessage: session.errors[teacher.id] ?? null,
        lockedReason: teacher.user.isActive ? null : "Account deactivated, so attendance can't be changed.",
      };
    });
}
