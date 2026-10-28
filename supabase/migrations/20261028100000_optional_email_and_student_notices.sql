-- =============================================================================
-- Migration 19: optional email for students and teachers, notices to students
-- =============================================================================
--
-- Email: a student or teacher can be added without an email address. Neither
-- signs in with one (admission number / phone number), so "users"."email" is
-- now only a contact address and may be null. Supabase Auth still needs an
-- email for every identity; for these accounts the server gives the Auth
-- identity a private placeholder address that is never stored in "users" and
-- never shown. Admins still sign in with their email, and provisioning keeps
-- requiring one for them. The existing checks still apply to any email that
-- is set: not blank ("usersEmailNotBlank") and unique ("usersEmailLowerKey",
-- which allows any number of nulls).
--
-- Notices: an audience can now also be one student ("studentId"). Such a
-- notice is visible to that student only (and, as always, to admins). Each
-- audience row still targets exactly one of a role, a class or a student.
-- =============================================================================

-- 1. EMAIL IS OPTIONAL ---------------------------------------------------------------

alter table public."users" alter column "email" drop not null;

-- 2. STUDENT AUDIENCES ---------------------------------------------------------------

alter table public."noticeAudiences"
  add column "studentId" uuid references public."students" ("id") on delete restrict;

alter table public."noticeAudiences" drop constraint "noticeAudiencesExactlyOneTarget";
alter table public."noticeAudiences"
  add constraint "noticeAudiencesExactlyOneTarget"
    check (num_nonnulls("audienceRole", "classId", "studentId") = 1);

create unique index "noticeAudiencesNoticeStudentKey"
  on public."noticeAudiences" ("noticeId", "studentId") where "studentId" is not null;
create index "noticeAudiencesStudentIdx" on public."noticeAudiences" ("studentId");

grant insert ("studentId") on public."noticeAudiences" to authenticated;

-- SAME AS MIGRATION 2, PLUS NOTICES ADDRESSED TO THE CALLER AS A STUDENT.
create or replace function app."canViewNotice"("targetNoticeId" uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public."notices" n
    join public."noticeAudiences" a on a."noticeId" = n."id"
    where n."id" = "targetNoticeId"
      and n."status" = 'published'
      and n."publishedAt" <= now()
      and (
        a."audienceRole" = app."currentRole"()
        or (a."classId" is not null
            and (app."isEnrolledIn"(a."classId") or app."teachesClass"(a."classId")))
        or (a."studentId" is not null and a."studentId" = app."currentStudentId"())
      )
  )
$$;

-- SAME AS MIGRATION 12, PLUS {"studentId": "..."} ITEMS.
create or replace function public."setNoticeAudiences"("noticeId" uuid, "audiences" jsonb)
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
  insert into public."noticeAudiences" ("noticeId", "audienceRole", "classId", "studentId")
  select "setNoticeAudiences"."noticeId",
         (item ->> 'audienceRole')::public."userRole",
         (item ->> 'classId')::uuid,
         (item ->> 'studentId')::uuid
  from jsonb_array_elements(coalesce("audiences", '[]'::jsonb)) as item;
end;
$$;
