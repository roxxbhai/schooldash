-- =============================================================================
-- Migration 2: privileges, RLS helper functions, and Row Level Security policies
-- =============================================================================
--
-- Access model (see db/README.md for the full matrix):
--   anon           → nothing.
--   authenticated  → only what the policies below allow, and only for ACTIVE
--                    application users (helpers return NULL/false otherwise).
--   service_role   → bypasses RLS; used only by lib/supabase/admin.ts for
--                    account provisioning (see migration 3).
--
-- Every policy targets `to authenticated` AND carries a row predicate, so
-- being signed in is never sufficient on its own.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Table privileges
-- -----------------------------------------------------------------------------
-- Supabase's default privileges grant ALL on new public tables to anon and
-- authenticated. Start from nothing and grant only what the policies support.

revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant all on all tables in schema public to service_role;

-- Future objects in public get no implicit access either; each migration must
-- grant explicitly (this matches Supabase's 2026 Data API default).
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- Reference data and per-role data: read via RLS; admins write via RLS.
grant select, insert, update on
  "academicYears", "classes", "subjects", "exams", "examSubjects",
  "studentEnrollments", "studentAttendance", "teacherAttendance", "results"
  to authenticated;

-- Rows that are configuration rather than history may also be deleted by admins.
grant select, insert, update, delete on
  "teacherAssignments", "timetableEntries", "notices", "noticeAudiences"
  to authenticated;

-- Profiles are created only by the provisioning service (service_role);
-- admins may correct profile details.
grant select, update on "students", "teachers" to authenticated;

-- users: readable per policy; only fullName/phone are ever writable by end
-- users or admins through the API. role, isActive, email and authUserId change
-- only through the provisioning service.
grant select on "users" to authenticated;
grant update ("fullName", "phone") on "users" to authenticated;

-- auditLogs: admins read; nobody writes through the API.
grant select on "auditLogs" to authenticated;


-- -----------------------------------------------------------------------------
-- 2. Private helper schema
-- -----------------------------------------------------------------------------
-- `app` is not in the Data API's exposed schemas, so these functions cannot be
-- called over HTTP. They are SECURITY DEFINER so that policies can look up the
-- caller's user/teacher/student rows without recursively applying RLS. Each
-- one derives identity solely from auth.uid() and pins search_path.

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

create function app."currentUserId"()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select u."id" from public."users" u
  where u."authUserId" = auth.uid() and u."isActive"
$$;

create function app."currentRole"()
returns public."userRole"
language sql stable security definer
set search_path = ''
as $$
  select u."role" from public."users" u
  where u."authUserId" = auth.uid() and u."isActive"
$$;

create function app."isAdmin"()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(app."currentRole"() = 'admin', false)
$$;

create function app."currentStudentId"()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select s."id" from public."students" s
  where s."userId" = app."currentUserId"()
$$;

create function app."currentTeacherId"()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select t."id" from public."teachers" t
  where t."userId" = app."currentUserId"()
$$;

-- Assigned to any subject in the class, or its class teacher.
create function app."teachesClass"("targetClassId" uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public."teacherAssignments" ta
    where ta."classId" = "targetClassId"
      and ta."teacherId" = app."currentTeacherId"()
  ) or exists (
    select 1 from public."classes" c
    where c."id" = "targetClassId"
      and c."classTeacherId" = app."currentTeacherId"()
  )
$$;

-- Assigned to exactly this class + subject.
create function app."teachesClassSubject"("targetClassId" uuid, "targetSubjectId" uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public."teacherAssignments" ta
    where ta."classId" = "targetClassId"
      and ta."subjectId" = "targetSubjectId"
      and ta."teacherId" = app."currentTeacherId"()
  )
$$;

-- Assigned to the class + subject of an exam paper.
create function app."teachesExamSubject"("targetExamSubjectId" uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public."examSubjects" es
    where es."id" = "targetExamSubjectId"
      and app."teachesClassSubject"(es."classId", es."subjectId")
  )
$$;

create function app."isEnrolledIn"("targetClassId" uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public."studentEnrollments" e
    where e."classId" = "targetClassId"
      and e."studentId" = app."currentStudentId"()
  )
$$;

-- The current teacher teaches some class the student is (or was) enrolled in.
create function app."teachesStudent"("targetStudentId" uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public."studentEnrollments" e
    where e."studentId" = "targetStudentId"
      and app."teachesClass"(e."classId")
  )
$$;

-- Notice-audience check: published, due, and addressed to the caller's role
-- or to a class the caller is enrolled in / teaches.
create function app."canViewNotice"("targetNoticeId" uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public."notices" n
    join public."noticeAudiences" a on a."noticeId" = n."id"
    where n."id" = "targetNoticeId"
      and n."status" = 'published'
      and n."publishedAt" <= now()
      and (
        a."audienceRole" = app."currentRole"()
        or (a."classId" is not null
            and (app."isEnrolledIn"(a."classId") or app."teachesClass"(a."classId")))
      )
  )
$$;

revoke all on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated;


-- -----------------------------------------------------------------------------
-- 3. Role-escalation guard on users
-- -----------------------------------------------------------------------------
-- Column grants already stop authenticated users from writing role/isActive.
-- This trigger is defense in depth: whichever path an UPDATE takes, a signed-in
-- user can never change their own role, active status, or identity link.
-- (Service-role calls have no auth.uid() and are not affected.)

create function app."preventSelfPrivilegeChange"()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and old."authUserId" = auth.uid()
     and (new."role" is distinct from old."role"
          or new."isActive" is distinct from old."isActive"
          or new."authUserId" is distinct from old."authUserId"
          or new."email" is distinct from old."email") then
    raise exception 'users cannot change their own role, status, or identity'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke all on function app."preventSelfPrivilegeChange"() from public, anon, authenticated;

create trigger "usersPreventSelfPrivilegeChange"
  before update on "users"
  for each row execute function app."preventSelfPrivilegeChange"();


-- -----------------------------------------------------------------------------
-- 4. Policies
-- -----------------------------------------------------------------------------
-- Helper calls are wrapped in (select …) so Postgres evaluates them once per
-- statement instead of once per row.

-- users -----------------------------------------------------------------------
create policy "usersSelectOwn" on "users" for select to authenticated
  using ("authUserId" = (select auth.uid()));       -- includes inactive: lets the app report ACCOUNT_INACTIVE
create policy "usersSelectAdmin" on "users" for select to authenticated
  using ((select app."isAdmin"()));
create policy "usersSelectTaughtStudents" on "users" for select to authenticated
  using (exists (
    select 1 from "students" s
    where s."userId" = "users"."id" and app."teachesStudent"(s."id")
  ));
create policy "usersUpdateOwn" on "users" for update to authenticated
  using ("id" = (select app."currentUserId"()))
  with check ("id" = (select app."currentUserId"()));
create policy "usersUpdateAdmin" on "users" for update to authenticated
  using ((select app."isAdmin"()))
  with check ((select app."isAdmin"()));

-- students --------------------------------------------------------------------
create policy "studentsSelect" on "students" for select to authenticated
  using (
    (select app."isAdmin"())
    or "id" = (select app."currentStudentId"())
    or app."teachesStudent"("id")
  );
create policy "studentsUpdateAdmin" on "students" for update to authenticated
  using ((select app."isAdmin"())) with check ((select app."isAdmin"()));

-- teachers --------------------------------------------------------------------
-- Staff directory: any active user may read (names for timetables, class teacher).
create policy "teachersSelect" on "teachers" for select to authenticated
  using ((select app."currentUserId"()) is not null);
create policy "teachersUpdateAdmin" on "teachers" for update to authenticated
  using ((select app."isAdmin"())) with check ((select app."isAdmin"()));

-- academicYears, subjects, exams: school-wide reference data -------------------
create policy "academicYearsSelect" on "academicYears" for select to authenticated
  using ((select app."currentUserId"()) is not null);
create policy "academicYearsWriteAdmin" on "academicYears" for all to authenticated
  using ((select app."isAdmin"())) with check ((select app."isAdmin"()));

create policy "subjectsSelect" on "subjects" for select to authenticated
  using ((select app."currentUserId"()) is not null);
create policy "subjectsWriteAdmin" on "subjects" for all to authenticated
  using ((select app."isAdmin"())) with check ((select app."isAdmin"()));

create policy "examsSelect" on "exams" for select to authenticated
  using ((select app."currentUserId"()) is not null);
create policy "examsWriteAdmin" on "exams" for all to authenticated
  using ((select app."isAdmin"())) with check ((select app."isAdmin"()));

-- classes ---------------------------------------------------------------------
create policy "classesSelect" on "classes" for select to authenticated
  using (
    (select app."isAdmin"())
    or app."teachesClass"("id")
    or app."isEnrolledIn"("id")
  );
create policy "classesWriteAdmin" on "classes" for all to authenticated
  using ((select app."isAdmin"())) with check ((select app."isAdmin"()));

-- studentEnrollments ----------------------------------------------------------
create policy "studentEnrollmentsSelect" on "studentEnrollments" for select to authenticated
  using (
    (select app."isAdmin"())
    or "studentId" = (select app."currentStudentId"())
    or app."teachesClass"("classId")
  );
create policy "studentEnrollmentsWriteAdmin" on "studentEnrollments" for all to authenticated
  using ((select app."isAdmin"())) with check ((select app."isAdmin"()));

-- teacherAssignments ----------------------------------------------------------
create policy "teacherAssignmentsSelect" on "teacherAssignments" for select to authenticated
  using (
    (select app."isAdmin"())
    or "teacherId" = (select app."currentTeacherId"())
    or app."isEnrolledIn"("classId")
  );
create policy "teacherAssignmentsWriteAdmin" on "teacherAssignments" for all to authenticated
  using ((select app."isAdmin"())) with check ((select app."isAdmin"()));

-- studentAttendance -----------------------------------------------------------
create policy "studentAttendanceSelect" on "studentAttendance" for select to authenticated
  using (
    (select app."isAdmin"())
    or "studentId" = (select app."currentStudentId"())
    or app."teachesClass"("classId")
  );
create policy "studentAttendanceInsert" on "studentAttendance" for insert to authenticated
  with check (
    "markedByUserId" = (select app."currentUserId"())
    and ((select app."isAdmin"()) or app."teachesClass"("classId"))
  );
create policy "studentAttendanceUpdate" on "studentAttendance" for update to authenticated
  using ((select app."isAdmin"()) or app."teachesClass"("classId"))
  with check (
    "markedByUserId" = (select app."currentUserId"())
    and ((select app."isAdmin"()) or app."teachesClass"("classId"))
  );

-- teacherAttendance -----------------------------------------------------------
create policy "teacherAttendanceSelect" on "teacherAttendance" for select to authenticated
  using (
    (select app."isAdmin"())
    or "teacherId" = (select app."currentTeacherId"())
  );
create policy "teacherAttendanceInsertAdmin" on "teacherAttendance" for insert to authenticated
  with check ((select app."isAdmin"()) and "markedByUserId" = (select app."currentUserId"()));
create policy "teacherAttendanceUpdateAdmin" on "teacherAttendance" for update to authenticated
  using ((select app."isAdmin"()))
  with check ((select app."isAdmin"()) and "markedByUserId" = (select app."currentUserId"()));

-- examSubjects ----------------------------------------------------------------
create policy "examSubjectsSelect" on "examSubjects" for select to authenticated
  using (
    (select app."isAdmin"())
    or app."teachesClass"("classId")
    or app."isEnrolledIn"("classId")
  );
create policy "examSubjectsWriteAdmin" on "examSubjects" for all to authenticated
  using ((select app."isAdmin"())) with check ((select app."isAdmin"()));

-- results ---------------------------------------------------------------------
create policy "resultsSelect" on "results" for select to authenticated
  using (
    (select app."isAdmin"())
    or "studentId" = (select app."currentStudentId"())
    or app."teachesExamSubject"("examSubjectId")
  );
create policy "resultsInsert" on "results" for insert to authenticated
  with check (
    "enteredByUserId" = (select app."currentUserId"())
    and ((select app."isAdmin"()) or app."teachesExamSubject"("examSubjectId"))
  );
create policy "resultsUpdate" on "results" for update to authenticated
  using ((select app."isAdmin"()) or app."teachesExamSubject"("examSubjectId"))
  with check (
    "enteredByUserId" = (select app."currentUserId"())
    and ((select app."isAdmin"()) or app."teachesExamSubject"("examSubjectId"))
  );

-- timetableEntries ------------------------------------------------------------
create policy "timetableEntriesSelect" on "timetableEntries" for select to authenticated
  using (
    (select app."isAdmin"())
    or "teacherId" = (select app."currentTeacherId"())
    or app."teachesClass"("classId")
    or app."isEnrolledIn"("classId")
  );
create policy "timetableEntriesWriteAdmin" on "timetableEntries" for all to authenticated
  using ((select app."isAdmin"())) with check ((select app."isAdmin"()));

-- notices / noticeAudiences ---------------------------------------------------
create policy "noticesSelect" on "notices" for select to authenticated
  using ((select app."isAdmin"()) or app."canViewNotice"("id"));
create policy "noticesInsertAdmin" on "notices" for insert to authenticated
  with check ((select app."isAdmin"()) and "createdByUserId" = (select app."currentUserId"()));
create policy "noticesUpdateAdmin" on "notices" for update to authenticated
  using ((select app."isAdmin"())) with check ((select app."isAdmin"()));
create policy "noticesDeleteAdmin" on "notices" for delete to authenticated
  using ((select app."isAdmin"()));

create policy "noticeAudiencesSelect" on "noticeAudiences" for select to authenticated
  using ((select app."isAdmin"()) or app."canViewNotice"("noticeId"));
create policy "noticeAudiencesWriteAdmin" on "noticeAudiences" for all to authenticated
  using ((select app."isAdmin"())) with check ((select app."isAdmin"()));

-- auditLogs -------------------------------------------------------------------
create policy "auditLogsSelectAdmin" on "auditLogs" for select to authenticated
  using ((select app."isAdmin"()));
