-- =============================================================================
-- Migration 15: separate sign-in for admins, teachers and students
-- =============================================================================
--
-- ADMINS   sign in with email + password. No self sign-up: the first admin is
--          created with scripts/bootstrap-admin.ts, later admins by an admin,
--          who hands them a one-time setup code to choose their password.
--          Setup codes are now issued ONLY for admin accounts.
-- TEACHERS sign in with phone number + password. An admin creates the
--          teacher (with their phone number); the teacher then signs up once
--          by entering that phone number and choosing a password.
--          "passwordSetAt" records whether that has happened; an admin can
--          clear it ("reset sign-up") so the teacher can choose a new password.
-- STUDENTS sign in with their admission number only (no password).
--
-- Teacher phone numbers are stored as 10 Indian mobile digits (no +91 or 0
-- prefix) and are unique among teachers. Students' numbers (often a parent's
-- and shared by siblings) are not constrained.
--
-- Error codes (mapped by src/helpers/db-error):
--   P0002  user not found
--   SD003  setup codes can only be issued for administrator accounts
--   SD004  the account is deactivated
--   SD005  sign-up can only be reset for teacher accounts
-- =============================================================================

-- 1. TEACHER SIGN-UP STATE ------------------------------------------------------

alter table public."users" add column "passwordSetAt" timestamptz;

comment on column public."users"."passwordSetAt" is
  'When the person last chose their password (teacher sign-up, admin setup code). Null: not signed up yet.';

-- EVERYONE WHO ALREADY HAS A PASSWORD COUNTS AS SIGNED UP.
update public."users" u
set "passwordSetAt" = now()
from auth.users a
where a."id" = u."authUserId"
  and coalesce(a."encrypted_password", '') <> '';

-- 2. TEACHER PHONE NUMBERS ------------------------------------------------------

-- NORMALIZE EXISTING TEACHER NUMBERS WHERE THAT IS UNAMBIGUOUS (+91 / 0 PREFIX, SPACES, DASHES).
update public."users" u
set "phone" = right(regexp_replace(u."phone", '\D', '', 'g'), 10)
where u."role" = 'teacher'
  and u."phone" is not null
  and regexp_replace(u."phone", '\D', '', 'g') ~ '^(91|0)?[6-9][0-9]{9}$';

-- NEW AND CHANGED TEACHER NUMBERS MUST BE NORMALIZED. NOT VALID: EXISTING ROWS THAT
-- COULD NOT BE NORMALIZED ABOVE ARE LEFT AS THEY ARE (THAT TEACHER CANNOT SIGN IN
-- UNTIL AN ADMIN CORRECTS THE NUMBER).
alter table public."users"
  add constraint "usersTeacherPhoneFormat"
  check ("role" <> 'teacher' or "phone" is null or "phone" ~ '^[6-9][0-9]{9}$') not valid;

create unique index "usersTeacherPhoneKey" on public."users" ("phone")
  where "role" = 'teacher' and "phone" is not null;

-- 3. PROVISIONING STORES THE PHONE NUMBER ---------------------------------------

drop function public."provisionAppUser"(uuid, text, text, public."userRole", jsonb, uuid);

create function public."provisionAppUser"(
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
  if "provisionAppUser"."role" = 'teacher'
     and coalesce(trim("profile" ->> 'employeeCode'), '') = '' then
    raise exception 'employeeCode is required for teachers'
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

revoke all on function public."provisionAppUser"(uuid, text, text, public."userRole", jsonb, uuid, text)
  from public, anon, authenticated;
grant execute on function public."provisionAppUser"(uuid, text, text, public."userRole", jsonb, uuid, text)
  to service_role;

-- 4. SETUP CODES: ADMINISTRATORS ONLY -------------------------------------------

-- CODES ISSUED EARLIER FOR TEACHERS AND STUDENTS CAN NO LONGER BE USED.
delete from public."accountSetupCodes" c
using public."users" u
where u."id" = c."userId" and u."role" <> 'admin';

create or replace function public."issueAccountSetupCode"(
  "userId"      uuid,
  "codeHash"    text,
  "expiresAt"   timestamptz,
  "actorUserId" uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  "target" public."users"%rowtype;
begin
  select * into "target" from public."users" u
  where u."id" = "issueAccountSetupCode"."userId"
  for update;

  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  if "target"."role" <> 'admin' then
    raise exception 'setup codes are only issued for administrator accounts'
      using errcode = 'SD003';
  end if;

  if not "target"."isActive" then
    raise exception 'the account is deactivated' using errcode = 'SD004';
  end if;

  insert into public."accountSetupCodes" ("userId", "codeHash", "expiresAt", "failedAttempts", "issuedByUserId")
  values ("target"."id", "issueAccountSetupCode"."codeHash", "issueAccountSetupCode"."expiresAt", 0, "issueAccountSetupCode"."actorUserId")
  on conflict on constraint "accountSetupCodes_userId_key" do update
  set "codeHash"       = excluded."codeHash",
      "expiresAt"      = excluded."expiresAt",
      "failedAttempts" = 0,
      "issuedByUserId" = excluded."issuedByUserId",
      "createdAt"      = now();

  insert into public."auditLogs" ("actorUserId", "action", "entityType", "entityId", "metadata")
  values ("issueAccountSetupCode"."actorUserId", 'users.issueSetupCode', 'users', "target"."id", '{}'::jsonb);
end;
$$;

-- SAME AS MIGRATION 13, BUT ONLY ADMINISTRATOR ACCOUNTS MATCH, AND A USED CODE MARKS
-- THE PASSWORD AS SET.
create or replace function public."consumeAccountSetupCode"(
  "email"    text,
  "codeHash" text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  "account" record;
begin
  select c."id", c."userId", c."codeHash", c."expiresAt", c."failedAttempts", u."authUserId", u."isActive"
  into "account"
  from public."accountSetupCodes" c
  join public."users" u on u."id" = c."userId"
  where u."email" = lower("consumeAccountSetupCode"."email")
    and u."role" = 'admin'
  for update of c;

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  if "account"."expiresAt" <= now() then
    delete from public."accountSetupCodes" where "id" = "account"."id";
    return jsonb_build_object('status', 'invalid');
  end if;

  if "account"."codeHash" <> "consumeAccountSetupCode"."codeHash" then
    if "account"."failedAttempts" + 1 >= 5 then
      delete from public."accountSetupCodes" where "id" = "account"."id";
    else
      update public."accountSetupCodes" set "failedAttempts" = "failedAttempts" + 1 where "id" = "account"."id";
    end if;
    return jsonb_build_object('status', 'invalid');
  end if;

  if not "account"."isActive" then
    return jsonb_build_object('status', 'inactive');
  end if;

  delete from public."accountSetupCodes" where "id" = "account"."id";
  update public."users" set "passwordSetAt" = now() where "id" = "account"."userId";
  return jsonb_build_object(
    'status', 'valid',
    'userId', "account"."userId",
    'authUserId', "account"."authUserId",
    'expiresAt', "account"."expiresAt",
    'failedAttempts', "account"."failedAttempts"
  );
end;
$$;

revoke all on function public."issueAccountSetupCode"(uuid, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public."issueAccountSetupCode"(uuid, text, timestamptz, uuid) to service_role;
revoke all on function public."consumeAccountSetupCode"(text, text) from public, anon, authenticated;
grant execute on function public."consumeAccountSetupCode"(text, text) to service_role;

-- 5. TEACHER SIGN-UP ------------------------------------------------------------

-- CLAIMS THE SIGN-UP OF THE TEACHER WITH THIS (NORMALIZED) PHONE NUMBER, ATOMICALLY:
--   no teacher with the number -> { status: 'notFound' }
--   deactivated                -> { status: 'inactive' }
--   already signed up          -> { status: 'alreadySignedUp' }
--   otherwise                  -> marks "passwordSetAt" and returns
--                                 { status: 'claimed', userId, authUserId, email }
-- Two concurrent sign-ups for one number cannot both claim it. If setting the
-- password then fails, the caller clears "passwordSetAt" again.
create function public."claimTeacherSignUp"("phone" text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  "teacher" public."users"%rowtype;
begin
  select * into "teacher" from public."users" u
  where u."role" = 'teacher' and u."phone" = "claimTeacherSignUp"."phone"
  for update;

  if not found then
    return jsonb_build_object('status', 'notFound');
  end if;
  if not "teacher"."isActive" then
    return jsonb_build_object('status', 'inactive');
  end if;
  if "teacher"."passwordSetAt" is not null then
    return jsonb_build_object('status', 'alreadySignedUp');
  end if;

  update public."users" set "passwordSetAt" = now() where "id" = "teacher"."id";

  insert into public."auditLogs" ("actorUserId", "action", "entityType", "entityId", "metadata")
  values ("teacher"."id", 'users.teacherSignUp', 'users', "teacher"."id", '{}'::jsonb);

  return jsonb_build_object(
    'status', 'claimed',
    'userId', "teacher"."id",
    'authUserId', "teacher"."authUserId",
    'email', "teacher"."email"
  );
end;
$$;

-- LETS A TEACHER SIGN UP AGAIN (A FORGOTTEN PASSWORD): CLEARS "passwordSetAt", ENDS
-- THEIR SESSIONS, AND AUDITS IT. THE APPLICATION ALSO REPLACES THE OLD PASSWORD
-- WITH A RANDOM ONE, SO IT STOPS WORKING. SECURITY DEFINER FOR auth.sessions.
create function public."resetTeacherSignUp"(
  "userId"      uuid,
  "actorUserId" uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  "target"          public."users"%rowtype;
  "revokedSessions" integer := 0;
begin
  select * into "target" from public."users" u
  where u."id" = "resetTeacherSignUp"."userId"
  for update;

  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  if "target"."role" <> 'teacher' then
    raise exception 'sign-up can only be reset for teacher accounts' using errcode = 'SD005';
  end if;
  if not "target"."isActive" then
    raise exception 'the account is deactivated' using errcode = 'SD004';
  end if;

  update public."users" set "passwordSetAt" = null where "id" = "target"."id";

  delete from auth.sessions s where s.user_id = "target"."authUserId";
  get diagnostics "revokedSessions" = row_count;

  insert into public."auditLogs" ("actorUserId", "action", "entityType", "entityId", "metadata")
  values ("resetTeacherSignUp"."actorUserId", 'users.resetTeacherSignUp', 'users', "target"."id",
          jsonb_build_object('revokedSessions', "revokedSessions"));

  return jsonb_build_object('authUserId', "target"."authUserId", 'revokedSessions', "revokedSessions");
end;
$$;

revoke all on function public."claimTeacherSignUp"(text) from public, anon, authenticated;
grant execute on function public."claimTeacherSignUp"(text) to service_role;
revoke all on function public."resetTeacherSignUp"(uuid, uuid) from public, anon, authenticated;
grant execute on function public."resetTeacherSignUp"(uuid, uuid) to service_role;

-- 6. TEACHER SEARCH ALSO MATCHES THE PHONE NUMBER --------------------------------

create or replace function public."teacherSearchText"("teacher" public."teachers")
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select concat_ws(' ', "teacher"."employeeCode", u."fullName", u."email", u."phone")
  from public."users" u
  where u."id" = "teacher"."userId"
$$;
