# Database — schema, security design, and provisioning

> **Status: applied and verified (2026-10-15).** The schema, grants and RLS
> policies below are live in the project's database via the migrations in
> `supabase/migrations/`, and are exercised by real-database tests in
> `tests/integration/` (`npm run test:integration`). Setup, migration workflow
> and operations: `docs/supabase.md`.

## Contents

- [Files](#files)
- [Schema overview](#schema-overview)
- [Design decisions and corrections](#design-decisions-and-corrections)
- [Security model](#security-model)
- [RLS policy design (per table)](#rls-policy-design-per-table)
- [Initial-admin provisioning](#initial-admin-provisioning)
- [Deferred to later phases](#deferred-to-later-phases)

## Files

| File | Purpose |
| ---- | ------- |
| `supabase/migrations/20261015142406_initial_schema.sql` | Enums, 17 tables, constraints, indexes, triggers; RLS enabled (deny-by-default). Formerly `db/schema.sql`. |
| `supabase/migrations/20261015142408_rls_policies_and_grants.sql` | Table/column grants, `app.*` helper functions, self-privilege trigger, RLS policies. |
| `supabase/migrations/20261015142410_account_provisioning.sql` | `provisionAppUser` / `findAuthUserIdByEmail` RPCs (service role only). |
| `supabase/migrations/20261015142822_consolidate_policies_and_fk_indexes.sql` | Advisor fixes: one permissive policy per command; covering indexes for composite FKs. |
| `supabase/migrations/20261015154145_account_status.sql` | `setAppUserStatus` (SECURITY DEFINER, service_role only): status change + Auth session revocation + audit. |
| `supabase/migrations/20261015155521_school_resources.sql` | `setCurrentAcademicYear` (invoker, admin-checked); `app."auditRowChange"` audit trigger. |
| `supabase/migrations/20261015160422_people_and_relationships.sql` | Atomic `updateTeacherProfile` / `updateStudentProfile` (invoker, admin-checked); more audit triggers (people redacted). |
| `supabase/migrations/20261015163718_attendance_integrity.sql` | Attendance identity made immutable (column grants), insert-time date/academic-year/active-account checks (triggers), correction audit. |
| `lib/supabase/database.types.ts` | Types generated from the live schema (`npm run db:types`). |
| `README.md` | This document. |

## Schema overview

Enums: `userRole` (`admin`, `teacher`, `student`), `attendanceStatus`
(`present`, `absent`, `late`, `leave`), `noticeStatus` (`draft`, `published`,
`archived`).

Tables, in creation (foreign-key dependency) order:

| #  | Table                | Key relationships                                                                 |
| -- | -------------------- | --------------------------------------------------------------------------------- |
| 1  | `users`              | `authUserId` → `auth.users(id)` (unique). Holds `role` and `isActive`.            |
| 2  | `students`           | 1:1 with `users` via `(userId, role)` → `users(id, role)`; role fixed to `student`. |
| 3  | `teachers`           | 1:1 with `users` via `(userId, role)` → `users(id, role)`; role fixed to `teacher`. |
| 4  | `academicYears`      | At most one row with `isCurrent = true`.                                          |
| 5  | `classes`            | → `academicYears`; optional `classTeacherId` → `teachers`. Unique `(academicYearId, name, section)`. |
| 6  | `studentEnrollments` | → `students`, `(classId, academicYearId)` → `classes`. One class per student per year. |
| 7  | `subjects`           | Unique `code`.                                                                    |
| 8  | `teacherAssignments` | → `teachers`, `classes`, `subjects`. Unique `(teacherId, classId, subjectId)`.    |
| 9  | `studentAttendance`  | `(studentId, classId)` → `studentEnrollments`. Unique per student per day.        |
| 10 | `teacherAttendance`  | → `teachers`. Unique per teacher per day.                                         |
| 11 | `exams`              | → `academicYears`. Unique name per year.                                          |
| 12 | `examSubjects`       | `(examId, academicYearId)` → `exams`, `(classId, academicYearId)` → `classes`, → `subjects`. Holds `maxMarks`/`passMarks`. |
| 13 | `results`            | `(examSubjectId, classId)` → `examSubjects`, `(studentId, classId)` → `studentEnrollments`. |
| 14 | `timetableEntries`   | → `classes`, `subjects`; `(teacherId, classId, subjectId)` → `teacherAssignments`. |
| 15 | `notices`            | `createdByUserId` → `users`. `status` gates visibility.                          |
| 16 | `noticeAudiences`    | → `notices` (cascade), exactly one of `audienceRole` / `classId`.                 |
| 17 | `auditLogs`          | Append-only; `actorUserId` → `users` (nullable for system actions).               |

### Integrity guarantees

- **Marks:** `maxMarks > 0`; `0 ≤ passMarks ≤ maxMarks`; `marksObtained ≥ 0`.
  `marksObtained ≤ maxMarks` crosses tables, so it is enforced by two triggers:
  `resultsEnforceMarksWithinMax` (on result insert/update) and
  `examSubjectsPreventMaxMarksBelowResults` (blocks lowering `maxMarks` below
  marks already recorded).
- **Same-year consistency:** composite foreign keys ensure an enrollment's class,
  and an exam subject's exam and class, all belong to the same academic year.
- **Enrollment proof:** attendance and results reference
  `studentEnrollments(studentId, classId)`, so they can only be recorded for a
  student actually enrolled in that class. Results additionally must reference
  an exam paper for that same class.
- **Profile/role consistency:** `students`/`teachers` reference
  `users(id, role)` with a role column fixed by CHECK, so a student profile
  cannot attach to a teacher account, and a user's role cannot be changed while
  a profile depends on it (`ON UPDATE RESTRICT`).
- **Timetable staffing:** a timetabled teacher must hold a matching
  `teacherAssignments` row.
- **Notices:** a `published` notice must have `publishedAt`.
- **Audit logs:** `UPDATE`/`DELETE` are rejected by trigger for every role.

### Historical records and deactivation

People are never hard-deleted. Deactivation sets `users.isActive = false` and
`users.deactivatedAt` (a CHECK keeps the two consistent). Every foreign key into
people, classes, exams and subjects uses `ON DELETE RESTRICT`, so attendance,
results, enrollments and audit history remain intact. `users.authUserId`
references `auth.users` with `ON DELETE RESTRICT` as well: an auth account that
owns history cannot be deleted out from under it — it is deactivated (and can
be banned in Supabase Auth) instead. Inactive users are denied by every RLS
policy via the helper functions below.

## Design decisions and corrections

No prior schema specification exists in this repository, so the column set was
derived from the 17 required tables, the conventions in the Phase 1 brief, and
the data shown in the existing student/teacher UI mockups (profile, results,
attendance, timetable, notices). **The schema should be reviewed against the
agreed specification before it is applied; any differences should be corrected
in a new migration and noted here.**

Decisions that go beyond a literal reading of the brief:

1. **`attendanceStatus` includes `late`.** The UI shows `present`, `absent` and
   `leave`; `late` was added as a standard attendance state. Remove it if not
   wanted.
2. **Active status lives only on `users`.** Students and teachers do not carry a
   separate active flag, avoiding two sources of truth for deactivation.
3. **`role` column on `students`/`teachers`.** Exists only to support the
   composite FK that enforces profile/role consistency; it is fixed by CHECK.
4. **`academicYearId` on `studentEnrollments` and `examSubjects`.** Redundant
   with the class's year, but required for the composite FKs that enforce
   one-class-per-year and same-year consistency.
5. **`classId` on `studentAttendance` and `results`.** Denormalized from the
   enrollment so teacher assignment checks are a direct lookup and the
   enrollment FK can be enforced.
6. **`notices.category` is free text** (the UI shows Events / Holidays /
   Academic / General). No enum was specified for it.
7. **Grades and percentages are not stored.** They are derived from
   `marksObtained` and `maxMarks` in application code.
8. **Phase 2 correction — own-row read for inactive users.** The original
   `users` SELECT policy keyed on `app.currentUserId()`, which hides the row
   from deactivated users. The session code reads that row to reject inactive
   accounts with a specific error, so the own-row rule now matches on
   `authUserId = auth.uid()` instead. Inactive users still fail every other
   policy.
9. **API role names are uppercase.** The database enum stores `admin`,
   `teacher`, `student`; the API exposes `ADMIN`, `TEACHER`, `STUDENT`. The
   mapping lives only in `lib/auth/roles.ts`.
10. **Phase 2.5 — deletes are granted only for configuration rows.**
    Admins may DELETE `teacherAssignments`, `timetableEntries`, `notices` and
    `noticeAudiences`. Every other table has no DELETE grant for any API user:
    history is corrected by UPDATE or preserved, never deleted.
11. **Phase 2.5 — role and account status change only via the provisioning
    service.** Column grants allow `authenticated` (admins included) to update
    only `fullName`/`phone` on `users`. Granting roles, deactivating and
    reactivating accounts are service-role operations performed by trusted
    server code after an admin check (Phase 3), and are audited.
12. **Phase 2.5 — default privileges hardened.** Supabase's default privileges
    grant ALL on new `public` tables/functions to `anon`/`authenticated`.
    Migration 2 revokes those defaults for objects created by `postgres`, so
    every future table needs explicit grants (matching Supabase's 2026 Data API
    change).
13. **Phase 4: attendance identity is immutable.** UPDATE on both
    attendance tables is limited to `status`, `remarks` and `markedByUserId`.
    Previously a teacher could move a record to another student or date.
    Insert triggers reject future dates, dates outside the class's academic
    year, and deactivated accounts, including for direct Data API writes.
14. **Not modelled (no table in scope):** assignments/homework, fees, school
   information. These appear in the UI mockups but are outside the 17 tables.

## Security model

### Access paths

| Path | Key | RLS | Used for |
| ---- | --- | --- | -------- |
| `createSupabaseServerClient()` (`lib/supabase/server.ts`) | publishable key + user's session cookies | **Enforced** | All user-initiated reads and writes (Route Handlers, Server Components, Server Functions). |
| `createSupabaseBrowserClient()` (`lib/supabase/client.ts`) | publishable key + browser session | **Enforced** | Client Components (none use it yet). |
| `createSupabaseAdminClient()` (`lib/supabase/admin.ts`) | secret key (`service_role`) | **Bypassed** | Only `lib/auth/provisioning.ts` (account creation) and `lib/auth/account-status.ts` (deactivation/reactivation, which must delete Auth sessions). A unit test fails if anything else imports it. |

- The server and admin modules import `server-only`, so importing them from a
  Client Component fails the build. `lib/env.ts` is server-only as well.
- `SUPABASE_SECRET_KEY` has no `NEXT_PUBLIC_` prefix and is therefore
  never inlined into browser bundles.
- Code using the admin client **must perform its own authorization check**
  (e.g. caller is an active admin) before acting, because RLS will not.
- Results from the admin client must never be returned to a client unfiltered.

### Baseline rules (all tables)

1. **RLS is enabled on every table** (initial migration). With no policies, `anon`
   and `authenticated` get nothing — deny-by-default.
2. **No policy grants anything to `anon`.** Unauthenticated users cannot read or
   write protected application data.
3. **Every policy requires an active application user** (`app.currentUserId()`
   returns `NULL` for unknown or deactivated accounts, which fails every check).
   The single exception is a user reading their **own** `users` row, matched by
   `"authUserId" = auth.uid()`, which works even when inactive so the API can
   tell a deactivated account (`ACCOUNT_INACTIVE`) apart from an unprovisioned
   one. It grants no access to any other data.
4. **`service_role` bypasses RLS** by design in Supabase; it is used only from
   `lib/supabase/admin.ts`.

### Helper functions (migration 2)

Policies call small `STABLE SECURITY DEFINER` functions in a private `app`
schema (not exposed through the Data API), each with
`set search_path = ''` and fully qualified names. `SECURITY DEFINER` lets them
read `users`/`teachers`/`teacherAssignments` without recursive RLS evaluation.

| Function | Returns |
| -------- | ------- |
| `app.currentUserId()` | `users.id` where `authUserId = auth.uid()` and `isActive`, else `NULL`. |
| `app.currentRole()` | That user's `role`, else `NULL`. |
| `app.isAdmin()` | `app.currentRole() = 'admin'`. |
| `app.currentStudentId()` | `students.id` for the current user, else `NULL`. |
| `app.currentTeacherId()` | `teachers.id` for the current user, else `NULL`. |
| `app.teachesClass(classId)` | Current teacher has any `teacherAssignments` row for the class, or is its `classTeacherId`. |
| `app.teachesClassSubject(classId, subjectId)` | Current teacher has the exact `(teacherId, classId, subjectId)` assignment. |
| `app.isEnrolledIn(classId)` | Current student has a `studentEnrollments` row for the class. |
| `app.canViewNotice(noticeId)` | Notice-audience check — see [notices](#notices-and-noticeaudiences). |

Shape (as applied):

```sql
create function app."currentUserId"()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select u."id" from public."users" u
  where u."authUserId" = auth.uid() and u."isActive"
$$;
```

### Check types used below

- **Ownership check** — the row belongs to the current user
  (e.g. `"studentId" = app.currentStudentId()`).
- **Assignment check** — the current teacher is linked to the row's class (and,
  where stated, subject) through `teacherAssignments` or `classes.classTeacherId`.
- **Notice-audience check** — the notice is published and a `noticeAudiences`
  row targets the user's role or one of the user's classes.

## RLS policy design (per table)

`A` = admin, `T` = teacher, `S` = student. Unless stated, `INSERT`/`UPDATE`/
`DELETE` are admin-only, and `DELETE` on historical tables should be avoided in
favour of deactivation even for admins (FKs will block most deletes anyway).

### `users`

| Operation | Rule | Check |
| --------- | ---- | ----- |
| SELECT | A: all. Any authenticated user: own row by `"authUserId" = auth.uid()`, active or not (needed by `getCurrentAppUser`). T: also users of students they teach (for names in rosters). | Ownership; assignment (T) |
| INSERT | None via the API. Rows are created only by trusted server code with the admin client. | — |
| UPDATE | A: profile columns (`fullName`, `phone`) of any row. T/S: own row, same columns only. `role`/`isActive` changes happen only through the trusted admin path below. | Ownership |
| DELETE | None (deactivate instead). | — |

**Role protection (no self-promotion):**

- Column privileges: `revoke update on "users" from authenticated;`
  then `grant update ("fullName", "phone") on "users" to authenticated;`.
  `role`, `authUserId`, `email`, `isActive` and `deactivatedAt` are therefore
  not writable by any end user, regardless of policy.
- Admin changes to `role`/`isActive` go through a server action that verifies
  the caller is an active admin, uses the admin client, and writes an
  `auditLogs` entry. A `BEFORE UPDATE` trigger additionally rejects any change
  to `role` where `auth.uid()` resolves to the row being changed, so no one —
  including an admin — can alter their own role.
- The `(userId, role)` FK from `students`/`teachers` blocks role changes while
  a profile exists.

### `students`

| Operation | Rule | Check |
| --------- | ---- | ----- |
| SELECT | A: all. S: own row. T: students enrolled in a class they teach. | Ownership; assignment |
| INSERT / UPDATE / DELETE | A only. | — |

### `teachers`

| Operation | Rule | Check |
| --------- | ---- | ----- |
| SELECT | A: all. T: own row. Any authenticated active user: basic directory columns (for class-teacher / timetable display) — expose via a view if limiting columns. | Ownership |
| INSERT / UPDATE / DELETE | A only. | — |

### `academicYears`, `subjects`

| Operation | Rule | Check |
| --------- | ---- | ----- |
| SELECT | Any active authenticated user. | — |
| INSERT / UPDATE / DELETE | A only. | — |

### `classes`

| Operation | Rule | Check |
| --------- | ---- | ----- |
| SELECT | A: all. T: classes they teach (`app.teachesClass("id")`). S: classes they are enrolled in. | Assignment; ownership |
| INSERT / UPDATE / DELETE | A only. | — |

### `studentEnrollments`

| Operation | Rule | Check |
| --------- | ---- | ----- |
| SELECT | A: all. S: own enrollments. T: enrollments in classes they teach. | Ownership; assignment |
| INSERT / UPDATE / DELETE | A only. | — |

### `teacherAssignments`

| Operation | Rule | Check |
| --------- | ---- | ----- |
| SELECT | A: all. T: own assignments. S: assignments for classes they are enrolled in (to show subject teachers). | Ownership |
| INSERT / UPDATE / DELETE | A only. | — |

### `studentAttendance`

| Operation | Rule | Check |
| --------- | ---- | ----- |
| SELECT | A: all. S: own rows. T: rows for classes they teach. | Ownership; assignment |
| INSERT | A. T: only for `app.teachesClass("classId")`, with `"markedByUserId" = app.currentUserId()`. | Assignment |
| UPDATE | A. T: same as INSERT (both `USING` and `WITH CHECK`, so a row cannot be moved to another class). | Assignment |
| DELETE | A only. | — |

### `teacherAttendance`

| Operation | Rule | Check |
| --------- | ---- | ----- |
| SELECT | A: all. T: own rows. | Ownership |
| INSERT / UPDATE / DELETE | A only. Teachers cannot mark their own attendance. | — |

### `exams`

| Operation | Rule | Check |
| --------- | ---- | ----- |
| SELECT | Any active authenticated user. | — |
| INSERT / UPDATE / DELETE | A only. | — |

### `examSubjects`

| Operation | Rule | Check |
| --------- | ---- | ----- |
| SELECT | A: all. T: papers for classes they teach. S: papers for classes they are enrolled in. | Assignment; ownership |
| INSERT / UPDATE / DELETE | A only. | — |

### `results`

| Operation | Rule | Check |
| --------- | ---- | ----- |
| SELECT | A: all. S: own results. T: results for exam papers whose `(classId, subjectId)` they teach. | Ownership; assignment (class + subject) |
| INSERT | A. T: only where `app.teachesClassSubject(classId, subjectId-of-examSubject)`, with `"enteredByUserId" = app.currentUserId()`. | Assignment (class + subject) |
| UPDATE | A. T: same as INSERT, `USING` and `WITH CHECK`. | Assignment (class + subject) |
| DELETE | A only. | — |

Whether students see results immediately or only after an admin "publishes"
an exam is a business rule not yet specified; there is no publish flag in the
schema. If required, add it in a later phase and extend the student SELECT rule.

### `timetableEntries`

| Operation | Rule | Check |
| --------- | ---- | ----- |
| SELECT | A: all. T: entries where `"teacherId" = app.currentTeacherId()` or for classes they teach. S: entries for classes they are enrolled in. | Ownership; assignment |
| INSERT / UPDATE / DELETE | A only. | — |

### `notices` and `noticeAudiences`

`app.canViewNotice(noticeId)` — the **notice-audience check** — is true when:

1. the notice has `status = 'published'` and `publishedAt <= now()`, **and**
2. some `noticeAudiences` row for the notice has either
   - `audienceRole = app.currentRole()`, or
   - `classId` such that the current student is enrolled in it
     (`app.isEnrolledIn(classId)`) or the current teacher teaches it
     (`app.teachesClass(classId)`).

| Table | Operation | Rule | Check |
| ----- | --------- | ---- | ----- |
| `notices` | SELECT | A: all (including drafts/archived). T/S: `app.canViewNotice("id")`. | Notice-audience |
| `notices` | INSERT / UPDATE / DELETE | A only. | — |
| `noticeAudiences` | SELECT | A: all. T/S: rows of notices where `app.canViewNotice("noticeId")`. | Notice-audience |
| `noticeAudiences` | INSERT / UPDATE / DELETE | A only. | — |

Draft and archived notices are never visible to teachers or students.

### `auditLogs`

| Operation | Rule | Check |
| --------- | ---- | ----- |
| SELECT | A only. | — |
| INSERT | No policy for `authenticated`. Written only by trusted server code using the admin client. | — |
| UPDATE / DELETE | No policy, and the `auditLogsPreventMutation` trigger rejects them for every role, including `service_role`. | — |

Retention/purging, if ever needed, would be a deliberate database-owner
operation that temporarily disables the trigger — not an application feature.

## Initial-admin provisioning

There is no public admin-creation endpoint, no seed file with credentials, no
"first user becomes admin" logic, and public sign-up is disabled on the
project. The first administrator is created by an operator who holds the
project's secret key, using a local CLI:

```bash
npm run bootstrap:admin -- --email admin@school.org --name "Full Name"
```

What it does (`scripts/bootstrap-admin.ts` → `lib/auth/provisioning.ts`):

1. Refuses to run if any active admin already exists.
2. Finds the Auth user for the email (e.g. one created in the dashboard under
   Authentication → Users → Add user) or creates it with a password typed at a
   hidden prompt (or `BOOTSTRAP_ADMIN_PASSWORD`). Nothing is stored or printed.
3. Calls `public."provisionAppUser"`, which inserts the `users` row (role
   `admin`) and an `auditLogs` entry (`users.provision`, actor `NULL`) in one
   transaction.
4. If step 3 fails and step 2 created the Auth user, deletes it again.

Verify: sign in through `POST /api/auth/login`; `GET /api/auth/me` returns
`"role": "ADMIN"`. Recovery and failure handling: `docs/supabase.md`.

**Why ordinary users cannot promote themselves (all verified by tests):**

- `authenticated` has no `INSERT` on `users` and `UPDATE` only on
  `fullName`/`phone` (column grants), so `role`/`isActive` are unreachable
  through the API — for admins too.
- A trigger blocks any signed-in user from changing their own role, status,
  email or identity link, whatever path the UPDATE takes.
- `provisionAppUser` and `findAuthUserIdByEmail` are executable only by
  `service_role`.
- Public sign-up is disabled; even if it were enabled, an Auth identity without
  a `users` row fails every policy and is rejected by the API.
- The secret key is used only by `lib/supabase/admin.ts`, which is
  `server-only`; Supabase also rejects secret keys sent from browsers.

Subsequent admins, teachers and students will be created by an existing admin
through Phase 3 Route Handlers guarded by `requireAdmin()` that call
`provisionAccount`.

## Deferred to later phases

- Phase 3 admin APIs that call `provisionAccount` and change role/status.
- A publish flag for exam results, if students must not see marks immediately.
- Teacher double-booking prevention in `timetableEntries` (needs `btree_gist`).
