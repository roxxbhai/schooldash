# Supabase: setup, migrations, security and operations

This project uses one existing Supabase project (Postgres 17, Auth, Data API).
The schema, grants and RLS policies are defined by version-controlled
migrations and verified by tests against the real project.

Related docs:

- `db/README.md`: data model, RLS policy matrix, initial-admin provisioning.
- `docs/auth-and-api.md`: API endpoints, guards, error conventions.

## 1. Environment variables

| Variable | Used by | Exposure |
| -------- | ------- | -------- |
| `NEXT_PUBLIC_SUPABASE_URL` | App (server + browser) | Public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | App (server + browser). `sb_publishable_…` | Public; RLS applies |
| `SUPABASE_SECRET_KEY` | `src/helpers/supabase-admin/index.ts` only (provisioning). `sb_secret_…` | **Secret.** Bypasses RLS. Never `NEXT_PUBLIC_`. |
| `SUPABASE_DB_URL` | Migrations, type generation, integration tests. Never read by the app. | **Secret.** Database password. |

Where to find them in the dashboard:

- **URL:** Project Settings → Data API → Project URL. Use the base URL, without
  `/rest/v1`.
- **Publishable and secret keys:** Project Settings → API Keys.
- **DB URL:** Connect → Connection String → Session pooler. Replace the password
  placeholder with your database password, and URL-encode special characters
  (`@` → `%40`).

The app validates its variables only when a client is created
(`src/configs/index.ts`). If they are missing, API routes return
`503 SERVICE_UNAVAILABLE`, never a fabricated success, and pages and the proxy
keep working without auth.

**Secrets management**

- Locally: `.env.local`, which is git-ignored. Run `chmod 600 .env.local`.
- Deployed (e.g. Vercel): set the first three variables in the project's
  environment settings.
- `SUPABASE_DB_URL` is not needed at runtime. Keep it out of hosting
  environments unless CI runs migrations.
- `tests/secrets.test.ts` fails if any committable file contains Supabase keys,
  JWTs, a connection string with a password, or a non-empty env assignment.

## 2. Local development

```bash
npm ci
cp .env.example .env.local   # then fill in the values (see above)
npm run dev
```

Useful scripts (the `db:*` scripts read `.env.local`):

| Script | Does |
| ------ | ---- |
| `npm test` | Unit tests. Offline and mocked; no Supabase needed. |
| `npm run test:integration` | Tests against the **real** project (section 6). |
| `npm run db:migrations` | Compares local and applied migrations. |
| `npm run db:push` | Applies pending migrations. |
| `npm run db:types` | Regenerates `src/types/database/index.ts` from the live schema. |
| `npm run db:advisors` | Runs Supabase's security and performance advisors. |
| `npm run bootstrap:admin -- --email … --name "…"` | Creates the first admin (section 5). |

The Supabase CLI is pinned as a dev dependency (`supabase@2.121.0`) and is run
through `npx`/npm scripts. No global install or `supabase login` is needed:
every command connects with `--db-url`.

## 3. Migration workflow

The project uses **imperative migrations** in `supabase/migrations/`. They are
the single source of truth; `db/schema.sql` was folded into the first one.

Applied (verified with `npm run db:migrations`):

| Version | Content |
| ------- | ------- |
| `20261015142406_initial_schema` | Enums, 17 tables, constraints, indexes, triggers, RLS on. |
| `20261015142408_rls_policies_and_grants` | Grants, `app.*` helpers, self-privilege trigger, policies. |
| `20261015142410_account_provisioning` | `provisionAppUser`, `findAuthUserIdByEmail` (service role only). |
| `20261015142822_consolidate_policies_and_fk_indexes` | Advisor fixes. Access is unchanged. |
| `20261015154145_account_status` | `setAppUserStatus`: deactivation/reactivation, session revocation, audit (service role only). |
| `20261015155521_school_resources` | `setCurrentAcademicYear`; audit trigger `app."auditRowChange"` on years/classes/subjects. |
| `20261015160422_people_and_relationships` | `updateTeacherProfile` / `updateStudentProfile` (atomic, invoker); audit triggers on people, enrollments, assignments. |
| `20261015163718_attendance_integrity` | Attendance: UPDATE limited to status/remarks/markedByUserId; insert triggers (date not future, within academic year, account active); correction audit triggers. |
| `20261015171445_column_level_update_grants` | API users may update only the columns the app edits (results/examSubjects identity, ids, timestamps, academic-year links fixed). |
| `20261015172701_exams_and_results` | Audit triggers on exams, examSubjects, results; results insert rule (student active). |
| `20261016090000_timetable_integrity` | `btree_gist`; `timetableEntries.academicYearId` (derived from the class by trigger); class and teacher no-overlap exclusion constraints; column-level UPDATE grants; audit. |
| `20261016100000_notices_workflow` | Notice lifecycle trigger (draft → published → archived); audiences changeable only on drafts (RLS); column-level INSERT/UPDATE grants; `createNotice` / `setNoticeAudiences` / `publishNotice` (atomic, invoker); audit. |

**To change the schema:**

1. `npx supabase migration new <descriptive_name>`. Never hand-name a migration
   file, and never edit one that has been applied.
2. Write the SQL in the new file:
   - Quote camelCase identifiers.
   - **Grant privileges explicitly.** New `public` tables get no access by
     default (see `db/README.md` decision 12).
   - Enable RLS and add policies for every new table.
3. `npm run db:push -- --dry-run`, then `npm run db:push`.
4. `npm run db:advisors`. Fix anything above INFO. "Unused index" notices are
   expected until there is traffic.
5. `npm run db:types`, then `npm run typecheck`.
6. `npm run test:integration`. `tests/integration/schema.test.ts` fails if a
   local migration is not applied, or if the database has one that isn't in
   git.

**Verifying the applied schema:** run `npm run test:integration -- tests/integration/schema.test.ts`. It checks the following against the live database:

- Migration history.
- Tables and RLS status.
- Enums.
- UUID primary keys.
- The `auth.users` link.
- Cascade rules.
- Foreign-key index coverage.
- Grants.
- Function exposure.
- Constraint behaviour.

## 4. Auth and session architecture

- **Sign-in method:** email + password through `POST /api/auth/login`.
- **Public sign-up is disabled** on the project (Authentication → Sign In /
  Providers → "Allow new users to sign up" = off). This is verified by an
  integration test. Accounts are created only by the provisioning service.
- **Sessions** are stored in `sb-<ref>-auth-token` cookies written by
  `@supabase/ssr`. The session flow:
  1. **`src/proxy.ts`** (Next 16's replacement for middleware) calls
     `supabase.auth.getClaims()` on every non-static request that has an auth
     cookie. This refreshes expired access tokens and forwards the new cookies
     to the page/handler and the browser, with `no-store` headers. Requests
     without auth cookies skip it, so they make no network call.
  2. **Route Handlers** call `getUser()`, via `requireAuthenticatedUser()` and
     the other guards. It validates the session with the Auth server, so revoked
     or forged sessions are rejected. They then load the `users` row and take
     the role from it, never from the JWT or request data.
  3. **Logout** revokes the current session (`scope: local`) and clears the
     cookies.
- **Server Functions (Server Actions)**: none exist yet. Any added later must
  call the same guards (`requireRole`, etc.) at the top. The guards throw
  `ApiError`s, which the action must convert into its own result.
- **Deactivated accounts** get 403 `ACCOUNT_INACTIVE` from the API, and RLS
  shows them nothing except their own `users` row.
- **Caveat:** an access token stays cryptographically valid until it expires
  (1 h by default) even after deactivation. The API rejects it immediately
  because `isActive` is checked on every request, and so does RLS. Direct
  Data-API reads by a deactivated user return only their own `users` row.

## 5. Account provisioning and recovery

`src/functions/provisioning/index.ts` → `provisionAccount(input, options)`. It is
server-only, the only importer of the secret-key client, and never reachable
from a public route (enforced by a unit test).

1. Validates input. Students require `admissionNumber`; teachers require
   `employeeCode`.
2. Finds the Auth user by email. If one exists:
   - Without `linkExistingAuthUser`, it returns 409.
   - With it, it links the existing user (bootstrap and recovery path).
3. Otherwise it creates the Auth user, with `email_confirm: true`.
4. `public."provisionAppUser"` inserts `users`, the profile row and an
   `auditLogs` entry in **one transaction**.
5. If step 4 fails and step 3 created the Auth user, that user is **deleted**.
   If that deletion also fails, `ProvisioningRecoveryError` reports the
   orphaned Auth user id.

**Recovering a partial failure:**

- Re-run the same provisioning with `linkExistingAuthUser: true`. The CLI does
  this automatically.
- Or delete the Auth user in the dashboard (Authentication → Users).
- Re-running is safe. A second attempt for an already-provisioned identity
  returns 409 and never duplicates rows.

**First administrator:** `npm run bootstrap:admin -- --email … --name "…"`. See
`db/README.md` for the full procedure. It refuses to run once an active admin
exists. Two operators running it at the same moment could each create an
admin; run it once.

## 6. Tests

| Suite | Command | Talks to Supabase? |
| ----- | ------- | ------------------ |
| Unit (Phases 1, 2, 2.5) | `npm test` | **No.** Mocked fetch, fake cookies, fake clients. |
| Integration | `npm run test:integration` | **Yes.** The real project in `.env.local`. |

Integration tests (`tests/integration/`) need all four variables, and fail
rather than skip if any are missing:

- **`schema.test.ts`** checks the applied schema against the migrations, plus
  constraint, FK and trigger behaviour. All writes happen in rolled-back
  transactions.
- **`rls.test.ts`** seeds a fixture school inside a transaction, acts as the
  real `anon`/`authenticated` roles with real JWT claims, and **always rolls
  back**. It covers student/teacher/admin/inactive/unprovisioned access,
  self-promotion, writes and deletes.
- **`account-status.test.ts`, `school-resources.test.ts`, `people.test.ts`**
  (Phase 3), `attendance.test.ts` (Phase 4), `exams.test.ts`,
  `results.test.ts`, `report-cards.test.ts` (Phase 5), and
  `timetable.test.ts`, `notices.test.ts` (Phase 6) call the API Route Handlers
  against the real project as a dedicated integration admin. See
  `docs/school-api.md` § Testing.
- **`phase6-matrix.test.ts`** and **`workflow.test.ts`** (final audit) give
  the timetable and notice routes the same contract matrix as Phase 3, and
  run a whole school year end to end through the API: deactivation,
  reactivation, concurrent duplicates and identity-injection attempts.
- **Schema drift:** Docker isn't required. Without it, `supabase db diff`
  can't run, so `schema.test.ts` instead checks that migration versions match,
  that the policy set equals a replay of every `create`/`drop policy`, and
  that every function body equals its latest migration definition.
  `npm run db:types` output should also be unchanged. Column, index and
  constraint definitions aren't compared one by one, except through the
  targeted constraint tests.
- **`auth.test.ts`** runs real Auth sign-in, refresh, revocation, the proxy,
  Data-API RLS with real tokens, disabled sign-up, browser rejection of the
  secret key, and provisioning with compensation. It creates
  `it-<run>-*@example.com` identities and deletes them afterwards.

**What persists:** each integration run leaves about 4 `auditLogs` rows
(`users.provision`, no email, actor `NULL`). They come from provisioning test
identities and are append-only by design. Nothing else persists. Never point
the integration suite at a database holding real student data, because it
creates and deletes identities.

## 7. Deployment checklist

1. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
   `SUPABASE_SECRET_KEY` in the hosting environment.
2. Apply migrations (`npm run db:push`) before deploying code that needs them.
3. In the Supabase dashboard:
   - Keep sign-up disabled.
   - Set Authentication → URL Configuration → Site URL to the production
     origin.
   - Consider a shorter JWT expiry if deactivation must take effect faster for
     direct Data-API access.
4. Ensure no CDN caches `/api/*`. Responses already send
   `Cache-Control: private, no-store`.
5. Run `npm run bootstrap:admin` once to create the first administrator.

## 8. Known limitations and manual steps

- **Initial admin created and verified (2026-10-15).** Sign-in, `/me` → `ADMIN`,
  `requireAdmin()` and admin-only RLS reads were all checked against the real
  project. To recover a lost admin, see `db/README.md`.
- **Rate limiting** relies on Supabase Auth's built-in limits. There is no
  app-level limiter.
- **Logout during a Supabase outage** may take up to ~30 s: supabase-js retries
  the refresh before the local cookie fallback runs.
- **Timetable conflicts** (class and teacher overlaps) are enforced by
  database exclusion constraints since migration 11. Rooms are free text and
  are not checked for clashes.
- **Notices** have no delete endpoint. Admins still hold the Data API DELETE
  grant on `notices` (design decision 10); deleting removes its audiences too.
- **`users.email`** is a copy of the Auth email. If a user changes their login
  email in Auth, it isn't synchronized automatically yet.
