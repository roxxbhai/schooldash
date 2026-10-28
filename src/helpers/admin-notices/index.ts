import { AUDIENCE_ROLES, MAX_NAMED_STUDENTS } from '@/constants/admin-notices';
import { ROUTES } from '@/constants/routes';
import { classLabel } from '@/helpers/reference-labels';
import type { AdminNotice, AudienceSelection, AudienceStudent, NoticeAudienceView } from '@/types/admin-notices';
import type { FieldErrors } from '@/types/api-client';
import type { SchoolClass } from '@/types/classes';

export function noticeDetailPath(id: string): string {
  return `${ROUTES.admin.notices}/${encodeURIComponent(id)}`;
}

/** "Aarav Sharma (ADM2026001)"; WHICHEVER IS KNOWN WHEN THE OTHER ISN'T. */
export function audienceStudentLabel(student: Pick<AudienceStudent, 'fullName' | 'admissionNumber'>): string {
  if (student.fullName && student.admissionNumber) return `${student.fullName} (${student.admissionNumber})`;
  return student.fullName ?? (student.admissionNumber || 'Unknown student');
}

/** "All students" FOR A ROLE, "Class 10 – A" FOR A CLASS, THE STUDENT'S NAME FOR A STUDENT. */
export function audienceLabel(audience: NoticeAudienceView, classById: ReadonlyMap<string, SchoolClass>): string {
  if (audience.role) return AUDIENCE_ROLES.find((option) => option.role === audience.role)?.label ?? audience.role;
  if (audience.classId) return `Class ${classLabel(classById.get(audience.classId))}`;
  if (audience.student) return audienceStudentLabel(audience.student);
  return audience.studentId ? 'Unknown student' : 'Unknown audience';
}

/** ROLES FIRST (IN THE PICKER'S ORDER), THEN CLASSES IN NATURAL ORDER, THEN STUDENTS BY NAME. */
export function audienceLabels(audiences: readonly NoticeAudienceView[], classById: ReadonlyMap<string, SchoolClass>): string[] {
  const roleLabels = AUDIENCE_ROLES.filter((option) => audiences.some((audience) => audience.role === option.role)).map((option) => option.label);
  const classLabels = audiences
    .filter((audience) => audience.classId)
    .map((audience) => audienceLabel(audience, classById))
    .sort((first, second) => first.localeCompare(second, 'en', { numeric: true }));
  const studentLabels = audiences
    .filter((audience) => audience.studentId)
    .map((audience) => audienceLabel(audience, classById))
    .sort((first, second) => first.localeCompare(second));
  return [...roleLabels, ...classLabels, ...studentLabels];
}

/** "All students · Class 10 – A · Aarav Sharma (ADM2026001)". MORE THAN A COUPLE OF STUDENTS ARE COUNTED: "· 5 students". */
export function audienceSummary(audiences: readonly NoticeAudienceView[], classById: ReadonlyMap<string, SchoolClass>): string {
  const studentCount = audiences.filter((audience) => audience.studentId).length;
  if (studentCount <= MAX_NAMED_STUDENTS) {
    const labels = audienceLabels(audiences, classById);
    return labels.length === 0 ? 'No audience yet' : labels.join(' · ');
  }
  const otherLabels = audienceLabels(
    audiences.filter((audience) => !audience.studentId),
    classById,
  );
  return [...otherLabels, `${studentCount} students`].join(' · ');
}

/** THE PICKER'S SELECTION AS THE API'S `audiences` ARRAY. */
export function toAudienceInputs(selection: AudienceSelection) {
  return [
    ...selection.roles.map((role) => ({ role })),
    ...selection.classIds.map((classId) => ({ classId })),
    ...selection.students.map((student) => ({ studentId: student.id })),
  ];
}

export function selectionFromAudiences(audiences: readonly NoticeAudienceView[]): AudienceSelection {
  return {
    roles: audiences.flatMap((audience) => (audience.role ? [audience.role] : [])),
    classIds: audiences.flatMap((audience) => (audience.classId ? [audience.classId] : [])),
    students: audiences.flatMap((audience) =>
      audience.studentId
        ? [{ id: audience.studentId, fullName: audience.student?.fullName ?? null, admissionNumber: audience.student?.admissionNumber ?? '' }]
        : [],
    ),
  };
}

/** THE DATE THAT MATTERS IN A LIST: WHEN IT WENT OUT FOR PUBLISHED NOTICES, OTHERWISE WHEN IT LAST CHANGED. */
export function noticeListDate(notice: Pick<AdminNotice, 'status' | 'publishedAt' | 'updatedAt'>): string {
  return notice.status === 'published' && notice.publishedAt ? notice.publishedAt : notice.updatedAt;
}

/** THE FIRST ERROR FOR `audiences` OR ANY OF ITS ITEMS (E.G. "audiences.2.classId"). */
export function audienceError(errors: FieldErrors): string | undefined {
  const key = Object.keys(errors).find((path) => path === 'audiences' || path.startsWith('audiences.'));
  return key ? errors[key] : undefined;
}
