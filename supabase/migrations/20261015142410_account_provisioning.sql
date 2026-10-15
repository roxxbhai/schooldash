-- =============================================================================
-- Migration 3: atomic application-account provisioning
-- =============================================================================
--
-- Creating an account spans two systems: Supabase Auth (auth.users, via the
-- Auth Admin API) and this database. Auth cannot join a Postgres transaction,
-- so lib/auth/provisioning.ts creates the Auth user first and then calls this
-- function, deleting the Auth user again if this function fails.
--
-- Everything on the database side happens in one transaction: the users row,
-- the role-specific profile row, and the audit entry are created together or
-- not at all.
--
-- Callable ONLY by service_role (the server-side secret key). It is in the
-- exposed public schema so PostgREST can reach it via RPC, which is why
-- EXECUTE is revoked from everyone else.
-- =============================================================================

create function public."provisionAppUser"(
  "authUserId"  uuid,
  "email"       text,
  "fullName"    text,
  "role"        public."userRole",
  "profile"     jsonb default '{}'::jsonb,
  "actorUserId" uuid  default null
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
  if "provisionAppUser"."role" = 'teacher'
     and coalesce(trim("profile" ->> 'employeeCode'), '') = '' then
    raise exception 'employeeCode is required for teachers'
      using errcode = 'invalid_parameter_value';
  end if;

  -- FK to auth.users rejects unknown Auth ids (23503); the unique keys reject
  -- an Auth user or email that already has an application account (23505).
  insert into public."users" ("authUserId", "email", "fullName", "role")
  values ("provisionAppUser"."authUserId", lower(trim("provisionAppUser"."email")),
          trim("provisionAppUser"."fullName"), "provisionAppUser"."role")
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
      trim("profile" ->> 'employeeCode'),
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

revoke all on function public."provisionAppUser"(uuid, text, text, public."userRole", jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public."provisionAppUser"(uuid, text, text, public."userRole", jsonb, uuid)
  to service_role;


-- Looks up an existing Auth user by email so provisioning can link an account
-- created in the dashboard (initial-admin bootstrap) or recover from a partial
-- failure. Auth's Admin API has no lookup-by-email; this is the service-role
-- substitute. Private to service_role.
create function public."findAuthUserIdByEmail"("email" text)
returns uuid
language sql stable
security definer
set search_path = ''
as $$
  select u."id" from auth.users u
  where lower(u."email") = lower(trim("findAuthUserIdByEmail"."email"))
  limit 1
$$;

revoke all on function public."findAuthUserIdByEmail"(text) from public, anon, authenticated;
grant execute on function public."findAuthUserIdByEmail"(text) to service_role;
