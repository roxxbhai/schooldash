-- =============================================================================
-- Migration 6: school resources (academic years, classes, subjects)
-- =============================================================================
--
-- 1. setCurrentAcademicYear: switching the current year needs two UPDATEs
--    (unset the old, set the new). Done as separate API calls, a failure in
--    between would leave the school with no current year, so it runs as one
--    transaction. SECURITY INVOKER: RLS and grants apply to the caller, and
--    the function additionally requires an active admin.
--
-- 2. Audit trigger: administrative changes to school records are written to
--    auditLogs in the same transaction as the change, attributed to the
--    signed-in user (app."currentUserId"(); NULL for service-role/system).
--    The function is SECURITY DEFINER only so it can insert into auditLogs,
--    which no API role may write; it lives in the private `app` schema and
--    cannot be called directly.
--    For tables holding personal data, pass 'redact': only the names of the
--    changed fields are recorded, never their values.
-- =============================================================================


-- 1. Current academic year ------------------------------------------------------

create function public."setCurrentAcademicYear"("academicYearId" uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not app."isAdmin"() then
    raise exception 'only administrators can change the current academic year'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public."academicYears" y where y."id" = "setCurrentAcademicYear"."academicYearId"
  ) then
    raise exception 'academic year not found' using errcode = 'P0002';
  end if;

  update public."academicYears" set "isCurrent" = false
  where "isCurrent" and "id" <> "setCurrentAcademicYear"."academicYearId";

  update public."academicYears" set "isCurrent" = true
  where "id" = "setCurrentAcademicYear"."academicYearId" and not "isCurrent";
end;
$$;

revoke all on function public."setCurrentAcademicYear"(uuid) from public, anon;
grant execute on function public."setCurrentAcademicYear"(uuid) to authenticated, service_role;


-- 2. Audit trigger -------------------------------------------------------------

create function app."auditRowChange"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  "redact"  boolean := coalesce(tg_argv[0], '') = 'redact';
  "changed" text[];
begin
  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into "changed"
    from jsonb_each(to_jsonb(new)) n
    where n.key <> 'updatedAt' and n.value is distinct from (to_jsonb(old) -> n.key);
    if "changed" is null then
      return null; -- nothing actually changed
    end if;
  end if;

  insert into public."auditLogs" ("actorUserId", "action", "entityType", "entityId", "oldData", "newData", "metadata")
  values (
    app."currentUserId"(),
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    case when tg_op = 'DELETE' then old."id" else new."id" end,
    case when "redact" or tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when "redact" or tg_op = 'DELETE' then null else to_jsonb(new) end,
    case when "changed" is not null then jsonb_build_object('changedFields', to_jsonb("changed")) end
  );
  return null;
end;
$$;

revoke all on function app."auditRowChange"() from public, anon, authenticated;

create trigger "academicYearsAudit" after insert or update on "academicYears"
  for each row execute function app."auditRowChange"();
create trigger "classesAudit" after insert or update on "classes"
  for each row execute function app."auditRowChange"();
create trigger "subjectsAudit" after insert or update on "subjects"
  for each row execute function app."auditRowChange"();
