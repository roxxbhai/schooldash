-- =============================================================================
-- Migration 18: fixed class grades/sections, generated subject codes
-- =============================================================================
--
-- Classes: a class is grade 1-12 and a section is one capital letter A-Z.
-- "grade" is the numeric form of "name", kept so lists sort 1, 2, ... 12
-- instead of the text order 1, 10, 11, 12, 2.
--
-- Subjects: an admin no longer enters a subject code. The column default
-- assigns the next code in the series SUB0001, SUB0002, ... (at least four
-- digits; SUB10000 follows SUB9999), using the same advisory-lock max+1 scheme
-- as employee codes (migration 17). The Data API can no longer write "code"
-- at all, so for app users the code is always generated and never changes.
--
-- Subject names are normalized on every write by a BEFORE trigger: surrounding
-- whitespace is trimmed, internal runs of whitespace become one space, and
-- letters are upper-cased. Only letters, digits and single spaces are allowed,
-- and names are unique.
--
-- Both tables were empty when this migration was written.
-- =============================================================================

-- 1. CLASSES ------------------------------------------------------------------------

alter table public."classes"
  add constraint "classesNameGrade" check ("name" ~ '^([1-9]|1[0-2])$'),
  add constraint "classesSectionLetter" check ("section" ~ '^[A-Z]$');

-- THE CASE KEEPS A BAD NAME A CHECK VIOLATION (23514) INSTEAD OF A CAST ERROR.
alter table public."classes"
  add column "grade" smallint generated always as (
    case when "name" ~ '^[0-9]{1,2}$' then "name"::smallint end
  ) stored;

-- 2. SUBJECT CODES -----------------------------------------------------------------
-- A COLUMN DEFAULT RUNS AS THE INSERTING ROLE, SO AUTHENTICATED KEEPS EXECUTE (`app` IS
-- NOT EXPOSED BY THE DATA API, AND THE FUNCTION ONLY READS THE HIGHEST SUBJECT CODE).

create function app."nextSubjectCode"()
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  "nextNumber" bigint;
begin
  -- HELD UNTIL THE CALLING TRANSACTION ENDS, SO THE CODE IS INSERTED BEFORE ANOTHER
  -- CALLER CAN READ THE HIGHEST CODE.
  perform pg_advisory_xact_lock(hashtext('subjects.code'));

  select coalesce(max(substring(s."code" from 4)::bigint), 0) + 1 into "nextNumber"
  from public."subjects" s
  where s."code" ~ '^SUB[0-9]{1,15}$';

  return 'SUB' || lpad("nextNumber"::text, greatest(4, length("nextNumber"::text)), '0');
end;
$$;

revoke all on function app."nextSubjectCode"() from public, anon;
grant execute on function app."nextSubjectCode"() to authenticated, service_role;

alter table public."subjects" alter column "code" set default app."nextSubjectCode"();

-- COLUMN-LEVEL INSERT: THE DATA API CAN SET ONLY "name" AND "description" (RLS STILL
-- LIMITS INSERTS TO ADMINS), SO THE DEFAULT ALWAYS ASSIGNS THE CODE. CODES NEVER CHANGE.
revoke insert on public."subjects" from authenticated;
grant insert ("name", "description") on public."subjects" to authenticated;
revoke update ("code") on public."subjects" from authenticated;

-- 3. SUBJECT NAMES ------------------------------------------------------------------

create function app."normalizeSubjectName"()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new."name" := upper(btrim(regexp_replace(new."name", '\s+', ' ', 'g')));
  return new;
end;
$$;

revoke all on function app."normalizeSubjectName"() from public, anon, authenticated;

create trigger "subjectsNormalizeName"
  before insert or update of "name" on public."subjects"
  for each row execute function app."normalizeSubjectName"();

-- NAMES ARE UNIQUE NOW THAT THE CODE IS GENERATED: A RETRIED OR DOUBLE-SUBMITTED CREATE
-- WOULD OTHERWISE MAKE A SECOND, IDENTICAL SUBJECT. NORMALIZATION MAKES THIS CASE- AND
-- SPACING-INSENSITIVE.
alter table public."subjects"
  add constraint "subjectsNameFormat" check ("name" ~ '^[A-Z0-9]+( [A-Z0-9]+)*$'),
  add constraint "subjectsNameKey" unique ("name");
