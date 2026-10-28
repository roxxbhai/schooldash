import { ROLL_NUMBER_FIELD } from '@/constants/admin-enrollments';
import { FINAL_GRADE, SKIP_REASON_LABELS } from '@/constants/class-promotion';
import { pluralize } from '@/helpers/format';
import { classLabel } from '@/helpers/reference-labels';
import type { AcademicYear } from '@/types/academic-years';
import type {
  PromotionClass,
  PromotionMove,
  PromotionRosterRow,
  PromotionStanding,
  PromotionTarget,
  SkippedStudent,
} from '@/types/class-promotion';

/** "6" AFTER "5"; NULL AFTER THE FINAL CLASS (12), WHOSE STUDENTS GRADUATE. */
export function nextGrade(grade: string): string | null {
  if (grade === FINAL_GRADE) return null;
  const number = Number(grade);
  return Number.isInteger(number) && number >= 1 ? String(number + 1) : null;
}

/** THE ACADEMIC YEARS AFTER `year`, EARLIEST FIRST: THE ONLY YEARS A CLASS CAN BE PROMOTED INTO. */
export function yearsAfter(years: readonly AcademicYear[], year: AcademicYear | undefined): AcademicYear[] {
  if (!year) return [];
  return years.filter((candidate) => candidate.startDate > year.startDate).sort((first, second) => first.startDate.localeCompare(second.startDate));
}

/** EACH STUDENT'S FIRST LATER ENROLLMENT (THE DATABASE LISTS THEM EARLIEST YEAR FIRST). */
export function firstMoveByStudent(moves: readonly PromotionMove[]): Map<string, PromotionMove> {
  const byStudent = new Map<string, PromotionMove>();
  for (const move of moves) if (!byStudent.has(move.studentId)) byStudent.set(move.studentId, move);
  return byStudent;
}

/** WHETHER A STUDENT CAN STILL BE PROMOTED: A STUDENT WHO MOVED ON OR GRADUATED ISN'T PROMOTED TWICE, AND AN INACTIVE ONE CAN'T BE. */
export function promotionStanding(row: PromotionRosterRow, moves: ReadonlyMap<string, PromotionMove>): PromotionStanding {
  if (!row.student) return { kind: 'unavailable', reason: 'unknown' };
  const move = moves.get(row.enrollment.studentId);
  if (move) return { kind: 'moved', move };
  if (row.student.graduatedOn) return { kind: 'graduated', graduatedOn: row.student.graduatedOn };
  if (!row.student.user.isActive) return { kind: 'unavailable', reason: 'inactive' };
  return { kind: 'eligible' };
}

/**
 * WHERE A CLASS GOES BY DEFAULT: CLASS 12 GRADUATES; ANY OTHER CLASS MOVES TO THE NEXT
 * CLASS WITH THE SAME SECTION IN `academicYearId` (5 – A → 6 – A). WHEN THAT CLASS
 * DOESN'T EXIST YET, AN ADMIN IS OFFERED TO CREATE IT; ANYONE ELSE CHOOSES.
 */
export function defaultPromotionTarget(input: {
  sourceClass: { name: string; section: string };
  academicYearId: string | null;
  classes: readonly PromotionClass[];
  canCreateClass: boolean;
}): PromotionTarget | null {
  const grade = nextGrade(input.sourceClass.name);
  if (grade === null) return { kind: 'graduate' };
  if (!input.academicYearId) return null;
  const existing = input.classes.find(
    (schoolClass) => schoolClass.academicYearId === input.academicYearId && schoolClass.name === grade && schoolClass.section === input.sourceClass.section,
  );
  if (existing) return { kind: 'class', classId: existing.id };
  return input.canCreateClass ? { kind: 'newClass', academicYearId: input.academicYearId, name: grade, section: input.sourceClass.section } : null;
}

/**
 * A MESSAGE PER STUDENT WHOSE ROLL NUMBER CAN'T BE USED: NOT A NUMBER, ALREADY TAKEN IN
 * THE TARGET CLASS, OR GIVEN TO MORE THAN ONE STUDENT. AN EMPTY ROLL NUMBER IS FINE.
 */
export function rollNumberIssues(entries: readonly { studentId: string; rollNumber: string }[], taken: ReadonlySet<number>): Record<string, string> {
  const issues: Record<string, string> = {};
  const studentsByRoll = new Map<number, string[]>();
  for (const entry of entries) {
    const parsed = ROLL_NUMBER_FIELD.safeParse(entry.rollNumber);
    if (!parsed.success) {
      issues[entry.studentId] = parsed.error.issues[0]?.message ?? 'Enter a valid roll number.';
      continue;
    }
    if (parsed.data === null) continue;
    if (taken.has(parsed.data)) {
      issues[entry.studentId] = `Roll number ${parsed.data} is already taken in that class.`;
      continue;
    }
    studentsByRoll.set(parsed.data, [...(studentsByRoll.get(parsed.data) ?? []), entry.studentId]);
  }
  for (const [rollNumber, studentIds] of studentsByRoll) {
    if (studentIds.length < 2) continue;
    for (const studentId of studentIds) issues[studentId] = `Roll number ${rollNumber} is given to more than one student.`;
  }
  return issues;
}

/** "2 skipped: 1 inactive, 1 already enrolled in that year." OR NULL WHEN NOBODY WAS SKIPPED. */
export function skippedSummary(skipped: readonly SkippedStudent[]): string | null {
  if (skipped.length === 0) return null;
  const counts = new Map<SkippedStudent['reason'], number>();
  for (const student of skipped) counts.set(student.reason, (counts.get(student.reason) ?? 0) + 1);
  const parts = [...counts].map(([reason, count]) => `${count} ${SKIP_REASON_LABELS[reason]}`);
  return `${pluralize(skipped.length, 'student')} skipped: ${parts.join(', ')}.`;
}

/** "6 – A" FOR A CLASS OF A LATER YEAR (TEACHERS CAN'T LOOK THOSE UP IN THEIR OWN CLASS LIST). */
export function promotionClassLabel(classes: ReadonlyMap<string, PromotionClass>, classId: string): string {
  return classLabel(classes.get(classId));
}
