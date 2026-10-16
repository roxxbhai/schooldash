-- =============================================================================
-- Migration 12: notices workflow (Phase 6C)
-- =============================================================================
--
-- Lifecycle (enforced by trigger for every writer, including direct Data API
-- calls):
--
--     draft ──publish──▶ published ──archive──▶ archived
--       └───────────────archive───────────────────▲
--
--   * Only drafts can be edited (title, body, category) or re-targeted
--     (audiences). Published and archived notices are locked; to correct a
--     published notice, archive it and publish a new one.
--   * Publishing requires at least one audience and stamps publishedAt with
--     the database clock. publishedAt never changes afterwards.
--   * Archived is final (no republishing). Archived and draft notices remain
--     invisible to teachers and students (app.canViewNotice, unchanged).
--   State-rule violations raise SQLSTATE 55000 (object_not_in_prerequisite_state)
--   with a pseudo-constraint name the API maps to 409.
--
-- 1. Column-level INSERT/UPDATE grants: callers cannot insert a notice that is
--    already published/archived, or write id/createdAt/updatedAt/createdByUserId
--    after creation. Audience rows are never updated in place (replaced
--    instead), so noticeAudiences has no UPDATE grant.
-- 2. Audience rows can be added or removed only while their notice is a
--    draft (RLS). Database-owner paths (fixtures, cascades) are unaffected.
-- 3. Atomic operations (SECURITY INVOKER — caller's grants and RLS apply; each
--    is one transaction, so a notice is never left half-written):
--      createNotice(title, body, category, audiences)  → notice id
--      setNoticeAudiences(noticeId, audiences)         replaces the set (draft only)
--      publishNotice(noticeId)                         draft → published
--    audiences is a jsonb array of {"audienceRole": "student"} or
--    {"classId": "<uuid>"} objects.
-- 4. Audit: notices (insert/update/delete) and audience changes.
-- =============================================================================


-- 1. Column-level privileges ---------------------------------------------------------

revoke insert, update on public."notices" from authenticated;
grant insert ("title", "body", "category", "createdByUserId") on public."notices" to authenticated;
grant update ("title", "body", "category", "status", "publishedAt") on public."notices" to authenticated;

revoke insert, update on public."noticeAudiences" from authenticated;
grant insert ("noticeId", "audienceRole", "classId") on public."noticeAudiences" to authenticated;


-- 2. Audiences change only while the notice is a draft ---------------------------------

create function app."isDraftNotice"("targetNoticeId" uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public."notices" n
    where n."id" = "targetNoticeId" and n."status" = 'draft'
  )
$$;

revoke all on function app."isDraftNotice"(uuid) from public, anon;
grant execute on function app."isDraftNotice"(uuid) to authenticated;

drop policy "noticeAudiencesInsertAdmin" on public."noticeAudiences";
create policy "noticeAudiencesInsertAdmin" on public."noticeAudiences" for insert to authenticated
  with check ((select app."isAdmin"()) and app."isDraftNotice"("noticeId"));
drop policy "noticeAudiencesDeleteAdmin" on public."noticeAudiences";
create policy "noticeAudiencesDeleteAdmin" on public."noticeAudiences" for delete to authenticated
  using ((select app."isAdmin"()) and app."isDraftNotice"("noticeId"));


-- Lifecycle trigger -----------------------------------------------------------------

create function app."validateNoticeChange"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new."status" is distinct from old."status" then
    if not ((old."status" = 'draft' and new."status" in ('published', 'archived'))
            or (old."status" = 'published' and new."status" = 'archived')) then
      raise exception 'a % notice cannot become % (constraint "noticesStatusTransition")', old."status", new."status"
        using errcode = '55000';
    end if;
    if new."status" = 'published'
       and not exists (select 1 from public."noticeAudiences" a where a."noticeId" = new."id") then
      raise exception 'a notice needs an audience to be published (constraint "noticesPublishRequiresAudience")'
        using errcode = '55000';
    end if;
  end if;

  if old."status" <> 'draft'
     and (new."title", new."body", new."category") is distinct from (old."title", old."body", old."category") then
    raise exception 'only draft notices can be edited (constraint "noticesContentLocked")'
      using errcode = '55000';
  end if;

  if new."publishedAt" is distinct from old."publishedAt"
     and not (old."status" = 'draft' and new."status" = 'published') then
    raise exception 'publishedAt is set only when publishing (constraint "noticesPublishedAtLocked")'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

revoke all on function app."validateNoticeChange"() from public, anon, authenticated;

create trigger "noticesValidateChange" before update on public."notices"
  for each row execute function app."validateNoticeChange"();


-- 3. Atomic operations ------------------------------------------------------------

create function public."setNoticeAudiences"("noticeId" uuid, "audiences" jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  "currentStatus" public."noticeStatus";
begin
  if not app."isAdmin"() then
    raise exception 'only administrators can manage notices' using errcode = '42501';
  end if;

  -- Lock the notice so publishing waits for (or blocks) this change.
  select n."status" into "currentStatus" from public."notices" n
  where n."id" = "setNoticeAudiences"."noticeId"
  for update;
  if not found then
    raise exception 'notice not found' using errcode = 'P0002';
  end if;
  if "currentStatus" <> 'draft' then
    raise exception 'audiences can change only while the notice is a draft (constraint "noticeAudiencesNoticeNotDraft")'
      using errcode = '55000';
  end if;

  delete from public."noticeAudiences" a where a."noticeId" = "setNoticeAudiences"."noticeId";
  insert into public."noticeAudiences" ("noticeId", "audienceRole", "classId")
  select "setNoticeAudiences"."noticeId", (item ->> 'audienceRole')::public."userRole", (item ->> 'classId')::uuid
  from jsonb_array_elements(coalesce("audiences", '[]'::jsonb)) as item;
end;
$$;

create function public."createNotice"("title" text, "body" text, "category" text, "audiences" jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  "newId" uuid;
begin
  if not app."isAdmin"() then
    raise exception 'only administrators can manage notices' using errcode = '42501';
  end if;

  insert into public."notices" ("title", "body", "category", "createdByUserId")
  values ("createNotice"."title", "createNotice"."body", "createNotice"."category", app."currentUserId"())
  returning "id" into "newId";

  perform public."setNoticeAudiences"("newId", "audiences");
  return "newId";
end;
$$;

create function public."publishNotice"("noticeId" uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not app."isAdmin"() then
    raise exception 'only administrators can manage notices' using errcode = '42501';
  end if;

  update public."notices" n set "status" = 'published', "publishedAt" = now()
  where n."id" = "publishNotice"."noticeId" and n."status" = 'draft';
  if found then
    return;
  end if;

  if exists (select 1 from public."notices" n where n."id" = "publishNotice"."noticeId") then
    raise exception 'only draft notices can be published (constraint "noticesStatusTransition")'
      using errcode = '55000';
  end if;
  raise exception 'notice not found' using errcode = 'P0002';
end;
$$;

revoke all on function public."setNoticeAudiences"(uuid, jsonb) from public, anon;
revoke all on function public."createNotice"(text, text, text, jsonb) from public, anon;
revoke all on function public."publishNotice"(uuid) from public, anon;
grant execute on function public."setNoticeAudiences"(uuid, jsonb) to authenticated, service_role;
grant execute on function public."createNotice"(text, text, text, jsonb) to authenticated, service_role;
grant execute on function public."publishNotice"(uuid) to authenticated, service_role;


-- 4. Audit -------------------------------------------------------------------------

create trigger "noticesAudit" after insert or update or delete on public."notices"
  for each row execute function app."auditRowChange"();
create trigger "noticeAudiencesAudit" after insert or delete on public."noticeAudiences"
  for each row execute function app."auditRowChange"();
