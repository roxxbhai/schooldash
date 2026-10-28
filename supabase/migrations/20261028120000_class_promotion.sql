-- =============================================================================
-- Migration 20: promoting a class to the next academic year, graduation
-- =============================================================================
--
-- At the end of a year the students of a class are moved on together: each
-- selected student gets a new enrollment in a class of a LATER academic year
-- (usually the next class, same section), keeping or changing their roll
-- number. Their old enrollment, attendance and results stay as history.
-- Students of class 12 graduate instead: "students"."graduatedOn" is set and
-- their account is deactivated (sessions revoked), exactly like an admin
-- deactivation. History is never modified.
--
-- Who: administrators, and the class teacher of the class being promoted.
-- A class teacher can't see next year's classes or write enrollments under
-- RLS, so everything goes through three SECURITY DEFINER functions that check
-- the caller first and then touch only the students enrolled in that class:
--
--   classPromotionOptions(classId)                 → what the promote dialog needs
--   promoteStudents(sourceClassId, targetClassId, students jsonb)
--   graduateStudents(sourceClassId, studentIds uuid[], graduatedOn date)
--
-- Students who can't move are skipped and reported, not treated as errors:
-- inactive accounts, and students already enrolled in the target year (for
-- promotion) or later (for graduation). A roll number already taken in the
-- target class is reported per student and nothing is written.
-- =============================================================================

-- 1. GRADUATION DATE ------------------------------------------------------------------

alter table public."students" add column "graduatedOn" date;

-- 2. WHO MAY PROMOTE A CLASS ------------------------------------------------------------

create function app."isClassTeacherOf"("targetClassId" uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public."classes" c
    where c."id" = "targetClassId"
      and c."classTeacherId" = app."currentTeacherId"()
  )
$$;

create function app."canPromoteClass"("targetClassId" uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select app."isAdmin"() or app."isClassTeacherOf"("targetClassId")
$$;

revoke all on function app."isClassTeacherOf"(uuid) from public, anon;
revoke all on function app."canPromoteClass"(uuid) from public, anon;
grant execute on function app."isClassTeacherOf"(uuid) to authenticated;
grant execute on function app."canPromoteClass"(uuid) to authenticated;

-- 3. WHAT THE PROMOTE DIALOG NEEDS ---------------------------------------------------
-- Every class of a later academic year, where this class's students already
-- are in later years ("moves"), and the roll numbers already taken in those
-- later classes. Only ids, names and numbers: nothing a class teacher
-- couldn't see on a printed class list.

create function public."classPromotionOptions"("classId" uuid)
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

-- 4. PROMOTION ---------------------------------------------------------------------------
-- "students" is a jsonb array of {"studentId": uuid, "rollNumber": integer | null}.
-- Returns {"status": "promoted", "promoted": [{studentId, enrollmentId}], "skipped": [...]}
-- or, when a roll number is taken (nothing written),
-- {"status": "rollConflicts", "conflicts": [{studentId, rollNumber}]}.

create function public."promoteStudents"("sourceClassId" uuid, "targetClassId" uuid, "students" jsonb)
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

-- 5. GRADUATION --------------------------------------------------------------------------
-- Class 12 only. Each graduating student gets "graduatedOn" and an inactive
-- account (sessions revoked, as in setAppUserStatus). Students who already
-- graduated, are inactive, or are already enrolled in a later year (held
-- back) are skipped. Returns {"status": "graduated", "graduated": [uuid], "skipped": [...]}.

create function public."graduateStudents"("sourceClassId" uuid, "studentIds" uuid[], "graduatedOn" date)
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

revoke all on function public."classPromotionOptions"(uuid) from public, anon;
revoke all on function public."promoteStudents"(uuid, uuid, jsonb) from public, anon;
revoke all on function public."graduateStudents"(uuid, uuid[], date) from public, anon;
grant execute on function public."classPromotionOptions"(uuid) to authenticated, service_role;
grant execute on function public."promoteStudents"(uuid, uuid, jsonb) to authenticated, service_role;
grant execute on function public."graduateStudents"(uuid, uuid[], date) to authenticated, service_role;
