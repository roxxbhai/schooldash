/**
 * Fixture school for RLS integration tests. Inserted inside a transaction
 * that is always rolled back (see db.ts), so these rows never persist.
 *
 *   Class 10-A: studentA enrolled; teacherA teaches Maths; Science paper has
 *               NO assigned teacher.
 *   Class 10-B: studentB enrolled; teacherB teaches Science and is class teacher.
 *   inactiveStudent: deactivated account enrolled in 10-A.
 *   unprovisioned: Auth identity with no application users row.
 */

const id = (prefix: string, n: number) =>
  `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const ids = {
  auth: {
    admin: id("a0000001", 1),
    studentA: id("a0000001", 2),
    studentB: id("a0000001", 3),
    teacherA: id("a0000001", 4),
    teacherB: id("a0000001", 5),
    inactiveStudent: id("a0000001", 6),
    unprovisioned: id("a0000001", 7),
  },
  user: {
    admin: id("b0000001", 1),
    studentA: id("b0000001", 2),
    studentB: id("b0000001", 3),
    teacherA: id("b0000001", 4),
    teacherB: id("b0000001", 5),
    inactiveStudent: id("b0000001", 6),
  },
  student: { a: id("c0000001", 1), b: id("c0000001", 2), inactive: id("c0000001", 3) },
  teacher: { a: id("d0000001", 1), b: id("d0000001", 2) },
  year: id("e0000001", 1),
  class: { tenA: id("e0000002", 1), tenB: id("e0000002", 2) },
  subject: { maths: id("e0000003", 1), science: id("e0000003", 2) },
  exam: id("e0000004", 1),
  examSubject: { tenAMaths: id("e0000005", 1), tenAScience: id("e0000005", 2), tenBScience: id("e0000005", 3) },
  result: { aMaths: id("e0000006", 1), aScience: id("e0000006", 2), bScience: id("e0000006", 3) },
  attendance: { a: id("e0000007", 1), b: id("e0000007", 2) },
  notice: { allStudents: id("e0000008", 1), classTenB: id("e0000008", 2), draft: id("e0000008", 3), teachersOnly: id("e0000008", 4) },
} as const;

export function seedSql(): string {
  const a = ids.auth;
  const u = ids.user;
  const email = (who: string) => `it-${who.toLowerCase()}@example.com`;

  const authRows = Object.entries(a)
    .map(([who, authId]) => `('${authId}', '${email(who)}', 'authenticated', 'authenticated')`)
    .join(",\n");

  const userRow = (who: keyof typeof u, role: string, active = true) =>
    `('${u[who]}', '${a[who]}', '${email(who)}', 'IT ${who}', '${role}', ${active}, ${active ? "null" : "now()"})`;

  return `
insert into auth.users (id, email, aud, role) values
${authRows};

insert into public."users" ("id", "authUserId", "email", "fullName", "role", "isActive", "deactivatedAt") values
${userRow("admin", "admin")},
${userRow("studentA", "student")},
${userRow("studentB", "student")},
${userRow("teacherA", "teacher")},
${userRow("teacherB", "teacher")},
${userRow("inactiveStudent", "student", false)};

insert into public."students" ("id", "userId", "admissionNumber") values
('${ids.student.a}', '${u.studentA}', 'IT-ADM-A'),
('${ids.student.b}', '${u.studentB}', 'IT-ADM-B'),
('${ids.student.inactive}', '${u.inactiveStudent}', 'IT-ADM-X');

insert into public."teachers" ("id", "userId", "employeeCode") values
('${ids.teacher.a}', '${u.teacherA}', 'IT-EMP-A'),
('${ids.teacher.b}', '${u.teacherB}', 'IT-EMP-B');

insert into public."academicYears" ("id", "name", "startDate", "endDate") values
('${ids.year}', 'IT-FIXTURE-YEAR', '2015-04-01', '2016-03-31');

insert into public."classes" ("id", "academicYearId", "name", "section", "classTeacherId") values
('${ids.class.tenA}', '${ids.year}', '10', 'A', null),
('${ids.class.tenB}', '${ids.year}', '10', 'B', '${ids.teacher.b}');

insert into public."subjects" ("id", "code", "name") values
('${ids.subject.maths}', 'IT-MATH', 'Maths'),
('${ids.subject.science}', 'IT-SCI', 'Science');

insert into public."teacherAssignments" ("teacherId", "classId", "subjectId") values
('${ids.teacher.a}', '${ids.class.tenA}', '${ids.subject.maths}'),
('${ids.teacher.b}', '${ids.class.tenB}', '${ids.subject.science}');

insert into public."studentEnrollments" ("studentId", "classId", "academicYearId", "rollNumber") values
('${ids.student.a}', '${ids.class.tenA}', '${ids.year}', 1),
('${ids.student.b}', '${ids.class.tenB}', '${ids.year}', 1),
('${ids.student.inactive}', '${ids.class.tenA}', '${ids.year}', 2);

insert into public."studentAttendance" ("id", "studentId", "classId", "attendanceDate", "status", "markedByUserId") values
('${ids.attendance.a}', '${ids.student.a}', '${ids.class.tenA}', '2015-06-01', 'present', '${u.teacherA}'),
('${ids.attendance.b}', '${ids.student.b}', '${ids.class.tenB}', '2015-06-01', 'absent', '${u.teacherB}');

insert into public."exams" ("id", "academicYearId", "name") values
('${ids.exam}', '${ids.year}', 'IT Term 1');

insert into public."examSubjects" ("id", "examId", "classId", "academicYearId", "subjectId", "maxMarks") values
('${ids.examSubject.tenAMaths}', '${ids.exam}', '${ids.class.tenA}', '${ids.year}', '${ids.subject.maths}', 100),
('${ids.examSubject.tenAScience}', '${ids.exam}', '${ids.class.tenA}', '${ids.year}', '${ids.subject.science}', 100),
('${ids.examSubject.tenBScience}', '${ids.exam}', '${ids.class.tenB}', '${ids.year}', '${ids.subject.science}', 100);

insert into public."results" ("id", "examSubjectId", "studentId", "classId", "marksObtained", "enteredByUserId") values
('${ids.result.aMaths}', '${ids.examSubject.tenAMaths}', '${ids.student.a}', '${ids.class.tenA}', 88, '${u.teacherA}'),
('${ids.result.aScience}', '${ids.examSubject.tenAScience}', '${ids.student.a}', '${ids.class.tenA}', 75, '${u.admin}'),
('${ids.result.bScience}', '${ids.examSubject.tenBScience}', '${ids.student.b}', '${ids.class.tenB}', 64, '${u.teacherB}');

insert into public."notices" ("id", "title", "body", "status", "publishedAt", "createdByUserId") values
('${ids.notice.allStudents}', 'IT all students', 'body', 'published', now() - interval '1 hour', '${u.admin}'),
('${ids.notice.classTenB}', 'IT class 10-B', 'body', 'published', now() - interval '1 hour', '${u.admin}'),
('${ids.notice.draft}', 'IT draft', 'body', 'draft', null, '${u.admin}'),
('${ids.notice.teachersOnly}', 'IT teachers', 'body', 'published', now() - interval '1 hour', '${u.admin}');

insert into public."noticeAudiences" ("noticeId", "audienceRole", "classId") values
('${ids.notice.allStudents}', 'student', null),
('${ids.notice.classTenB}', null, '${ids.class.tenB}'),
('${ids.notice.draft}', 'student', null),
('${ids.notice.teachersOnly}', 'teacher', null);

insert into public."auditLogs" ("actorUserId", "action", "entityType") values
('${u.admin}', 'it.seed', 'fixture');
`;
}
