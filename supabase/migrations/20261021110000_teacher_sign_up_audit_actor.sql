-- =============================================================================
-- Migration 16: record teacher sign-up as a self-service audit entry
-- =============================================================================
--
-- Migration 15 audited a teacher's sign-up with the teacher as the actor.
-- "auditLogs"."actorUserId" is ON DELETE RESTRICT and audit rows are
-- append-only, so that made every teacher who signed up undeletable. Like
-- other actions without an administrator behind them, the entry now has no
-- actor; the teacher is still recorded as the entity, and the metadata marks
-- it as self-service. Otherwise unchanged.
-- =============================================================================

create or replace function public."claimTeacherSignUp"("phone" text)
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
  values (null, 'users.teacherSignUp', 'users', "teacher"."id", jsonb_build_object('selfService', true));

  return jsonb_build_object(
    'status', 'claimed',
    'userId', "teacher"."id",
    'authUserId', "teacher"."authUserId",
    'email', "teacher"."email"
  );
end;
$$;

revoke all on function public."claimTeacherSignUp"(text) from public, anon, authenticated;
grant execute on function public."claimTeacherSignUp"(text) to service_role;
