-- =============================================================================
-- Migration 14: fix the conflict target in "issueAccountSetupCode"
-- =============================================================================
--
-- `on conflict ("userId")` was ambiguous with the function's "userId"
-- parameter (42702). The unique constraint is now named explicitly; the
-- function is otherwise unchanged.
-- =============================================================================

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

  if "target"."role" not in ('teacher', 'student') then
    raise exception 'setup codes are only issued for teacher and student accounts'
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

revoke all on function public."issueAccountSetupCode"(uuid, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public."issueAccountSetupCode"(uuid, text, timestamptz, uuid) to service_role;
