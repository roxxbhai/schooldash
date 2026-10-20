import type { AcademicYear } from '@/types/academic-years';
import type { SchoolClass } from '@/types/classes';
import type { SelectOption } from '@/types/reference-labels';
import type { Subject } from '@/types/subjects';
import type { Teacher } from '@/types/teachers';

/** HOW RECORDS ARE NAMED EVERYWHERE IN THE PORTAL, SO A CLASS READS THE SAME IN EVERY TABLE AND MENU. */

export function classLabel(schoolClass: Pick<SchoolClass, 'name' | 'section'> | null | undefined): string {
  if (!schoolClass) return 'Unknown class';
  return `${schoolClass.name} – ${schoolClass.section}`;
}

export function subjectLabel(subject: Pick<Subject, 'name'> | null | undefined): string {
  return subject?.name ?? 'Unknown subject';
}

export function teacherLabel(teacher: Pick<Teacher, 'user'> | null | undefined): string {
  return teacher?.user.fullName ?? 'Unknown teacher';
}

/** CLASSES OF ONE YEAR (OR ALL), SORTED NATURALLY: "2 – A" BEFORE "10 – A". */
export function sortClasses(classes: readonly SchoolClass[]): SchoolClass[] {
  return [...classes].sort((first, second) => classLabel(first).localeCompare(classLabel(second), 'en', { numeric: true }));
}

export function academicYearOptions(years: readonly AcademicYear[]): SelectOption[] {
  return years.map((year) => ({ value: year.id, label: year.isCurrent ? `${year.name} (current)` : year.name }));
}

export function classOptions(classes: readonly SchoolClass[], academicYearId: string | null): SelectOption[] {
  const inYear = academicYearId ? classes.filter((schoolClass) => schoolClass.academicYearId === academicYearId) : classes;
  return sortClasses(inYear).map((schoolClass) => ({ value: schoolClass.id, label: classLabel(schoolClass) }));
}

export function subjectOptions(subjects: readonly Subject[]): SelectOption[] {
  return [...subjects]
    .sort((first, second) => first.name.localeCompare(second.name))
    .map((subject) => ({ value: subject.id, label: `${subject.name} (${subject.code})` }));
}

/** ACTIVE TEACHERS ONLY, UNLESS `includeId` (THE CURRENT VALUE OF A FIELD) BELONGS TO AN INACTIVE ONE. */
export function teacherOptions(teachers: readonly Teacher[], includeId?: string | null): SelectOption[] {
  return teachers
    .filter((teacher) => teacher.user.isActive || teacher.id === includeId)
    .sort((first, second) => first.user.fullName.localeCompare(second.user.fullName))
    .map((teacher) => ({ value: teacher.id, label: `${teacher.user.fullName} (${teacher.employeeCode})` }));
}
