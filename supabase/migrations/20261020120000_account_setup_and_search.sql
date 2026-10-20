-- =============================================================================
-- Migration 13: admin-issued account setup codes, and people search
-- =============================================================================
--
-- ACCOUNT SETUP CODES
--   Teachers and students are provisioned without a password. An admin hands
--   them a one-time setup code; they enter their email, the code and a new
--   password on the public setup page. The same code also works as an
--   admin-issued password reset.
--
--   * Only a SHA-256 hash of the code is stored. Codes carry ~60 bits of
--     entropy and expire (the application issues them for 7 days).
--   * One active code per user: issuing a new one replaces the old one.
--   * Five wrong guesses against a user's code invalidate it.
--   * Codes are issued only for active teacher and student accounts, never
--     for administrators.
--   * The table is reachable only by service_role (no grants, RLS enabled,
--     no policies). Both functions are executable only by service_role.
--
-- Error codes (mapped by src/helpers/db-error):
--   P0002  user not found
--   SD003  setup codes can only be issued for teacher and student accounts
--   SD004  the account is deactivated
--
-- PEOPLE SEARCH
--   "studentSearchText" / "teacherSearchText" are PostgREST computed fields,
--   so GET /api/students?search= and GET /api/teachers?search= can match the
--   admission number / employee code, full name and email in one filter.
--   SECURITY INVOKER: they read users through the caller's RLS.
-- =============================================================================

create table public."accountSetupCodes" (
  "id"             uuid primary key default gen_random_uuid(),
  "userId"         uuid not null unique references public."users"("id") on delete restrict,
  "codeHash"       text not null check ("codeHash" ~ '^[0-9a-f]{64}$'),
  "expiresAt"      timestamptz not null,
  "failedAttempts" integer not null default 0 check ("failedAttempts" between 0 and 5),
  "issuedByUserId" uuid references public."users"("id") on delete restrict,
  "createdAt"      timestamptz not null default now()
);

create index "accountSetupCodesIssuedByUserIdIdx" on public."accountSetupCodes" ("issuedByUserId");

alter table public."accountSetupCodes" enable row level security;
revoke all on table public."accountSetupCodes" from public, anon, authenticated;
grant select, insert, update, delete on table public."accountSetupCodes" to service_role;

-- ISSUE (OR REPLACE) THE SETUP CODE OF AN ACTIVE TEACHER OR STUDENT, AND AUDIT IT.
create function public."issueAccountSetupCode"(
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

  if "target"."role" not in ('teacher', 'student') then
    raise exception 'setup codes are only issued for teacher and student accounts'
      using errcode = 'SD003';
  end if;

  if not "target"."isActive" then
    raise exception 'the account is deactivated' using errcode = 'SD004';
  end if;

  insert into public."accountSetupCodes" ("userId", "codeHash", "expiresAt", "failedAttempts", "issuedByUserId")
  values ("target"."id", "issueAccountSetupCode"."codeHash", "issueAccountSetupCode"."expiresAt", 0, "issueAccountSetupCode"."actorUserId")
  on conflict ("userId") do update
  set "codeHash"       = excluded."codeHash",
      "expiresAt"      = excluded."expiresAt",
      "failedAttempts" = 0,
      "issuedByUserId" = excluded."issuedByUserId",
      "createdAt"      = now();

  insert into public."auditLogs" ("actorUserId", "action", "entityType", "entityId", "metadata")
  values ("issueAccountSetupCode"."actorUserId", 'users.issueSetupCode', 'users', "target"."id", '{}'::jsonb);
end;
$$;

-- CHECKS A CODE FOR THE GIVEN EMAIL, ATOMICALLY.
--   match, valid          -> deletes the code, returns { status: 'valid', userId, authUserId, expiresAt, failedAttempts }
--                            (expiresAt and failedAttempts let the caller restore the code if setting the password fails)
--   match, inactive user  -> keeps the code, returns { status: 'inactive' }
--   anything else         -> returns { status: 'invalid' }; a wrong code for a
--                            known user counts as a failed attempt, and the
--                            fifth failure deletes the code.
-- NEVER RAISES FOR A BAD GUESS, SO THE ATTEMPT COUNTER IS NOT ROLLED BACK.
create function public."consumeAccountSetupCode"(
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

-- PEOPLE SEARCH (COMPUTED FIELDS)
create function public."studentSearchText"("student" public."students")
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select concat_ws(' ', "student"."admissionNumber", u."fullName", u."email")
  from public."users" u
  where u."id" = "student"."userId"
$$;

create function public."teacherSearchText"("teacher" public."teachers")
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select concat_ws(' ', "teacher"."employeeCode", u."fullName", u."email")
  from public."users" u
  where u."id" = "teacher"."userId"
$$;

revoke all on function public."studentSearchText"(public."students") from public, anon;
grant execute on function public."studentSearchText"(public."students") to authenticated, service_role;
revoke all on function public."teacherSearchText"(public."teachers") from public, anon;
grant execute on function public."teacherSearchText"(public."teachers") to authenticated, service_role;
