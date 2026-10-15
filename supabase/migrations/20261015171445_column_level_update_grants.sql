-- =============================================================================
-- Migration 9: column-level UPDATE privileges (Phase 5 audit, Checkpoint 5A)
-- =============================================================================
--
-- Principle: API users may update only the columns the application edits.
-- Identity, ownership and bookkeeping columns (id, foreign keys that define
-- what a row IS, createdAt, updatedAt) are immutable through the Data API.
--
-- Defects fixed (all reachable by signed-in users calling the Data API
-- directly, bypassing the app's services):
--   * results: a teacher could change studentId / examSubjectId / classId of
--     a mark in a subject they teach — moving marks to another student or
--     relabelling them.
--   * examSubjects: changing subjectId / examId would silently relabel every
--     result already entered for that paper.
--   * every table: id, createdAt and updatedAt were writable; a writable
--     updatedAt would defeat optimistic concurrency checks.
--   * exams.academicYearId and classes.academicYearId were writable.
--
-- RLS policies are unchanged; these grants narrow WHICH columns an allowed
-- UPDATE may touch. "updatedAt" is still maintained by the setUpdatedAt
-- trigger (trigger assignments are not subject to column privileges).
-- Tables whose APIs do not exist yet (timetableEntries, notices,
-- noticeAudiences) are left for the phase that builds them.
-- =============================================================================

revoke update on
  "academicYears", "classes", "subjects", "teachers", "students",
  "studentEnrollments", "teacherAssignments", "exams", "examSubjects", "results"
  from authenticated;

-- isCurrent is changed only through setCurrentAcademicYear (SECURITY INVOKER).
grant update ("name", "startDate", "endDate", "isCurrent") on "academicYears" to authenticated;
grant update ("name", "section", "classTeacherId", "roomNumber") on "classes" to authenticated;
grant update ("code", "name", "description") on "subjects" to authenticated;
grant update ("employeeCode", "qualification", "dateOfJoining") on "teachers" to authenticated;
grant update ("admissionNumber", "admissionDate", "dateOfBirth", "gender", "bloodGroup",
              "fatherName", "motherName", "address") on "students" to authenticated;
-- Moving a student within the same year; the composite FK keeps the year fixed.
grant update ("classId", "rollNumber") on "studentEnrollments" to authenticated;
-- teacherAssignments: no updates (remove and re-add instead).
grant update ("name", "startDate", "endDate") on "exams" to authenticated;
grant update ("examDate", "maxMarks", "passMarks") on "examSubjects" to authenticated;
grant update ("marksObtained", "remarks", "enteredByUserId") on "results" to authenticated;
