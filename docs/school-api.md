# School management API (Phases 3–5)

These endpoints run against the real Supabase database using the
request-scoped client, so every query is subject to RLS. They follow
`docs/auth-and-api.md` for authentication, CSRF, the `{ data, error }` envelope,
and validation (400 for bad params/query, 422 for bad bodies).

**Layering**

```
app/api/<resource>/…/route.ts        guard, CSRF, parse
  → lib/<domain>/service.ts          business rules
  → lib/<domain>/repository.ts       Supabase queries
```

Domains: `academic-years`, `subjects`, `classes`, `teachers`, `students`,
`enrollments`, `teacher-assignments`, `student-attendance`,
`teacher-attendance`, `exams`, `exam-subjects`, `results`, `report-cards`.

## Collections

`GET` collections accept `?page=` (default 1) and `?limit=` (default 20, max
100), and return:

```json
{ "data": { "items": [ … ], "pagination": { "page": 1, "limit": 20, "total": 41, "totalPages": 3 } }, "error": null }
```

A page past the end returns `items: []`.

## Endpoints and permissions

Two rules apply throughout:

- **"RLS-scoped"** means the database decides which rows the caller can see.
  A row outside that scope is simply absent from lists, and returns 404 from
  `GET /{id}`.
- **Admin-only writes** are enforced twice: by the route guard, and by RLS and
  grants in the database.

### Academic years

| Method | Path | Who | Notes |
| ------ | ---- | --- | ----- |
| GET | `/api/academic-years` | Any active user | Newest first. |
| POST | `/api/academic-years` | Admin | `{ name, startDate, endDate }`. `isCurrent` is rejected; use set-current. |
| GET | `/api/academic-years/{id}` | Any active user | |
| PATCH | `/api/academic-years/{id}` | Admin | `name`, `startDate`, `endDate`. `endDate > startDate`, checked by both Zod and the DB. |
| POST | `/api/academic-years/{id}/set-current` | Admin | Makes this the only current year, atomically (`setCurrentAcademicYear`). Idempotent. |

Academic years are never deleted (no DELETE grant), because classes,
enrollments and exams reference them.

### Subjects

| Method | Path | Who | Notes |
| ------ | ---- | --- | ----- |
| GET | `/api/subjects` | Any active user | `?search=` matches code or name. Letters, digits, space, `.`, `_`, `-` only. |
| POST | `/api/subjects` | Admin | `{ code, name, description? }`. The code is stored upper-case, so duplicates are case-insensitive (409). |
| GET | `/api/subjects/{id}` | Any active user | |
| PATCH | `/api/subjects/{id}` | Admin | `code`, `name`, `description`. A blank description clears it. |

Subjects are never deleted.

### Classes

| Method | Path | Who | Notes |
| ------ | ---- | --- | ----- |
| GET | `/api/classes` | RLS-scoped. Admin: all. Teacher: classes they teach or are class teacher of. Student: their class. | `?academicYearId=` |
| POST | `/api/classes` | Admin | `{ academicYearId, name, section, classTeacherId?, roomNumber? }`. The class teacher must exist and be active (422). |
| GET | `/api/classes/{id}` | RLS-scoped | Out of scope → 404. |
| PATCH | `/api/classes/{id}` | Admin | `name`, `section`, `classTeacherId` (nullable), `roomNumber`. `academicYearId` cannot change, which protects enrollments. |

Classes are never deleted.

### Teachers

| Method | Path | Who | Notes |
| ------ | ---- | --- | ----- |
| GET | `/api/teachers` | Admin | `?isActive=true|false`. Each item embeds `user: { fullName, email, phone, isActive }`. |
| POST | `/api/teachers` | Admin | `{ email, fullName, employeeCode, password?, qualification?, dateOfJoining? }`. Uses the provisioning service; the role is always TEACHER. |
| GET | `/api/teachers/{id}` | Admin; a teacher only for their own record | Other teachers and students → 403. |
| PATCH | `/api/teachers/{id}` | Admin | `fullName`, `phone`, `employeeCode`, `qualification`, `dateOfJoining`. Atomic across `users` and `teachers`. |

### Students

| Method | Path | Who | Notes |
| ------ | ---- | --- | ----- |
| GET | `/api/students` | Admin: all. Teacher: students they teach (RLS). Student: 403. | `?classId=`, `?isActive=`. Embeds `user`. |
| POST | `/api/students` | Admin | `{ email, fullName, admissionNumber, password?, admissionDate?, dateOfBirth?, gender?, bloodGroup?, fatherName?, motherName?, address? }`. Role is always STUDENT. |
| GET | `/api/students/{id}` | Admin; teacher if they teach the student (else 404); a student only themselves (else 403) | |
| PATCH | `/api/students/{id}` | Admin | Name, phone and profile fields. Atomic across `users` and `students`. |

**Passwords:** `password` is optional (12–72 characters). Without one, the
account exists but can't sign in until a password is set through Supabase's
password-reset flow (not yet built). Phone numbers are set with PATCH.

### Enrollments

| Method | Path | Who | Notes |
| ------ | ---- | --- | ----- |
| GET | `/api/enrollments` | RLS-scoped. Admin: all. Teacher: classes they teach. Student: their own; `?studentId=` of someone else → 403. | `?studentId=`, `?classId=`, `?academicYearId=` |
| POST | `/api/enrollments` | Admin | `{ studentId, classId, rollNumber? }`. The academic year is taken from the class. The student must exist and be active. |
| GET | `/api/enrollments/{id}` | RLS-scoped | |
| PATCH | `/api/enrollments/{id}` | Admin | `rollNumber` (nullable). `classId` only within the same academic year (422), and not once attendance or results exist (409). |

Rules:

- One class per student per academic year (409).
- Roll numbers are unique within a class (409).
- Enrollments are never deleted, so earlier years' rows remain as history.

### Teacher assignments

| Method | Path | Who | Notes |
| ------ | ---- | --- | ----- |
| GET | `/api/teacher-assignments` | RLS-scoped. Admin: all. Teacher: their own. Student: their class's. | `?teacherId=`, `?classId=`, `?subjectId=` |
| POST | `/api/teacher-assignments` | Admin | `{ teacherId, classId, subjectId }`. The teacher must be active. Duplicates → 409. Teachers can't assign themselves (API 403, Data API 42501). |
| GET | `/api/teacher-assignments/{id}` | RLS-scoped | |
| DELETE | `/api/teacher-assignments/{id}` | Admin | Returns the removed row. 409 while timetable entries use it. There is no update: remove and re-add. |

### Account status

| Method | Path | Who | Notes |
| ------ | ---- | --- | ----- |
| POST | `/api/users/{userId}/deactivate` | Admin | Returns `{ userId, isActive, changed, revokedSessions }`. Idempotent: a repeat returns `changed: false`. |
| POST | `/api/users/{userId}/reactivate` | Admin | |

`{userId}` is `users.id`, which is returned as `userId` on teacher and student
records. Rules:

- An admin can't change their own status (403).
- The last active admin can't be deactivated (409).
- Unknown user → 404.

### Student attendance (Phase 4)

| Method | Path | Who | Notes |
| ------ | ---- | --- | ----- |
| GET | `/api/student-attendance` | RLS-scoped. Admin: all. Teacher: classes they teach. Student: their own; `?studentId=` of someone else → 403. | `?classId=`, `?studentId=`, `?status=`, and either `?date=` or `?from=`/`?to=` (not both). Newest date first. |
| POST | `/api/student-attendance` | Admin; teacher of the class | `{ studentId, classId, attendanceDate, status, remarks? }`. Returns 201. |
| POST | `/api/student-attendance/bulk` | Admin; teacher of the class | `{ classId, attendanceDate, records: [{ studentId, status, remarks? }] }`, 1–200 records, no repeated students. **All-or-nothing:** written in one INSERT, so any invalid or duplicate record rejects the whole submission. Errors name the record, e.g. `records.3.studentId`. |
| GET | `/api/student-attendance/{id}` | RLS-scoped | |
| PATCH | `/api/student-attendance/{id}` | Admin; teacher of the record's class | `{ status?, remarks? }` only. `studentId`, `classId` and `attendanceDate` can't change (422 from the API; the database also refuses through column grants). |

**Statuses** are the database enum values exactly: `present`, `absent`,
`late`, `leave`.

**Rules.** These are checked by the service and enforced again in the database
by migration 8, so direct Data API writes can't bypass them:

| Rule | Response |
| ---- | -------- |
| The student must exist, be active, and be enrolled in the given class | 422 on `studentId` |
| The date must be within the class's academic year | 422 on `attendanceDate` |
| The date may not be in the future (today in UTC plus one day of tolerance for time zones) | 422 on `attendanceDate` |
| One record per student per date | 409 |

`markedByUserId` is always the acting user, and a correction updates it to the
corrector. Records are never deleted, and students never write.

### Teacher attendance (Phase 4)

| Method | Path | Who | Notes |
| ------ | ---- | --- | ----- |
| GET | `/api/teacher-attendance` | Admin: all. Teacher: own only; another `?teacherId=` → 403. Student: 403. | `?teacherId=`, `?status=`, `?date=` or `?from=`/`?to=` |
| POST | `/api/teacher-attendance` | Admin | `{ teacherId, attendanceDate, status, remarks? }` |
| GET | `/api/teacher-attendance/{id}` | Admin; the teacher themselves (others → 404). Student: 403. | |
| PATCH | `/api/teacher-attendance/{id}` | Admin | `{ status?, remarks? }` only. |

Rules:

- The teacher must exist and be active (422).
- The date may not be in the future (422).
- One record per teacher per date (409).
- Teachers can't record or correct attendance, including their own.
- There's no bulk endpoint, because no requirement called for one.

**Audit:** corrections (UPDATEs) to either table are audited with the old and
new rows. Initial records are the routine daily entry and aren't audited
individually.

### Exams (Phase 5)

| Method | Path | Who | Notes |
| ------ | ---- | --- | ----- |
| GET | `/api/exams` | Any active user | `?academicYearId=` |
| POST | `/api/exams` | Admin | `{ academicYearId, name, startDate?, endDate? }`. Dates must fall within the academic year and be in order. Names are unique per year (409). |
| GET | `/api/exams/{id}` | Any active user | |
| PATCH | `/api/exams/{id}` | Admin | `name`, `startDate`, `endDate` (nullable). `academicYearId` is fixed. |

No exam types, grading schemes or scheduling rules exist, so none are
enforced. Exams are never deleted.

### Exam subjects (papers)

| Method | Path | Who | Notes |
| ------ | ---- | --- | ----- |
| GET | `/api/exam-subjects` | RLS-scoped. Admin: all. Teacher: classes they teach. Student: their class. | `?examId=`, `?classId=`, `?subjectId=` |
| POST | `/api/exam-subjects` | Admin | `{ examId, classId, subjectId, maxMarks, passMarks?, examDate? }`. The class must be in the exam's year, and the year comes from the exam. `0 < maxMarks ≤ 9999.99`, `0 ≤ passMarks ≤ maxMarks`, at most two decimals. `examDate` must fall within the exam's dates, or the year if the exam has none. Duplicates → 409. |
| GET | `/api/exam-subjects/{id}` | RLS-scoped | |
| PATCH | `/api/exam-subjects/{id}` | Admin | `maxMarks`, `passMarks`, `examDate`. `maxMarks` can't drop below an already-entered mark (409). Exam, class and subject are fixed, so existing results can't be relabelled. |

### Results (marks)

| Method | Path | Who | Notes |
| ------ | ---- | --- | ----- |
| GET | `/api/results` | RLS-scoped. Admin: all. Teacher: papers whose **class and subject** they teach. Student: their own; another `?studentId=` → 403. | `?examId=`, `?examSubjectId=`, `?classId=`, `?subjectId=`, `?studentId=` |
| POST | `/api/results` | Admin; the paper's subject teacher | `{ examSubjectId, studentId, marksObtained, remarks? }`. `classId` comes from the paper and `enteredByUserId` from the session. |
| POST | `/api/results/bulk` | Same | `{ examSubjectId, records: [{ studentId, marksObtained, remarks? }] }`, 1–200 records. All-or-nothing; invalid records are named by index. |
| GET | `/api/results/{id}` | RLS-scoped | |
| PATCH | `/api/results/{id}` | Admin; the paper's subject teacher | `{ marksObtained?, remarks?, expectedUpdatedAt }`. **Optimistic concurrency:** `expectedUpdatedAt` must equal the record's current `updatedAt`, otherwise 409. Two simultaneous corrections can't both win. |

Rules:

| Rule | Response |
| ---- | -------- |
| The paper must exist (a teacher targeting a paper they can't see gets 403, so existence isn't revealed) | 422 / 403 |
| The student must be active and enrolled in the paper's class | 422 |
| `0 ≤ marksObtained ≤ maxMarks`, at most two decimals | 422 |
| One result per student per paper | 409 |

Other rules:

- **Absent and missing marks:** the schema has no "absent" state. A missing
  mark is simply a result that hasn't been entered, and **0 is a real mark**.
- **Class teachers** who don't teach the subject can't enter or read its marks,
  as required by RLS.
- **Corrections:** only `marksObtained` and `remarks` can change. Entries and
  corrections are audited with old and new values. Results are never deleted.
- **Enforced in the database too,** so direct Data API writes can't bypass
  them: the marks ceiling, non-negative marks, the enrollment foreign key,
  uniqueness, active students, and the column grants.

### Report-card data

| Method | Path | Who |
| ------ | ---- | --- |
| GET | `/api/students/{studentId}/report-cards/{examId}` | Admin: any student. Student: only themselves (else 403). Teacher: students in a class they teach that year, limited to the subjects they teach (other students → 404, other classes → 403). |

Returns:

- `student`, `exam`, and the **class the student was in during that exam's
  academic year**.
- `scope`: `allSubjects` or `assignedSubjects`.
- `subjects[]`, each with `maxMarks`, `passMarks`, `marksObtained`, `remarks`
  and `status`. `status` is `entered`, or `notEntered` when there's no mark.
- `summary`: `subjectsConfigured`, `subjectsWithMarks`, `complete`,
  `totalMarksObtained` and `totalMaxMarks`.

Calculation rules:

- Missing marks are `null`, **never zero**.
- Totals are sums over every configured subject, returned **only when the card
  is complete** (every subject marked, full scope). They're computed exactly in
  hundredths. Incomplete or teacher-scoped cards have `null` totals.
- **Not provided:** percentage, grade and pass/fail. No rounding rule, grade
  boundaries or pass rule is defined, so `passMarks` is returned as configured
  for a client to apply once a rule is agreed.
- **No publication state:** the schema has no flag, so students see entered
  marks immediately.
- No enrollment in the exam's year → 404.

## Account deactivation behaviour

`lib/auth/account-status.ts` calls `public."setAppUserStatus"`. Only the
secret-key client can execute it. In **one transaction** it:

1. locks the user (and, when deactivating an admin, all active admins);
2. applies the self-change and last-admin rules;
3. sets `isActive` and `deactivatedAt`;
4. on deactivation, **deletes the user's Supabase Auth sessions**, which revokes
   their refresh tokens;
5. writes `users.deactivate` / `users.reactivate` to `auditLogs`.

For a deactivated user who was signed in:

| Path | Result |
| ---- | ------ |
| Any API route | **401.** The session no longer exists, so `getUser()` fails. If somehow a session remained, `isActive = false` gives 403 `ACCOUNT_INACTIVE`. |
| Login | 403 `ACCOUNT_INACTIVE`, and the new session is discarded. |
| Refresh token | Rejected. |
| An access token issued before deactivation, used directly against the Data API | Still cryptographically valid until it expires (1 h by default). **RLS lets it read only the user's own `users` row**, so it can't see any school data. Shorten the JWT expiry in the Supabase dashboard if needed. |

Nothing else changes: profiles, enrollments, assignments, attendance, results
and audit history are kept. Reactivation restores access; the user signs in
again.

## Error mapping

`lib/api/db-errors.ts` (`mapDbError`) maps on the SQLSTATE or PostgREST code
and the constraint name. Raw messages, details, hints and constraint names are
never returned.

| Code | Meaning | Response |
| ---- | ------- | -------- |
| `23505` | unique violation | 409 `CONFLICT`, with a per-constraint message |
| `23503` (insert/update) | referenced row missing | 422 `VALIDATION_ERROR` on the field |
| `23503` (delete/update of a referenced row) | still referenced | 409 `CONFLICT` |
| `23514`, `23502`, `22001`, `22007`, `22008`, `22023` | check, not-null, length or date violations | 422 |
| `22P02`, `22003` | malformed literal | 400 `BAD_REQUEST` |
| `42501` | RLS or grant denied | 403 `FORBIDDEN` |
| `PGRST116`, `P0002` | no such row | 404 `NOT_FOUND` |
| `PGRST301`–`303` | JWT problems | 401 |
| `SD001` | admin changing their own status | 403 |
| `SD002` | last active admin | 409 |
| `40001`, `40P01`, `57014`, `53300` | retryable | 503 |
| no code | network failure | 503 |
| anything else | | 500 `INTERNAL_ERROR`, logged with code only |

Repositories go through `lib/db/query.ts` (`many`, `maybeOne`, `one`,
`rpcResult`, `page`). Every Supabase result is checked, so a failed query
always throws and never yields empty or fabricated data.

## Audit trail

Triggers (`app."auditRowChange"`) write `auditLogs` in the same transaction as
the change, with `actorUserId` set to the signed-in user:

| Table | Events | Data recorded |
| ----- | ------ | ------------- |
| `academicYears`, `classes`, `subjects` | insert, update | old and new rows |
| `studentEnrollments` | insert, update | old and new rows |
| `teacherAssignments` | insert, delete | old and new rows |
| `users` (fullName/phone), `students`, `teachers` | update | **changed field names only (redacted)** |

Provisioning (`users.provision`) and status changes (`users.deactivate` /
`users.reactivate`) audit themselves. Updates that change nothing aren't
logged.

## Atomicity

| Operation | Guarantee |
| --------- | --------- |
| Teacher/student profile update | One transaction (`updateTeacherProfile` / `updateStudentProfile`, run as the caller). |
| Set current academic year | One transaction. |
| Status change | One transaction, including session revocation and audit. |
| Account creation | Spans Supabase Auth and Postgres, so it **is not atomic**. The database part is one transaction. If it fails, the Auth user is deleted again (compensation). If that also fails, `ProvisioningRecoveryError` names the orphaned Auth user; re-run with `linkExistingAuthUser` or delete it in the dashboard. |
| Single-row creates and updates | One statement, so atomic, with the audit row written by the same transaction's trigger. |

## When Supabase is unavailable

Every endpoint returns `503 SERVICE_UNAVAILABLE` and never fabricated data.
This is verified for every endpoint in `tests/api/unavailable.test.ts`, against
a real connection failure, at both the auth layer and the data layer.

`postgrest-js` retries idempotent reads (GET/HEAD) three times, with 1 s, 2 s
and 4 s backoff, before giving up. During an outage, reads therefore take
about 7 s to return 503. Writes aren't retried.

## Testing

| Suite | Command | Talks to Supabase? |
| ----- | ------- | ------------------ |
| Unit: services, mapper, query helpers, status service | `npm test` | **No.** Repositories and provisioning are mocked. |
| Integration: `account-status.test.ts`, `school-resources.test.ts`, `people.test.ts` | `npm run test:integration` | **Yes.** Route Handlers run in-process against the real project. |

How the integration tests stay safe:

- **Coverage:** `phase3-matrix.test.ts` and the matrix section of
  `attendance.test.ts` run every endpoint and method through the same checks:
  no session, a deactivated session, each forbidden role, CSRF, malformed and
  missing ids, malformed/unknown/empty bodies, pagination and filter
  validation, and the envelope shape.
- **Acting identities:** a persistent integration teacher
  (`schooldash-it-teacher@example.com`) also exists, for teacher-side audited
  actions such as attendance corrections. Like the integration admin, it's
  reactivated with a new password for each run and deactivated afterwards.
- **Audit-referenced users:** if a test user is ever referenced by an audit
  entry as the actor, cleanup retains it (deactivated, password rotated) and
  logs a warning instead of failing. `teardown()` always retires the
  persistent identities, even if cleanup fails.
- **Acting admin:** writes are performed by a dedicated integration admin
  (`schooldash-it-admin@example.com`). It's reactivated with a fresh random
  password each run and deactivated afterwards. It has to persist because audit
  entries reference it.
- **Own data only:** everything else is uniquely named per run, tracked, and
  deleted afterwards. Only tracked IDs are deleted, so the real admin and real
  data are never touched.
- **Real data present:** assertions never assume an empty database.
- **Current academic year:** switching it is tested only inside a rolled-back
  transaction, so the school's real current year is never changed.
- **What persists:** only `auditLogs` rows, which are append-only by design.
