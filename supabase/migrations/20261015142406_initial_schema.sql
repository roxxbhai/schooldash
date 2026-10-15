-- =============================================================================
-- School Dashboard Management System — PostgreSQL schema (Supabase)
-- =============================================================================
--
-- Migration 1 of the schema. Tables, constraints, indexes and triggers.
-- Grants, RLS policies and helper functions: 20261015142408_rls_policies_and_grants.sql.
-- Account provisioning: 20261015142410_account_provisioning.sql.
-- Design notes: db/README.md. Never edit an applied migration; add a new one.
--
-- Conventions
--   * camelCase table and column names, always double-quoted.
--   * UUID primary keys generated with gen_random_uuid() (built in, PG 13+).
--   * Timestamps are timestamptz; calendar dates are date.
--   * Historical records are preserved: people are deactivated, not deleted.
--     Foreign keys to people, classes, exams, etc. use ON DELETE RESTRICT.
--     ON DELETE CASCADE is used only for rows that are owned parts of their
--     parent (noticeAudiences).
--   * Tables are created in foreign-key dependency order.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

create type "userRole" as enum ('admin', 'teacher', 'student');

create type "attendanceStatus" as enum ('present', 'absent', 'late', 'leave');

create type "noticeStatus" as enum ('draft', 'published', 'archived');


-- -----------------------------------------------------------------------------
-- Shared trigger function: keep "updatedAt" current on every UPDATE.
-- -----------------------------------------------------------------------------
-- All functions pin search_path to '' (and schema-qualify table names) so
-- they cannot be redirected to look-alike objects in another schema.

create function "setUpdatedAt"()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new."updatedAt" := now();
  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 1. users — application profile for every Supabase Auth account.
-- -----------------------------------------------------------------------------
-- One row per person who can sign in. "authUserId" links to Supabase Auth.
-- ON DELETE RESTRICT on auth.users means an auth account that owns history
-- cannot be hard-deleted; accounts are deactivated via "isActive" instead.
-- "role" is the single source of truth for authorization; users may never
-- change it themselves (enforced by RLS/grants, see db/README.md).

create table "users" (
  "id"            uuid primary key default gen_random_uuid(),
  "authUserId"    uuid not null unique
                    references auth.users ("id") on delete restrict,
  "email"         text not null,
  "fullName"      text not null,
  "phone"         text,
  "role"          "userRole" not null,
  "isActive"      boolean not null default true,
  "deactivatedAt" timestamptz,
  "createdAt"     timestamptz not null default now(),
  "updatedAt"     timestamptz not null default now(),

  constraint "usersFullNameNotBlank" check (length(trim("fullName")) > 0),
  constraint "usersEmailNotBlank"    check (length(trim("email")) > 0),
  -- A deactivation timestamp exists exactly when the account is inactive.
  constraint "usersDeactivationConsistent"
    check ("isActive" = ("deactivatedAt" is null)),
  -- Target for the (userId, role) composite FKs from students/teachers, which
  -- guarantee a profile row matches its user's role.
  constraint "usersIdRoleKey" unique ("id", "role")
);

-- Case-insensitive uniqueness for email addresses.
create unique index "usersEmailLowerKey" on "users" (lower("email"));
create index "usersRoleIdx" on "users" ("role");

create trigger "usersSetUpdatedAt"
  before update on "users"
  for each row execute function "setUpdatedAt"();


-- -----------------------------------------------------------------------------
-- 2. students — student-specific profile, 1:1 with a users row of role student.
-- -----------------------------------------------------------------------------

create table "students" (
  "id"              uuid primary key default gen_random_uuid(),
  "userId"          uuid not null unique,
  -- Fixed to 'student'; with the composite FK below this guarantees the
  -- linked user has role 'student' and blocks changing that user's role
  -- while the profile exists.
  "role"            "userRole" not null default 'student',
  "admissionNumber" text not null unique,
  "admissionDate"   date,
  "dateOfBirth"     date,
  "gender"          text,
  "bloodGroup"      text,
  "fatherName"      text,
  "motherName"      text,
  "address"         text,
  "createdAt"       timestamptz not null default now(),
  "updatedAt"       timestamptz not null default now(),

  constraint "studentsRoleIsStudent" check ("role" = 'student'),
  constraint "studentsAdmissionNumberNotBlank"
    check (length(trim("admissionNumber")) > 0),
  constraint "studentsUserFkey" foreign key ("userId", "role")
    references "users" ("id", "role") on update restrict on delete restrict
);

create trigger "studentsSetUpdatedAt"
  before update on "students"
  for each row execute function "setUpdatedAt"();


-- -----------------------------------------------------------------------------
-- 3. teachers — teacher-specific profile, 1:1 with a users row of role teacher.
-- -----------------------------------------------------------------------------

create table "teachers" (
  "id"             uuid primary key default gen_random_uuid(),
  "userId"         uuid not null unique,
  "role"           "userRole" not null default 'teacher',
  "employeeCode"   text not null unique,
  "qualification"  text,
  "dateOfJoining"  date,
  "createdAt"      timestamptz not null default now(),
  "updatedAt"      timestamptz not null default now(),

  constraint "teachersRoleIsTeacher" check ("role" = 'teacher'),
  constraint "teachersEmployeeCodeNotBlank"
    check (length(trim("employeeCode")) > 0),
  constraint "teachersUserFkey" foreign key ("userId", "role")
    references "users" ("id", "role") on update restrict on delete restrict
);

create trigger "teachersSetUpdatedAt"
  before update on "teachers"
  for each row execute function "setUpdatedAt"();


-- -----------------------------------------------------------------------------
-- 4. academicYears
-- -----------------------------------------------------------------------------

create table "academicYears" (
  "id"         uuid primary key default gen_random_uuid(),
  "name"       text not null unique,          -- e.g. '2026-2027'
  "startDate"  date not null,
  "endDate"    date not null,
  "isCurrent"  boolean not null default false,
  "createdAt"  timestamptz not null default now(),
  "updatedAt"  timestamptz not null default now(),

  constraint "academicYearsDateRange" check ("endDate" > "startDate")
);

-- At most one academic year may be marked current.
create unique index "academicYearsSingleCurrentKey"
  on "academicYears" ("isCurrent") where "isCurrent";

create trigger "academicYearsSetUpdatedAt"
  before update on "academicYears"
  for each row execute function "setUpdatedAt"();


-- -----------------------------------------------------------------------------
-- 5. classes — a class-section within one academic year (e.g. 10-A, 2026-27).
-- -----------------------------------------------------------------------------

create table "classes" (
  "id"              uuid primary key default gen_random_uuid(),
  "academicYearId"  uuid not null
                      references "academicYears" ("id") on delete restrict,
  "name"            text not null,              -- grade, e.g. '10'
  "section"         text not null,              -- e.g. 'A'
  -- Optional homeroom/class teacher. Cleared (not cascaded) if the teacher
  -- row is ever removed; teachers are normally deactivated, not deleted.
  "classTeacherId"  uuid references "teachers" ("id") on delete set null,
  "roomNumber"      text,
  "createdAt"       timestamptz not null default now(),
  "updatedAt"       timestamptz not null default now(),

  constraint "classesNameSectionPerYearKey"
    unique ("academicYearId", "name", "section"),
  -- Target for composite FKs that must stay within the same academic year.
  constraint "classesIdAcademicYearKey" unique ("id", "academicYearId")
);

create index "classesClassTeacherIdx" on "classes" ("classTeacherId");

create trigger "classesSetUpdatedAt"
  before update on "classes"
  for each row execute function "setUpdatedAt"();


-- -----------------------------------------------------------------------------
-- 6. studentEnrollments — places a student in one class per academic year.
-- -----------------------------------------------------------------------------
-- History is kept: a new enrollment is created each year; old rows remain.

create table "studentEnrollments" (
  "id"              uuid primary key default gen_random_uuid(),
  "studentId"       uuid not null references "students" ("id") on delete restrict,
  "classId"         uuid not null,
  "academicYearId"  uuid not null,
  "rollNumber"      integer,
  "enrolledOn"      date not null default current_date,
  "createdAt"       timestamptz not null default now(),
  "updatedAt"       timestamptz not null default now(),

  constraint "studentEnrollmentsRollNumberPositive"
    check ("rollNumber" is null or "rollNumber" > 0),
  -- The class must belong to the enrollment's academic year.
  constraint "studentEnrollmentsClassFkey" foreign key ("classId", "academicYearId")
    references "classes" ("id", "academicYearId") on delete restrict,
  -- A student is enrolled in at most one class per academic year.
  constraint "studentEnrollmentsStudentYearKey" unique ("studentId", "academicYearId"),
  -- Roll numbers are unique within a class.
  constraint "studentEnrollmentsClassRollKey" unique ("classId", "rollNumber"),
  -- Target for composite FKs from attendance/results proving enrollment.
  constraint "studentEnrollmentsStudentClassKey" unique ("studentId", "classId")
);

create index "studentEnrollmentsAcademicYearIdx"
  on "studentEnrollments" ("academicYearId");

create trigger "studentEnrollmentsSetUpdatedAt"
  before update on "studentEnrollments"
  for each row execute function "setUpdatedAt"();


-- -----------------------------------------------------------------------------
-- 7. subjects — catalogue of subjects taught at the school.
-- -----------------------------------------------------------------------------

create table "subjects" (
  "id"          uuid primary key default gen_random_uuid(),
  "code"        text not null unique,             -- e.g. 'MATH'
  "name"        text not null,
  "description" text,
  "createdAt"   timestamptz not null default now(),
  "updatedAt"   timestamptz not null default now(),

  constraint "subjectsCodeNotBlank" check (length(trim("code")) > 0),
  constraint "subjectsNameNotBlank" check (length(trim("name")) > 0)
);

create trigger "subjectsSetUpdatedAt"
  before update on "subjects"
  for each row execute function "setUpdatedAt"();


-- -----------------------------------------------------------------------------
-- 8. teacherAssignments — which teacher teaches which subject to which class.
-- -----------------------------------------------------------------------------
-- This table is the basis of every teacher "assignment check" in RLS.

create table "teacherAssignments" (
  "id"         uuid primary key default gen_random_uuid(),
  "teacherId"  uuid not null references "teachers" ("id") on delete restrict,
  "classId"    uuid not null references "classes" ("id") on delete restrict,
  "subjectId"  uuid not null references "subjects" ("id") on delete restrict,
  "createdAt"  timestamptz not null default now(),
  "updatedAt"  timestamptz not null default now(),

  constraint "teacherAssignmentsKey" unique ("teacherId", "classId", "subjectId")
);

create index "teacherAssignmentsClassIdx"   on "teacherAssignments" ("classId");
create index "teacherAssignmentsSubjectIdx" on "teacherAssignments" ("subjectId");

create trigger "teacherAssignmentsSetUpdatedAt"
  before update on "teacherAssignments"
  for each row execute function "setUpdatedAt"();


-- -----------------------------------------------------------------------------
-- 9. studentAttendance — one row per student per day.
-- -----------------------------------------------------------------------------

create table "studentAttendance" (
  "id"              uuid primary key default gen_random_uuid(),
  "studentId"       uuid not null,
  "classId"         uuid not null,
  "attendanceDate"  date not null,
  "status"          "attendanceStatus" not null,
  "remarks"         text,
  "markedByUserId"  uuid not null references "users" ("id") on delete restrict,
  "createdAt"       timestamptz not null default now(),
  "updatedAt"       timestamptz not null default now(),

  -- The student must be enrolled in the class the attendance is recorded for.
  constraint "studentAttendanceEnrollmentFkey" foreign key ("studentId", "classId")
    references "studentEnrollments" ("studentId", "classId") on delete restrict,
  constraint "studentAttendanceStudentDateKey" unique ("studentId", "attendanceDate")
);

create index "studentAttendanceClassDateIdx"
  on "studentAttendance" ("classId", "attendanceDate");
create index "studentAttendanceMarkedByIdx"
  on "studentAttendance" ("markedByUserId");

create trigger "studentAttendanceSetUpdatedAt"
  before update on "studentAttendance"
  for each row execute function "setUpdatedAt"();


-- -----------------------------------------------------------------------------
-- 10. teacherAttendance — one row per teacher per day.
-- -----------------------------------------------------------------------------

create table "teacherAttendance" (
  "id"              uuid primary key default gen_random_uuid(),
  "teacherId"       uuid not null references "teachers" ("id") on delete restrict,
  "attendanceDate"  date not null,
  "status"          "attendanceStatus" not null,
  "remarks"         text,
  "markedByUserId"  uuid not null references "users" ("id") on delete restrict,
  "createdAt"       timestamptz not null default now(),
  "updatedAt"       timestamptz not null default now(),

  constraint "teacherAttendanceTeacherDateKey" unique ("teacherId", "attendanceDate")
);

create index "teacherAttendanceDateIdx"
  on "teacherAttendance" ("attendanceDate");
create index "teacherAttendanceMarkedByIdx"
  on "teacherAttendance" ("markedByUserId");

create trigger "teacherAttendanceSetUpdatedAt"
  before update on "teacherAttendance"
  for each row execute function "setUpdatedAt"();


-- -----------------------------------------------------------------------------
-- 11. exams — an examination event within an academic year (e.g. Term 1).
-- -----------------------------------------------------------------------------

create table "exams" (
  "id"              uuid primary key default gen_random_uuid(),
  "academicYearId"  uuid not null
                      references "academicYears" ("id") on delete restrict,
  "name"            text not null,
  "startDate"       date,
  "endDate"         date,
  "createdAt"       timestamptz not null default now(),
  "updatedAt"       timestamptz not null default now(),

  constraint "examsNameNotBlank" check (length(trim("name")) > 0),
  constraint "examsDateRange"
    check ("startDate" is null or "endDate" is null or "endDate" >= "startDate"),
  constraint "examsNamePerYearKey" unique ("academicYearId", "name"),
  constraint "examsIdAcademicYearKey" unique ("id", "academicYearId")
);

create trigger "examsSetUpdatedAt"
  before update on "exams"
  for each row execute function "setUpdatedAt"();


-- -----------------------------------------------------------------------------
-- 12. examSubjects — a subject paper of an exam for a specific class.
-- -----------------------------------------------------------------------------
-- Defines the maximum (and pass) marks that results are validated against.

create table "examSubjects" (
  "id"              uuid primary key default gen_random_uuid(),
  "examId"          uuid not null,
  "classId"         uuid not null,
  "academicYearId"  uuid not null,
  "subjectId"       uuid not null references "subjects" ("id") on delete restrict,
  "examDate"        date,
  "maxMarks"        numeric(6, 2) not null,
  "passMarks"       numeric(6, 2),
  "createdAt"       timestamptz not null default now(),
  "updatedAt"       timestamptz not null default now(),

  constraint "examSubjectsMaxMarksPositive" check ("maxMarks" > 0),
  constraint "examSubjectsPassMarksInRange"
    check ("passMarks" is null or ("passMarks" >= 0 and "passMarks" <= "maxMarks")),
  -- Exam and class must belong to the same academic year.
  constraint "examSubjectsExamFkey" foreign key ("examId", "academicYearId")
    references "exams" ("id", "academicYearId") on delete restrict,
  constraint "examSubjectsClassFkey" foreign key ("classId", "academicYearId")
    references "classes" ("id", "academicYearId") on delete restrict,
  constraint "examSubjectsKey" unique ("examId", "classId", "subjectId"),
  -- Target for results' composite FK.
  constraint "examSubjectsIdClassKey" unique ("id", "classId")
);

create index "examSubjectsClassIdx"   on "examSubjects" ("classId");
create index "examSubjectsSubjectIdx" on "examSubjects" ("subjectId");

create trigger "examSubjectsSetUpdatedAt"
  before update on "examSubjects"
  for each row execute function "setUpdatedAt"();


-- -----------------------------------------------------------------------------
-- 13. results — marks obtained by a student in one exam subject.
-- -----------------------------------------------------------------------------

create table "results" (
  "id"              uuid primary key default gen_random_uuid(),
  "examSubjectId"   uuid not null,
  "studentId"       uuid not null,
  "classId"         uuid not null,
  "marksObtained"   numeric(6, 2) not null,
  "remarks"         text,
  "enteredByUserId" uuid not null references "users" ("id") on delete restrict,
  "createdAt"       timestamptz not null default now(),
  "updatedAt"       timestamptz not null default now(),

  constraint "resultsMarksNonNegative" check ("marksObtained" >= 0),
  -- The exam paper must be for the same class as the student's enrollment.
  constraint "resultsExamSubjectFkey" foreign key ("examSubjectId", "classId")
    references "examSubjects" ("id", "classId") on delete restrict,
  constraint "resultsEnrollmentFkey" foreign key ("studentId", "classId")
    references "studentEnrollments" ("studentId", "classId") on delete restrict,
  constraint "resultsExamSubjectStudentKey" unique ("examSubjectId", "studentId")
);

create index "resultsStudentIdx"   on "results" ("studentId");
create index "resultsClassIdx"     on "results" ("classId");
create index "resultsEnteredByIdx" on "results" ("enteredByUserId");

create trigger "resultsSetUpdatedAt"
  before update on "results"
  for each row execute function "setUpdatedAt"();

-- marksObtained <= examSubjects.maxMarks spans two tables, so it cannot be a
-- CHECK constraint. Enforced by the two triggers below.

create function "enforceResultMarksWithinMax"()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  "limitMarks" numeric(6, 2);
begin
  select es."maxMarks" into "limitMarks"
  from public."examSubjects" es
  where es."id" = new."examSubjectId";

  if new."marksObtained" > "limitMarks" then
    raise exception 'marksObtained (%) exceeds maxMarks (%) for examSubject %',
      new."marksObtained", "limitMarks", new."examSubjectId"
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger "resultsEnforceMarksWithinMax"
  before insert or update of "marksObtained", "examSubjectId" on "results"
  for each row execute function "enforceResultMarksWithinMax"();

create function "preventMaxMarksBelowResults"()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public."results" r
    where r."examSubjectId" = new."id"
      and r."marksObtained" > new."maxMarks"
  ) then
    raise exception 'maxMarks (%) is below existing results for examSubject %',
      new."maxMarks", new."id"
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger "examSubjectsPreventMaxMarksBelowResults"
  before update of "maxMarks" on "examSubjects"
  for each row execute function "preventMaxMarksBelowResults"();


-- -----------------------------------------------------------------------------
-- 14. timetableEntries — weekly recurring periods for a class.
-- -----------------------------------------------------------------------------

create table "timetableEntries" (
  "id"          uuid primary key default gen_random_uuid(),
  "classId"     uuid not null references "classes" ("id") on delete restrict,
  "subjectId"   uuid not null references "subjects" ("id") on delete restrict,
  -- Optional until staffed; when set, the teacher must hold a matching
  -- teacherAssignment (composite FK below; NULL teacherId skips the check).
  "teacherId"   uuid references "teachers" ("id") on delete restrict,
  "dayOfWeek"   smallint not null,                -- ISO 8601: 1 = Monday … 7 = Sunday
  "startTime"   time not null,
  "endTime"     time not null,
  "room"        text,
  "createdAt"   timestamptz not null default now(),
  "updatedAt"   timestamptz not null default now(),

  constraint "timetableEntriesDayOfWeekRange" check ("dayOfWeek" between 1 and 7),
  constraint "timetableEntriesTimeRange"      check ("endTime" > "startTime"),
  constraint "timetableEntriesAssignmentFkey"
    foreign key ("teacherId", "classId", "subjectId")
    references "teacherAssignments" ("teacherId", "classId", "subjectId")
    on delete restrict,
  constraint "timetableEntriesClassSlotKey" unique ("classId", "dayOfWeek", "startTime")
);

create index "timetableEntriesTeacherDayIdx"
  on "timetableEntries" ("teacherId", "dayOfWeek");
create index "timetableEntriesSubjectIdx" on "timetableEntries" ("subjectId");

create trigger "timetableEntriesSetUpdatedAt"
  before update on "timetableEntries"
  for each row execute function "setUpdatedAt"();


-- -----------------------------------------------------------------------------
-- 15. notices — announcements. Visible to non-admins only when published.
-- -----------------------------------------------------------------------------

create table "notices" (
  "id"              uuid primary key default gen_random_uuid(),
  "title"           text not null,
  "body"            text not null,
  "category"        text,                         -- free-form label, e.g. 'Events'
  "status"          "noticeStatus" not null default 'draft',
  "publishedAt"     timestamptz,
  "createdByUserId" uuid not null references "users" ("id") on delete restrict,
  "createdAt"       timestamptz not null default now(),
  "updatedAt"       timestamptz not null default now(),

  constraint "noticesTitleNotBlank" check (length(trim("title")) > 0),
  -- A published notice must record when it was published.
  constraint "noticesPublishedHasTimestamp"
    check ("status" <> 'published' or "publishedAt" is not null)
);

create index "noticesStatusPublishedAtIdx"
  on "notices" ("status", "publishedAt" desc);
create index "noticesCreatedByIdx" on "notices" ("createdByUserId");

create trigger "noticesSetUpdatedAt"
  before update on "notices"
  for each row execute function "setUpdatedAt"();


-- -----------------------------------------------------------------------------
-- 16. noticeAudiences — who a notice is addressed to.
-- -----------------------------------------------------------------------------
-- Each row targets exactly ONE of: a role (all users with that role) or a
-- class (students enrolled in it and teachers assigned to it). A notice with
-- several rows is visible to the union of those audiences.

create table "noticeAudiences" (
  "id"            uuid primary key default gen_random_uuid(),
  -- Audience rows are part of the notice and are removed with it.
  "noticeId"      uuid not null references "notices" ("id") on delete cascade,
  "audienceRole"  "userRole",
  "classId"       uuid references "classes" ("id") on delete restrict,
  "createdAt"     timestamptz not null default now(),

  constraint "noticeAudiencesExactlyOneTarget"
    check (num_nonnulls("audienceRole", "classId") = 1)
);

create unique index "noticeAudiencesNoticeRoleKey"
  on "noticeAudiences" ("noticeId", "audienceRole") where "audienceRole" is not null;
create unique index "noticeAudiencesNoticeClassKey"
  on "noticeAudiences" ("noticeId", "classId") where "classId" is not null;
create index "noticeAudiencesClassIdx" on "noticeAudiences" ("classId");
create index "noticeAudiencesRoleIdx"  on "noticeAudiences" ("audienceRole");


-- -----------------------------------------------------------------------------
-- 17. auditLogs — append-only record of significant actions.
-- -----------------------------------------------------------------------------
-- Written only by trusted server-side code. UPDATE and DELETE are rejected by
-- trigger for every role, so entries cannot be altered after the fact.

create table "auditLogs" (
  "id"           uuid primary key default gen_random_uuid(),
  -- NULL for system-initiated actions (e.g. initial-admin provisioning).
  "actorUserId"  uuid references "users" ("id") on delete restrict,
  "action"       text not null,                   -- e.g. 'results.update'
  "entityType"   text not null,                   -- e.g. 'results'
  "entityId"     uuid,
  "oldData"      jsonb,
  "newData"      jsonb,
  "metadata"     jsonb,
  "createdAt"    timestamptz not null default now(),

  constraint "auditLogsActionNotBlank"     check (length(trim("action")) > 0),
  constraint "auditLogsEntityTypeNotBlank" check (length(trim("entityType")) > 0)
);

create index "auditLogsActorIdx"     on "auditLogs" ("actorUserId");
create index "auditLogsEntityIdx"    on "auditLogs" ("entityType", "entityId");
create index "auditLogsCreatedAtIdx" on "auditLogs" ("createdAt" desc);

create function "preventAuditLogMutation"()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'auditLogs is append-only; % is not permitted', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger "auditLogsPreventMutation"
  before update or delete on "auditLogs"
  for each row execute function "preventAuditLogMutation"();


-- -----------------------------------------------------------------------------
-- Row Level Security — deny by default.
-- -----------------------------------------------------------------------------
-- RLS is enabled on every table so that, until the policies in the next
-- migration exist, the anon and authenticated roles can read or write nothing.

alter table "users"              enable row level security;
alter table "students"           enable row level security;
alter table "teachers"           enable row level security;
alter table "academicYears"      enable row level security;
alter table "classes"            enable row level security;
alter table "studentEnrollments" enable row level security;
alter table "subjects"           enable row level security;
alter table "teacherAssignments" enable row level security;
alter table "studentAttendance"  enable row level security;
alter table "teacherAttendance"  enable row level security;
alter table "exams"              enable row level security;
alter table "examSubjects"       enable row level security;
alter table "results"            enable row level security;
alter table "timetableEntries"   enable row level security;
alter table "notices"            enable row level security;
alter table "noticeAudiences"    enable row level security;
alter table "auditLogs"          enable row level security;
