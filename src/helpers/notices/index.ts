import 'server-only';
import { toAppRole } from '@/helpers/roles';
import type { Notice, NoticeWithAudiences } from '@/types/notices';

/**
 * THE API SHAPE OF A NOTICE. AUDIENCES (ADMIN VIEWS ONLY) USE UPPERCASE ROLES
 * LIKE THE REST OF THE API, IN A STABLE ORDER.
 */
export function presentNotice(notice: Notice | NoticeWithAudiences) {
  if (!('audiences' in notice)) return notice;
  const audiences = notice.audiences
    .map((audience) => ({
      id: audience.id,
      role: audience.audienceRole ? toAppRole(audience.audienceRole) : null,
      classId: audience.classId,
      studentId: audience.studentId,
      // EMBEDDED ONLY FOR STUDENT AUDIENCES (THE ROW CAN BE MISSING IF RLS HIDES IT).
      student: audience.student ? { fullName: audience.student.user?.fullName ?? null, admissionNumber: audience.student.admissionNumber } : null,
    }))
    .sort((a, b) => `${a.role ?? ''}${a.classId ?? ''}${a.studentId ?? ''}`.localeCompare(`${b.role ?? ''}${b.classId ?? ''}${b.studentId ?? ''}`));
  return { ...notice, audiences };
}
