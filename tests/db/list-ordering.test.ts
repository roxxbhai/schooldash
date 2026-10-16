import { describe, expect, it } from "vitest";
import { listAcademicYears } from "@/lib/academic-years/repository";
import { listClasses } from "@/lib/classes/repository";
import { listEnrollments } from "@/lib/enrollments/repository";
import { listStudents } from "@/lib/students/repository";
import { listSubjects } from "@/lib/subjects/repository";
import { listAssignments } from "@/lib/teacher-assignments/repository";
import { listTeachers } from "@/lib/teachers/repository";
import { listStudentAttendance } from "@/lib/student-attendance/repository";
import { listTeacherAttendance } from "@/lib/teacher-attendance/repository";
import { listExams } from "@/lib/exams/repository";
import { listExamSubjects } from "@/lib/exam-subjects/repository";
import { listResults } from "@/lib/results/repository";
import { listTimetableEntries } from "@/lib/timetable/repository";
import { listNotices } from "@/lib/notices/repository";
import { toPagination } from "@/lib/api/validation";

/**
 * REGRESSION (Phase 4 audit): list queries must end with a unique sort key,
 * otherwise rows sharing the sort value can repeat or vanish between pages.
 * Postgres usually returns such ties in a stable order on small tables, so the
 * integration "walk every page" tests cannot reliably catch this; this test
 * checks the query itself. Unique keys: id, subjects.code,
 * teachers.employeeCode, students.admissionNumber.
 */

function recordingClient() {
  const orders: string[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "or", "in", "gte", "lte", "range"]) builder[method] = () => builder;
  builder.order = (column: string) => {
    orders.push(column);
    return builder;
  };
  builder.then = (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null, count: 0 });
  return { client: { from: () => builder } as never, orders };
}

const pagination = toPagination({ page: 1, limit: 20 });
const UNIQUE_LAST = ["id", "code", "employeeCode", "admissionNumber"];

describe.each([
  ["academic years", (c: never) => listAcademicYears(c, pagination)],
  ["classes", (c: never) => listClasses(c, pagination, {})],
  ["subjects", (c: never) => listSubjects(c, pagination)],
  ["teachers", (c: never) => listTeachers(c, pagination, {})],
  ["students", (c: never) => listStudents(c, pagination, {})],
  ["enrollments", (c: never) => listEnrollments(c, pagination, {})],
  ["teacher assignments", (c: never) => listAssignments(c, pagination, {})],
  ["student attendance", (c: never) => listStudentAttendance(c, pagination, {})],
  ["teacher attendance", (c: never) => listTeacherAttendance(c, pagination, {})],
  ["exams", (c: never) => listExams(c, pagination, {})],
  ["exam subjects", (c: never) => listExamSubjects(c, pagination, {})],
  ["results", (c: never) => listResults(c, pagination, {})],
  ["timetable entries", (c: never) => listTimetableEntries(c, pagination, {})],
  ["notices", (c: never) => listNotices(c, pagination, {}, true)],
])("%s list", (_name, list) => {
  it("ends its ordering with a unique column", async () => {
    const { client, orders } = recordingClient();
    await list(client);
    expect(orders.length).toBeGreaterThan(0);
    expect(UNIQUE_LAST).toContain(orders.at(-1));
  });
});
