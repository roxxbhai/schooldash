-- =============================================================================
-- Migration 17: employee codes are generated, not typed in
-- =============================================================================
--
-- An admin no longer enters a teacher's employee code. "provisionAppUser"
-- assigns the next code in the series EMP0001, EMP0002, ... (at least four
-- digits; EMP10000 follows EMP9999). Codes are unique (existing unique key)
-- and incremental: the next code is one more than the highest EMP<digits>
-- code in use. A transaction-scoped advisory lock serializes concurrent
-- teacher creation, so two admins can never be handed the same number, and a
-- failed creation rolls back without leaving a gap.
--
-- Codes are now permanent: they can no longer be changed through
-- "updateTeacherProfile" or the Data API. Existing codes keep their values.
-- =============================================================================

-- 1. NEXT CODE ---------------------------------------------------------------------

create function app."nextEmployeeCode"()
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  "nextNumber" bigint;
begin
  -- HELD UNTIL THE CALLING TRANSACTION ENDS, SO THE CODE IS INSERTED BEFORE ANOTHER
  -- CALLER CAN READ THE HIGHEST CODE.
  perform pg_advisory_xact_lock(hashtext('teachers.employeeCode'));

  select coalesce(max(substring(t."employeeCode" from 4)::bigint), 0) + 1 into "nextNumber"
  from public."teachers" t
  where t."employeeCode" ~ '^EMP[0-9]{1,15}$';

  return 'EMP' || lpad("nextNumber"::text, greatest(4, length("nextNumber"::text)), '0');
end;
$$;

revoke all on function app."nextEmployeeCode"() from public, anon, authenticated;
grant execute on function app."nextEmployeeCode"() to service_role;

-- 2. PROVISIONING GENERATES THE CODE ----------------------------------------------
-- SAME AS MIGRATION 15, EXCEPT THAT A TEACHER'S EMPLOYEE CODE IS NO LONGER REQUIRED
-- (OR READ) FROM "profile".

create or replace function public."provisionAppUser"(
  "authUserId"  uuid,
  "email"       text,
  "fullName"    text,
  "role"        public."userRole",
  "profile"     jsonb default '{}'::jsonb,
  "actorUserId" uuid  default null,
  "phone"       text  default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  "newUserId" uuid;
begin
  if "provisionAppUser"."role" = 'student'
     and coalesce(trim("profile" ->> 'admissionNumber'), '') = '' then
    raise exception 'admissionNumber is required for students'
      using errcode = 'invalid_parameter_value';
  end if;

  -- FK to auth.users rejects unknown Auth ids (23503); the unique keys reject
  -- an Auth user, email or teacher phone that already has an account (23505).
  insert into public."users" ("authUserId", "email", "fullName", "role", "phone")
  values ("provisionAppUser"."authUserId", lower(trim("provisionAppUser"."email")),
          trim("provisionAppUser"."fullName"), "provisionAppUser"."role",
          nullif(trim("provisionAppUser"."phone"), ''))
  returning "id" into "newUserId";

  if "provisionAppUser"."role" = 'student' then
    insert into public."students" (
      "userId", "admissionNumber", "admissionDate", "dateOfBirth", "gender",
      "bloodGroup", "fatherName", "motherName", "address"
    ) values (
      "newUserId",
      trim("profile" ->> 'admissionNumber'),
      ("profile" ->> 'admissionDate')::date,
      ("profile" ->> 'dateOfBirth')::date,
      "profile" ->> 'gender',
      "profile" ->> 'bloodGroup',
      "profile" ->> 'fatherName',
      "profile" ->> 'motherName',
      "profile" ->> 'address'
    );
  elsif "provisionAppUser"."role" = 'teacher' then
    insert into public."teachers" ("userId", "employeeCode", "qualification", "dateOfJoining")
    values (
      "newUserId",
      app."nextEmployeeCode"(),
      "profile" ->> 'qualification',
      ("profile" ->> 'dateOfJoining')::date
    );
  end if;

  insert into public."auditLogs" ("actorUserId", "action", "entityType", "entityId", "newData")
  values (
    "provisionAppUser"."actorUserId",
    'users.provision',
    'users',
    "newUserId",
    jsonb_build_object('role', "provisionAppUser"."role", 'authUserId', "provisionAppUser"."authUserId")
  );

  return "newUserId";
end;
$$;

-- 3. CODES ARE PERMANENT ------------------------------------------------------------

revoke update ("employeeCode") on public."teachers" from authenticated;

-- SAME AS MIGRATION 7, WITHOUT "employeeCode" IN "profilePatch".
create or replace function public."updateTeacherProfile"(
  "teacherId"    uuid,
  "userPatch"    jsonb default '{}'::jsonb,
  "profilePatch" jsonb default '{}'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  "targetUserId" uuid;
begin
  if not app."isAdmin"() then
    raise exception 'only administrators can edit teachers' using errcode = '42501';
  end if;

  if "profilePatch" ? 'employeeCode' then
    raise exception 'employee codes cannot be changed' using errcode = '42501';
  end if;

  select t."userId" into "targetUserId" from public."teachers" t
  where t."id" = "updateTeacherProfile"."teacherId";
  if not found then
    raise exception 'teacher not found' using errcode = 'P0002';
  end if;

  if "userPatch" ?| array['fullName', 'phone'] then
    update public."users" set
      "fullName" = case when "userPatch" ? 'fullName' then "userPatch" ->> 'fullName' else "fullName" end,
      "phone"    = case when "userPatch" ? 'phone'    then "userPatch" ->> 'phone'    else "phone"    end
    where "id" = "targetUserId";
  end if;

  if "profilePatch" ?| array['qualification', 'dateOfJoining'] then
    update public."teachers" set
      "qualification" = case when "profilePatch" ? 'qualification' then "profilePatch" ->> 'qualification' else "qualification" end,
      "dateOfJoining" = case when "profilePatch" ? 'dateOfJoining' then ("profilePatch" ->> 'dateOfJoining')::date else "dateOfJoining" end
    where "id" = "updateTeacherProfile"."teacherId";
  end if;
end;
$$;
