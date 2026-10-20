import { attendanceRowState, draftFromRecord, latestRecord } from '@/helpers/admin-attendance';
import type { AttendanceRegisterRow, AttendanceSession } from '@/types/admin-attendance';
import type { StudentRegisterData } from '@/types/admin-student-attendance';
import type { StudentAttendance } from '@/types/student-attendance';

/** ONE ROW PER ENROLLED STUDENT, BY ROLL NUMBER (MISSING ONES LAST), THEN NAME. */
export function studentRegisterRows(data: StudentRegisterData, session: AttendanceSession<StudentAttendance>): AttendanceRegisterRow[] {
  const studentById = new Map(data.students.map((student) => [student.id, student]));
  const recordByStudentId = new Map(data.records.map((record) => [record.studentId, record]));

  const rows = data.enrollments.map((enrollment) => {
    const student = studentById.get(enrollment.studentId);
    const record = latestRecord(recordByStudentId.get(enrollment.studentId), session.saved[enrollment.studentId]);
    const draft = session.edits[enrollment.studentId] ?? draftFromRecord(record);
    const isInactive = student ? !student.user.isActive : false;
    return {
      row: {
        id: enrollment.studentId,
        leading: enrollment.rollNumber === null ? null : String(enrollment.rollNumber),
        name: student?.user.fullName ?? 'Unknown student',
        code: student?.admissionNumber ?? '—',
        record,
        draft,
        state: attendanceRowState(record, draft),
        errorMessage: session.errors[enrollment.studentId] ?? null,
        lockedReason: isInactive ? "Account deactivated, so attendance can't be recorded." : null,
      },
      rollNumber: enrollment.rollNumber,
    };
  });

  return rows
    .sort((first, second) => {
      if (first.rollNumber !== second.rollNumber) {
        if (first.rollNumber === null) return 1;
        if (second.rollNumber === null) return -1;
        return first.rollNumber - second.rollNumber;
      }
      return first.row.name.localeCompare(second.row.name);
    })
    .map((entry) => entry.row);
}
