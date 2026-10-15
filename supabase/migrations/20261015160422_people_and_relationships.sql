-- =============================================================================
-- Migration 7: people and academic relationships
-- =============================================================================
--
-- 1. updateTeacherProfile / updateStudentProfile: an admin edit of a person
--    touches two tables (users: fullName/phone, plus the profile row). These
--    functions apply both in ONE transaction. SECURITY INVOKER: the caller's
--    grants and RLS apply (users is still limited to fullName/phone by column
--    grants), and the functions additionally require an active admin.
--    Patches are jsonb objects; only keys present are changed.
--
-- 2. Audit triggers for people and relationships. Personal data is redacted:
--    only the names of changed fields are recorded.
-- =============================================================================


-- 1. Atomic profile updates ---------------------------------------------------------

create function public."updateTeacherProfile"(
  "teacherId"    uuid,
  "userPatch"    jsonb default '{}'::jsonb,
  "profilePatch" jsonb default '{}'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  "targetUserId" uuid;
begin
  if not app."isAdmin"() then
    raise exception 'only administrators can edit teachers' using errcode = '42501';
  end if;

  select t."userId" into "targetUserId" from public."teachers" t
  where t."id" = "updateTeacherProfile"."teacherId";
  if not found then
    raise exception 'teacher not found' using errcode = 'P0002';
  end if;

  if "userPatch" ?| array['fullName', 'phone'] then
    update public."users" set
      "fullName" = case when "userPatch" ? 'fullName' then "userPatch" ->> 'fullName' else "fullName" end,
      "phone"    = case when "userPatch" ? 'phone'    then "userPatch" ->> 'phone'    else "phone"    end
    where "id" = "targetUserId";
  end if;

  if "profilePatch" ?| array['employeeCode', 'qualification', 'dateOfJoining'] then
    update public."teachers" set
      "employeeCode"  = case when "profilePatch" ? 'employeeCode'  then "profilePatch" ->> 'employeeCode'  else "employeeCode"  end,
      "qualification" = case when "profilePatch" ? 'qualification' then "profilePatch" ->> 'qualification' else "qualification" end,
      "dateOfJoining" = case when "profilePatch" ? 'dateOfJoining' then ("profilePatch" ->> 'dateOfJoining')::date else "dateOfJoining" end
    where "id" = "updateTeacherProfile"."teacherId";
  end if;
end;
$$;

create function public."updateStudentProfile"(
  "studentId"    uuid,
  "userPatch"    jsonb default '{}'::jsonb,
  "profilePatch" jsonb default '{}'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  "targetUserId" uuid;
begin
  if not app."isAdmin"() then
    raise exception 'only administrators can edit students' using errcode = '42501';
  end if;

  select s."userId" into "targetUserId" from public."students" s
  where s."id" = "updateStudentProfile"."studentId";
  if not found then
    raise exception 'student not found' using errcode = 'P0002';
  end if;

  if "userPatch" ?| array['fullName', 'phone'] then
    update public."users" set
      "fullName" = case when "userPatch" ? 'fullName' then "userPatch" ->> 'fullName' else "fullName" end,
      "phone"    = case when "userPatch" ? 'phone'    then "userPatch" ->> 'phone'    else "phone"    end
    where "id" = "targetUserId";
  end if;

  if "profilePatch" ?| array['admissionNumber', 'admissionDate', 'dateOfBirth', 'gender',
                             'bloodGroup', 'fatherName', 'motherName', 'address'] then
    update public."students" set
      "admissionNumber" = case when "profilePatch" ? 'admissionNumber' then "profilePatch" ->> 'admissionNumber' else "admissionNumber" end,
      "admissionDate"   = case when "profilePatch" ? 'admissionDate'   then ("profilePatch" ->> 'admissionDate')::date else "admissionDate" end,
      "dateOfBirth"     = case when "profilePatch" ? 'dateOfBirth'     then ("profilePatch" ->> 'dateOfBirth')::date else "dateOfBirth" end,
      "gender"          = case when "profilePatch" ? 'gender'          then "profilePatch" ->> 'gender'      else "gender"      end,
      "bloodGroup"      = case when "profilePatch" ? 'bloodGroup'      then "profilePatch" ->> 'bloodGroup'  else "bloodGroup"  end,
      "fatherName"      = case when "profilePatch" ? 'fatherName'      then "profilePatch" ->> 'fatherName'  else "fatherName"  end,
      "motherName"      = case when "profilePatch" ? 'motherName'      then "profilePatch" ->> 'motherName'  else "motherName"  end,
      "address"         = case when "profilePatch" ? 'address'         then "profilePatch" ->> 'address'     else "address"     end
    where "id" = "updateStudentProfile"."studentId";
  end if;
end;
$$;

revoke all on function public."updateTeacherProfile"(uuid, jsonb, jsonb) from public, anon;
revoke all on function public."updateStudentProfile"(uuid, jsonb, jsonb) from public, anon;
grant execute on function public."updateTeacherProfile"(uuid, jsonb, jsonb) to authenticated, service_role;
grant execute on function public."updateStudentProfile"(uuid, jsonb, jsonb) to authenticated, service_role;


-- 2. Audit triggers -----------------------------------------------------------------

create trigger "usersProfileAudit" after update of "fullName", "phone" on "users"
  for each row execute function app."auditRowChange"('redact');
create trigger "teachersAudit" after update on "teachers"
  for each row execute function app."auditRowChange"('redact');
create trigger "studentsAudit" after update on "students"
  for each row execute function app."auditRowChange"('redact');
create trigger "studentEnrollmentsAudit" after insert or update on "studentEnrollments"
  for each row execute function app."auditRowChange"();
create trigger "teacherAssignmentsAudit" after insert or delete on "teacherAssignments"
  for each row execute function app."auditRowChange"();
