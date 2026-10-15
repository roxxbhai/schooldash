-- =============================================================================
-- Migration 4: advisor fixes (no change to who can access what)
-- =============================================================================
--
-- 1. multiple_permissive_policies: the `for all` admin policies also applied
--    to SELECT, overlapping each table's SELECT policy (which already admits
--    admins), and users had separate own/admin/teacher policies. Postgres runs
--    every permissive policy per query, so each is replaced by exactly one
--    policy per command with the same combined predicate.
-- 2. unindexed_foreign_keys: composite foreign keys get covering indexes.
-- =============================================================================


-- users: one SELECT and one UPDATE policy ----------------------------------------
drop policy "usersSelectOwn" on "users";
drop policy "usersSelectAdmin" on "users";
drop policy "usersSelectTaughtStudents" on "users";
drop policy "usersUpdateOwn" on "users";
drop policy "usersUpdateAdmin" on "users";

create policy "usersSelect" on "users" for select to authenticated
  using (
    -- Own row, matched by auth id so inactive users can read their status.
    "authUserId" = (select auth.uid())
    or (select app."isAdmin"())
    -- Teachers see the user rows of students they teach.
    or exists (
      select 1 from "students" s
      where s."userId" = "users"."id" and app."teachesStudent"(s."id")
    )
  );

-- Column grants limit what is writable to fullName and phone.
create policy "usersUpdate" on "users" for update to authenticated
  using ("id" = (select app."currentUserId"()) or (select app."isAdmin"()))
  with check ("id" = (select app."currentUserId"()) or (select app."isAdmin"()));


-- Admin write policies: split `for all` into the commands actually granted ----
drop policy "academicYearsWriteAdmin" on "academicYears";
create policy "academicYearsInsertAdmin" on "academicYears" for insert to authenticated
  with check ((select app."isAdmin"()));
create policy "academicYearsUpdateAdmin" on "academicYears" for update to authenticated
  using ((select app."isAdmin"())) with check ((select app."isAdmin"()));

drop policy "subjectsWriteAdmin" on "subjects";
create policy "subjectsInsertAdmin" on "subjects" for insert to authenticated
  with check ((select app."isAdmin"()));
create policy "subjectsUpdateAdmin" on "subjects" for update to authenticated
  using ((select app."isAdmin"())) with check ((select app."isAdmin"()));

drop policy "examsWriteAdmin" on "exams";
create policy "examsInsertAdmin" on "exams" for insert to authenticated
  with check ((select app."isAdmin"()));
create policy "examsUpdateAdmin" on "exams" for update to authenticated
  using ((select app."isAdmin"())) with check ((select app."isAdmin"()));

drop policy "classesWriteAdmin" on "classes";
create policy "classesInsertAdmin" on "classes" for insert to authenticated
  with check ((select app."isAdmin"()));
create policy "classesUpdateAdmin" on "classes" for update to authenticated
  using ((select app."isAdmin"())) with check ((select app."isAdmin"()));

drop policy "studentEnrollmentsWriteAdmin" on "studentEnrollments";
create policy "studentEnrollmentsInsertAdmin" on "studentEnrollments" for insert to authenticated
  with check ((select app."isAdmin"()));
create policy "studentEnrollmentsUpdateAdmin" on "studentEnrollments" for update to authenticated
  using ((select app."isAdmin"())) with check ((select app."isAdmin"()));

drop policy "examSubjectsWriteAdmin" on "examSubjects";
create policy "examSubjectsInsertAdmin" on "examSubjects" for insert to authenticated
  with check ((select app."isAdmin"()));
create policy "examSubjectsUpdateAdmin" on "examSubjects" for update to authenticated
  using ((select app."isAdmin"())) with check ((select app."isAdmin"()));

drop policy "teacherAssignmentsWriteAdmin" on "teacherAssignments";
create policy "teacherAssignmentsInsertAdmin" on "teacherAssignments" for insert to authenticated
  with check ((select app."isAdmin"()));
create policy "teacherAssignmentsUpdateAdmin" on "teacherAssignments" for update to authenticated
  using ((select app."isAdmin"())) with check ((select app."isAdmin"()));
create policy "teacherAssignmentsDeleteAdmin" on "teacherAssignments" for delete to authenticated
  using ((select app."isAdmin"()));

drop policy "timetableEntriesWriteAdmin" on "timetableEntries";
create policy "timetableEntriesInsertAdmin" on "timetableEntries" for insert to authenticated
  with check ((select app."isAdmin"()));
create policy "timetableEntriesUpdateAdmin" on "timetableEntries" for update to authenticated
  using ((select app."isAdmin"())) with check ((select app."isAdmin"()));
create policy "timetableEntriesDeleteAdmin" on "timetableEntries" for delete to authenticated
  using ((select app."isAdmin"()));

drop policy "noticeAudiencesWriteAdmin" on "noticeAudiences";
create policy "noticeAudiencesInsertAdmin" on "noticeAudiences" for insert to authenticated
  with check ((select app."isAdmin"()));
create policy "noticeAudiencesUpdateAdmin" on "noticeAudiences" for update to authenticated
  using ((select app."isAdmin"())) with check ((select app."isAdmin"()));
create policy "noticeAudiencesDeleteAdmin" on "noticeAudiences" for delete to authenticated
  using ((select app."isAdmin"()));


-- Covering indexes for composite foreign keys -----------------------------------
create index "studentsUserRoleIdx"              on "students" ("userId", "role");
create index "teachersUserRoleIdx"              on "teachers" ("userId", "role");
create index "studentEnrollmentsClassYearIdx"   on "studentEnrollments" ("classId", "academicYearId");
create index "studentAttendanceEnrollmentIdx"   on "studentAttendance" ("studentId", "classId");
create index "examSubjectsExamYearIdx"          on "examSubjects" ("examId", "academicYearId");
create index "examSubjectsClassYearIdx"         on "examSubjects" ("classId", "academicYearId");
create index "resultsExamSubjectClassIdx"       on "results" ("examSubjectId", "classId");
create index "resultsEnrollmentIdx"             on "results" ("studentId", "classId");
create index "timetableEntriesAssignmentIdx"    on "timetableEntries" ("teacherId", "classId", "subjectId");
