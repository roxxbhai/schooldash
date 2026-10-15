-- =============================================================================
-- Migration 10: exams and results (Phase 5)
-- =============================================================================
--
-- 1. Audit: exam definitions, exam papers and marks are audited on insert and
--    update with old/new rows (marks entry and correction are sensitive).
--
-- 2. Results insert rule: marks cannot be entered for a deactivated student.
--    Teachers can insert results directly through the Data API, so this is
--    enforced in the database as well as in the service. (marksObtained <=
--    maxMarks and >= 0 were already enforced by migration 1.)
-- =============================================================================

create trigger "examsAudit" after insert or update on "exams"
  for each row execute function app."auditRowChange"();
create trigger "examSubjectsAudit" after insert or update on "examSubjects"
  for each row execute function app."auditRowChange"();
create trigger "resultsAudit" after insert or update on "results"
  for each row execute function app."auditRowChange"();

create function app."validateResult"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  "active" boolean;
begin
  select u."isActive" into "active"
  from public."students" s join public."users" u on u."id" = s."userId"
  where s."id" = new."studentId";

  if found and not "active" then
    raise exception 'marks cannot be entered for a deactivated student (constraint "resultsStudentActive")'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function app."validateResult"() from public, anon, authenticated;

create trigger "resultsValidate" before insert on "results"
  for each row execute function app."validateResult"();
