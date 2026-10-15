-- =============================================================================
-- Migration 5: account deactivation / reactivation
-- =============================================================================
--
-- One atomic operation per status change:
--   * locks the target users row,
--   * refuses self-changes and removing the last active administrator,
--   * flips "isActive" / "deactivatedAt" together (CHECK keeps them consistent),
--   * on deactivation, deletes the user's Supabase Auth sessions so their
--     refresh tokens stop working immediately,
--   * writes the audit entry.
-- A repeated request for the current state changes nothing and is not audited.
--
-- Nothing else is touched: students, teachers, enrollments, attendance,
-- results and audit history are preserved.
--
-- Deleting auth.sessions needs owner privileges, so the function is SECURITY
-- DEFINER. It is executable ONLY by service_role (lib/auth/account-status.ts,
-- called from admin-guarded handlers) and never by anon/authenticated.
--
-- Error codes (mapped by lib/api/db-errors.ts):
--   P0002  user not found
--   SD001  an administrator tried to change their own status
--   SD002  would leave no active administrator
-- =============================================================================

create function public."setAppUserStatus"(
  "userId"      uuid,
  "isActive"    boolean,
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
  where u."id" = "setAppUserStatus"."userId"
  for update;

  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  if "setAppUserStatus"."actorUserId" = "target"."id" then
    raise exception 'administrators cannot change their own account status'
      using errcode = 'SD001';
  end if;

  if "target"."isActive" = "setAppUserStatus"."isActive" then
    return jsonb_build_object('changed', false, 'revokedSessions', 0);
  end if;

  -- Serialize concurrent admin deactivations: lock every active admin row so
  -- two admins deactivating each other cannot both pass the check below.
  if not "setAppUserStatus"."isActive" and "target"."role" = 'admin' then
    perform 1 from public."users" u where u."role" = 'admin' and u."isActive" for update;
  end if;

  if not "setAppUserStatus"."isActive" and "target"."role" = 'admin' and not exists (
    select 1 from public."users" u
    where u."role" = 'admin' and u."isActive" and u."id" <> "target"."id"
  ) then
    raise exception 'cannot deactivate the last active administrator'
      using errcode = 'SD002';
  end if;

  update public."users"
  set "isActive"      = "setAppUserStatus"."isActive",
      "deactivatedAt" = case when "setAppUserStatus"."isActive" then null else now() end
  where "id" = "target"."id";

  if not "setAppUserStatus"."isActive" then
    delete from auth.sessions s where s.user_id = "target"."authUserId";
    get diagnostics "revokedSessions" = row_count;
  end if;

  insert into public."auditLogs" ("actorUserId", "action", "entityType", "entityId", "metadata")
  values (
    "setAppUserStatus"."actorUserId",
    case when "setAppUserStatus"."isActive" then 'users.reactivate' else 'users.deactivate' end,
    'users',
    "target"."id",
    jsonb_build_object('revokedSessions', "revokedSessions")
  );

  return jsonb_build_object('changed', true, 'revokedSessions', "revokedSessions");
end;
$$;

revoke all on function public."setAppUserStatus"(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public."setAppUserStatus"(uuid, boolean, uuid) to service_role;
