-- =============================================================================
-- Migration 11: timetable integrity (Phase 6B)
-- =============================================================================
--
-- 1. academicYearId on timetableEntries. Classes belong to one academic year,
--    so a class's entries are naturally per year — but a TEACHER's are not:
--    without the year, last year's timetable would block this year's periods.
--    The column is always derived from the class by trigger (callers never
--    supply it) and is pinned to the class's year by a composite FK.
--    The table is empty when this migration is written; the backfill below
--    keeps it correct regardless.
--
-- 2. Overlap prevention, enforced by the database (race-safe):
--      * a class cannot have two periods that overlap on the same day;
--      * a teacher cannot have two periods that overlap on the same day in
--        the same academic year.
--    Periods are half-open [startTime, endTime): one ending at 09:45 and the
--    next starting at 09:45 do not conflict. Unstaffed periods (teacherId
--    NULL) are only subject to the class rule. Exclusion constraints need
--    btree_gist for the uuid/smallint equality parts. `time` has no built-in
--    range type, so times are placed on a fixed date to form a tsrange.
--
-- 3. Column-level UPDATE grants (continuing migration 9): id, createdAt,
--    updatedAt and academicYearId are not writable through the Data API.
--
-- 4. Audit: inserts, updates and deletes of timetable entries.
-- =============================================================================

create extension if not exists btree_gist with schema extensions;


-- 1. academicYearId -----------------------------------------------------------------

alter table public."timetableEntries" add column "academicYearId" uuid;

update public."timetableEntries" t set "academicYearId" = c."academicYearId"
from public."classes" c where c."id" = t."classId";

alter table public."timetableEntries"
  alter column "academicYearId" set not null,
  add constraint "timetableEntriesClassYearFkey"
    foreign key ("classId", "academicYearId")
    references public."classes" ("id", "academicYearId") on delete restrict;

create index "timetableEntriesClassYearIdx" on public."timetableEntries" ("classId", "academicYearId");

create function app."setTimetableAcademicYear"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select c."academicYearId" into new."academicYearId"
  from public."classes" c where c."id" = new."classId";
  if not found then
    raise exception 'class does not exist (constraint "timetableEntries_classId_fkey")'
      using errcode = '23503';
  end if;
  return new;
end;
$$;

revoke all on function app."setTimetableAcademicYear"() from public, anon, authenticated;

create trigger "timetableEntriesSetAcademicYear"
  before insert or update of "classId", "academicYearId" on public."timetableEntries"
  for each row execute function app."setTimetableAcademicYear"();


-- 2. Overlap prevention ----------------------------------------------------------

alter table public."timetableEntries"
  add constraint "timetableEntriesClassNoOverlap" exclude using gist (
    "classId" with =,
    "dayOfWeek" with =,
    tsrange(date '2000-01-03' + "startTime", date '2000-01-03' + "endTime", '[)') with &&
  ),
  add constraint "timetableEntriesTeacherNoOverlap" exclude using gist (
    "teacherId" with =,
    "academicYearId" with =,
    "dayOfWeek" with =,
    tsrange(date '2000-01-03' + "startTime", date '2000-01-03' + "endTime", '[)') with &&
  );


-- 3. Column-level UPDATE grants ----------------------------------------------------

revoke update on public."timetableEntries" from authenticated;
grant update ("classId", "subjectId", "teacherId", "dayOfWeek", "startTime", "endTime", "room")
  on public."timetableEntries" to authenticated;


-- 4. Audit -------------------------------------------------------------------------

create trigger "timetableEntriesAudit" after insert or update or delete on public."timetableEntries"
  for each row execute function app."auditRowChange"();
