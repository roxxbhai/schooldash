-- =============================================================================
-- Migration 21: promotion functions out of the exposed schema
-- =============================================================================
--
-- Every SECURITY DEFINER function in "public" (the schema the Data API
-- exposes) is service_role only; definer functions callable by signed-in users
-- live in the unexposed "app" schema, like the RLS helpers. Migration 20 put
-- its three promotion functions in "public" as SECURITY DEFINER. They move to
-- "app" unchanged (same checks: admins and the class teacher only), and the
-- "public" names become thin SECURITY INVOKER wrappers, so the API and its
-- callers stay exactly the same.
-- =============================================================================

-- 1. THE PRIVILEGED BODIES, UNCHANGED, IN "app" ----------------------------------------

create function app."classPromotionOptions"("classId" uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  "sourceStart" date;
begin
  if not app."canPromoteClass"("classPromotionOptions"."classId") then
    raise exception 'only administrators and the class teacher can promote a class' using errcode = '42501';
  end if;

  select y."startDate" into "sourceStart"
  from public."classes" c
  join public."academicYears" y on y."id" = c."academicYearId"
  where c."id" = "classPromotionOptions"."classId";
  if not found then
    raise exception 'class not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'classes', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', c."id", 'academicYearId', c."academicYearId", 'name', c."name", 'section', c."section")
        order by y."startDate", c."grade", c."section"
      )
      from public."classes" c
      join public."academicYears" y on y."id" = c."academicYearId"
      where y."startDate" > "sourceStart"
    ), '[]'::jsonb),
    'moves', coalesce((
      select jsonb_agg(
        jsonb_build_object('studentId', later."studentId", 'classId', later."classId", 'academicYearId', later."academicYearId")
        order by y."startDate"
      )
      from public."studentEnrollments" cur
      join public."studentEnrollments" later on later."studentId" = cur."studentId"
      join public."academicYears" y on y."id" = later."academicYearId"
      where cur."classId" = "classPromotionOptions"."classId"
        and y."startDate" > "sourceStart"
    ), '[]'::jsonb),
    'takenRollNumbers', coalesce((
      select jsonb_agg(jsonb_build_object('classId', e."classId", 'rollNumber', e."rollNumber"))
      from public."studentEnrollments" e
      join public."academicYears" y on y."id" = e."academicYearId"
      where y."startDate" > "sourceStart"
        and e."rollNumber" is not null
    ), '[]'::jsonb)
  );
end;
$$;

create function app."promoteStudents"("sourceClassId" uuid, "targetClassId" uuid, "students" jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  "sourceStart"      date;
  "targetYearId"     uuid;
  "targetStart"      date;
  "item"             jsonb;
  "candidateId"      uuid;
  "candidateRoll"    integer;
  "isStudentActive"  boolean;
  "enrolledClassId"  uuid;
  "seenIds"          uuid[] := '{}';
  "usedRolls"        integer[] := '{}';
  "eligibleIds"      uuid[] := '{}';
  "eligibleRolls"    integer[] := '{}';
  "skipped"          jsonb := '[]'::jsonb;
  "conflicts"        jsonb := '[]'::jsonb;
  "promoted"         jsonb;
begin
  if not app."canPromoteClass"("promoteStudents"."sourceClassId") then
    raise exception 'only administrators and the class teacher can promote a class' using errcode = '42501';
  end if;

  select y."startDate" into "sourceStart"
  from public."classes" c
  join public."academicYears" y on y."id" = c."academicYearId"
  where c."id" = "promoteStudents"."sourceClassId";
  if not found then
    raise exception 'class not found' using errcode = 'P0002';
  end if;

  -- Locking the target class serializes promotions into it, so two of them
  -- can't both pass the roll number check below.
  select c."academicYearId", y."startDate" into "targetYearId", "targetStart"
  from public."classes" c
  join public."academicYears" y on y."id" = c."academicYearId"
  where c."id" = "promoteStudents"."targetClassId"
  for update of c;
  if not found then
    raise exception 'target class not found (constraint "promotionTargetClassExists")' using errcode = '22023';
  end if;
  if "targetStart" <= "sourceStart" then
    raise exception 'students can only move to a later academic year (constraint "promotionTargetLaterYear")' using errcode = '22023';
  end if;

  if jsonb_typeof("promoteStudents"."students") is distinct from 'array'
     or jsonb_array_length("promoteStudents"."students") = 0 then
    raise exception 'choose at least one student (constraint "promotionStudentsRequired")' using errcode = '22023';
  end if;

  for "item" in select value from jsonb_array_elements("promoteStudents"."students") loop
    "candidateId" := ("item" ->> 'studentId')::uuid;
    "candidateRoll" := ("item" ->> 'rollNumber')::integer;

    if "candidateId" is null or "candidateId" = any("seenIds") then
      raise exception 'each student can be listed once (constraint "promotionStudentsUnique")' using errcode = '22023';
    end if;
    "seenIds" := array_append("seenIds", "candidateId");

    if not exists (
      select 1 from public."studentEnrollments" e
      where e."studentId" = "candidateId" and e."classId" = "promoteStudents"."sourceClassId"
    ) then
      raise exception 'every student must be enrolled in the class (constraint "promotionStudentInClass")' using errcode = '22023';
    end if;

    select u."isActive" into "isStudentActive"
    from public."students" s
    join public."users" u on u."id" = s."userId"
    where s."id" = "candidateId";
    if not "isStudentActive" then
      "skipped" := "skipped" || jsonb_build_object('studentId', "candidateId", 'reason', 'inactive');
      continue;
    end if;

    select e."classId" into "enrolledClassId"
    from public."studentEnrollments" e
    where e."studentId" = "candidateId" and e."academicYearId" = "targetYearId";
    if found then
      "skipped" := "skipped" || jsonb_build_object('studentId', "candidateId", 'reason', 'alreadyEnrolled', 'classId', "enrolledClassId");
      continue;
    end if;

    if "candidateRoll" is not null then
      if "candidateRoll" < 1 then
        raise exception 'roll numbers are positive (constraint "studentEnrollmentsRollNumberPositive")' using errcode = '22023';
      end if;
      if "candidateRoll" = any("usedRolls") or exists (
        select 1 from public."studentEnrollments" e
        where e."classId" = "promoteStudents"."targetClassId" and e."rollNumber" = "candidateRoll"
      ) then
        "conflicts" := "conflicts" || jsonb_build_object('studentId', "candidateId", 'rollNumber', "candidateRoll");
      end if;
      "usedRolls" := array_append("usedRolls", "candidateRoll");
    end if;

    "eligibleIds" := array_append("eligibleIds", "candidateId");
    "eligibleRolls" := array_append("eligibleRolls", "candidateRoll");
  end loop;

  if jsonb_array_length("conflicts") > 0 then
    return jsonb_build_object('status', 'rollConflicts', 'conflicts', "conflicts");
  end if;

  with "inserted" as (
    insert into public."studentEnrollments" ("studentId", "classId", "academicYearId", "rollNumber")
    select t."studentId", "promoteStudents"."targetClassId", "targetYearId", t."rollNumber"
    from unnest("eligibleIds", "eligibleRolls") as t("studentId", "rollNumber")
    returning "studentEnrollments"."id", "studentEnrollments"."studentId"
  )
  select coalesce(jsonb_agg(jsonb_build_object('studentId', i."studentId", 'enrollmentId', i."id")), '[]'::jsonb)
  into "promoted"
  from "inserted" i;

  insert into public."auditLogs" ("actorUserId", "action", "entityType", "entityId", "metadata")
  values (
    app."currentUserId"(),
    'classes.promote',
    'classes',
    "promoteStudents"."sourceClassId",
    jsonb_build_object(
      'targetClassId', "promoteStudents"."targetClassId",
      'promoted', jsonb_array_length("promoted"),
      'skipped', jsonb_array_length("skipped")
    )
  );

  return jsonb_build_object('status', 'promoted', 'promoted', "promoted", 'skipped', "skipped");
end;
$$;

create function app."graduateStudents"("sourceClassId" uuid, "studentIds" uuid[], "graduatedOn" date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  "sourceStart"      date;
  "sourceGrade"      text;
  "candidateId"      uuid;
  "student"          record;
  "revokedSessions"  integer;
  "graduated"        uuid[] := '{}';
  "skipped"          jsonb := '[]'::jsonb;
begin
  if not app."canPromoteClass"("graduateStudents"."sourceClassId") then
    raise exception 'only administrators and the class teacher can graduate a class' using errcode = '42501';
  end if;

  select y."startDate", c."name" into "sourceStart", "sourceGrade"
  from public."classes" c
  join public."academicYears" y on y."id" = c."academicYearId"
  where c."id" = "graduateStudents"."sourceClassId";
  if not found then
    raise exception 'class not found' using errcode = 'P0002';
  end if;
  if "sourceGrade" <> '12' then
    raise exception 'only class 12 can graduate (constraint "graduationFinalClass")' using errcode = '22023';
  end if;

  if coalesce(cardinality("graduateStudents"."studentIds"), 0) = 0 then
    raise exception 'choose at least one student (constraint "promotionStudentsRequired")' using errcode = '22023';
  end if;
  if cardinality("graduateStudents"."studentIds") <> (select count(distinct id) from unnest("graduateStudents"."studentIds") as id) then
    raise exception 'each student can be listed once (constraint "promotionStudentsUnique")' using errcode = '22023';
  end if;
  if "graduateStudents"."graduatedOn" is null then
    raise exception 'the graduation date is required (constraint "graduationDateRequired")' using errcode = '22023';
  end if;

  foreach "candidateId" in array "graduateStudents"."studentIds" loop
    if not exists (
      select 1 from public."studentEnrollments" e
      where e."studentId" = "candidateId" and e."classId" = "graduateStudents"."sourceClassId"
    ) then
      raise exception 'every student must be enrolled in the class (constraint "promotionStudentInClass")' using errcode = '22023';
    end if;

    select s."id", s."graduatedOn", u."id" as "userId", u."authUserId", u."isActive" into "student"
    from public."students" s
    join public."users" u on u."id" = s."userId"
    where s."id" = "candidateId"
    for update of s, u;

    if "student"."graduatedOn" is not null then
      "skipped" := "skipped" || jsonb_build_object('studentId', "candidateId", 'reason', 'alreadyGraduated');
      continue;
    end if;
    if not "student"."isActive" then
      "skipped" := "skipped" || jsonb_build_object('studentId', "candidateId", 'reason', 'inactive');
      continue;
    end if;
    if exists (
      select 1 from public."studentEnrollments" e
      join public."academicYears" y on y."id" = e."academicYearId"
      where e."studentId" = "candidateId" and y."startDate" > "sourceStart"
    ) then
      "skipped" := "skipped" || jsonb_build_object('studentId', "candidateId", 'reason', 'enrolledLater');
      continue;
    end if;

    update public."students" s set "graduatedOn" = "graduateStudents"."graduatedOn" where s."id" = "candidateId";
    update public."users" u set "isActive" = false, "deactivatedAt" = now() where u."id" = "student"."userId";
    delete from auth.sessions s where s.user_id = "student"."authUserId";
    get diagnostics "revokedSessions" = row_count;

    insert into public."auditLogs" ("actorUserId", "action", "entityType", "entityId", "metadata")
    values (
      app."currentUserId"(),
      'students.graduate',
      'students',
      "candidateId",
      jsonb_build_object('classId', "graduateStudents"."sourceClassId", 'graduatedOn', "graduateStudents"."graduatedOn", 'revokedSessions', "revokedSessions")
    );

    "graduated" := array_append("graduated", "candidateId");
  end loop;

  return jsonb_build_object('status', 'graduated', 'graduated', to_jsonb("graduated"), 'skipped', "skipped");
end;
$$;

revoke all on function app."classPromotionOptions"(uuid) from public, anon;
revoke all on function app."promoteStudents"(uuid, uuid, jsonb) from public, anon;
revoke all on function app."graduateStudents"(uuid, uuid[], date) from public, anon;
grant execute on function app."classPromotionOptions"(uuid) to authenticated, service_role;
grant execute on function app."promoteStudents"(uuid, uuid, jsonb) to authenticated, service_role;
grant execute on function app."graduateStudents"(uuid, uuid[], date) to authenticated, service_role;

-- 2. THE API NAMES CALL THEM WITH THE CALLER'S OWN RIGHTS -----------------------------
-- Grants on the "public" functions are kept by CREATE OR REPLACE.

create or replace function public."classPromotionOptions"("classId" uuid)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select app."classPromotionOptions"("classPromotionOptions"."classId")
$$;

create or replace function public."promoteStudents"("sourceClassId" uuid, "targetClassId" uuid, "students" jsonb)
returns jsonb
language sql security invoker
set search_path = ''
as $$
  select app."promoteStudents"("promoteStudents"."sourceClassId", "promoteStudents"."targetClassId", "promoteStudents"."students")
$$;

create or replace function public."graduateStudents"("sourceClassId" uuid, "studentIds" uuid[], "graduatedOn" date)
returns jsonb
language sql security invoker
set search_path = ''
as $$
  select app."graduateStudents"("graduateStudents"."sourceClassId", "graduateStudents"."studentIds", "graduateStudents"."graduatedOn")
$$;
