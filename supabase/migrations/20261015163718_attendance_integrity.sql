-- =============================================================================
-- Migration 8: attendance integrity
-- =============================================================================
--
-- Teachers (student attendance) and admins (both tables) can write attendance
-- directly through the Data API, not only through the app's services, so the
-- rules that protect attendance history must live in the database:
--
-- 1. Identity is immutable. UPDATE is limited to status, remarks and
--    markedByUserId (the update policy requires the editor to be recorded
--    there). Previously any column could be updated, so a teacher could move
--    one student's absence onto another student or another date.
--
-- 2. On INSERT:
--    * the date may not be in the future (one day of tolerance absorbs time
--      zones ahead of UTC);
--    * student attendance must fall within the class's academic year;
--    * the student/teacher account must be active.
--    Violations raise check_violation (23514) naming a pseudo-constraint so
--    lib/api/db-errors.ts can map them to a 422 on the right field.
--
-- 3. Corrections (UPDATEs) are audited with old and new rows. Inserts are the
--    routine daily record and are not audited individually.
-- =============================================================================


-- 1. Column-level UPDATE privileges -----------------------------------------------

revoke update on "studentAttendance", "teacherAttendance" from authenticated;
grant update ("status", "remarks", "markedByUserId") on "studentAttendance" to authenticated;
grant update ("status", "remarks", "markedByUserId") on "teacherAttendance" to authenticated;


-- 2. Insert-time rules -------------------------------------------------------------
-- SECURITY DEFINER so the checks see the class, year and account rows whatever
-- the caller's RLS visibility; private `app` schema, not callable directly.

create function app."validateStudentAttendance"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  "yearStart" date;
  "yearEnd"   date;
  "active"    boolean;
begin
  if new."attendanceDate" > current_date + 1 then
    raise exception 'attendance cannot be recorded for a future date (constraint "attendanceDateNotFuture")'
      using errcode = '23514';
  end if;

  select y."startDate", y."endDate" into "yearStart", "yearEnd"
  from public."classes" c
  join public."academicYears" y on y."id" = c."academicYearId"
  where c."id" = new."classId";

  -- Unknown class: leave it to the enrollment foreign key (23503).
  if found and (new."attendanceDate" < "yearStart" or new."attendanceDate" > "yearEnd") then
    raise exception 'attendance date is outside the class''s academic year (constraint "attendanceDateInAcademicYear")'
      using errcode = '23514';
  end if;

  select u."isActive" into "active"
  from public."students" s join public."users" u on u."id" = s."userId"
  where s."id" = new."studentId";

  if found and not "active" then
    raise exception 'attendance cannot be recorded for a deactivated student (constraint "attendanceStudentActive")'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create function app."validateTeacherAttendance"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  "active" boolean;
begin
  if new."attendanceDate" > current_date + 1 then
    raise exception 'attendance cannot be recorded for a future date (constraint "attendanceDateNotFuture")'
      using errcode = '23514';
  end if;

  select u."isActive" into "active"
  from public."teachers" t join public."users" u on u."id" = t."userId"
  where t."id" = new."teacherId";

  if found and not "active" then
    raise exception 'attendance cannot be recorded for a deactivated teacher (constraint "attendanceTeacherActive")'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function app."validateStudentAttendance"() from public, anon, authenticated;
revoke all on function app."validateTeacherAttendance"() from public, anon, authenticated;

create trigger "studentAttendanceValidate" before insert on "studentAttendance"
  for each row execute function app."validateStudentAttendance"();
create trigger "teacherAttendanceValidate" before insert on "teacherAttendance"
  for each row execute function app."validateTeacherAttendance"();


-- 3. Audit corrections ---------------------------------------------------------------

create trigger "studentAttendanceAudit" after update on "studentAttendance"
  for each row execute function app."auditRowChange"();
create trigger "teacherAttendanceAudit" after update on "teacherAttendance"
  for each row execute function app."auditRowChange"();
