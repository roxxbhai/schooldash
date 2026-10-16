# Phase 3 handoff: integration contract

> **Updated in Phase 7.** The service/repository layer was removed and the
> code moved under `src/`. Guards now take the client first and return
> `{ success, message, data }` results. `docs/architecture.md` is the current
> reference; the contracts below are kept up to date with it.

Everything Phase 3 builds must use the interfaces below. They are implemented,
and they are verified against the real Supabase project in the pre-Phase-3
release gate (2026-10-15).

**Non-negotiable**

- All code reads and writes the **real Supabase database** through the
  production route handlers and `src/functions` modules.
- Mocks and fakes (`tests/helpers/fake-supabase.ts`, `tests/helpers/fake-db.ts`, a stubbed `fetch`) are for
  **unit tests only**. They must never become a data store, and no code path may
  return success for a write that did not happen.

## 1. Identity and roles

| Need | Use | Returns / throws |
| ---- | --- | ---------------- |
| Any signed-in, active user | `requireAuthenticatedUser(client)` | `AppUser` or 401 / 403 `ACCOUNT_NOT_PROVISIONED` / 403 `ACCOUNT_INACTIVE` |
| A specific role | `requireRole(client, ['ADMIN', 'TEACHER'])` | `AppUser` or 401 / 403 |
| Admin only | `requireAdmin(client)` | `AppUser` or 401 / 403 |
| A student's own record | `requireStudentOwnership(client, studentId, { isAdminAllowed? })` | `{ user, studentId, grantedBy }` or 400 / 401 / 403 |
| A teacher's assigned class/subject | `requireTeacherAssignment(client, { teacherId, classId, subjectId? })` | `{ user, teacherId, classId, subjectId? }` or 400 / 401 / 403 |

Each returns the standard result; `unwrapResult(…)` yields the value above or
rethrows the error.

`AppUser = { id, authUserId, role: "ADMIN" | "TEACHER" | "STUDENT", isActive: true }`.

- `id` is `users.id`. Use it for `markedByUserId`, `enteredByUserId`,
  `createdByUserId` and `actorUserId`, **never a value from the request**.
- Identity comes from `auth.getUser()` (validated with the Auth server), and the
  role comes from the `users` row. JWT `user_metadata`/`app_metadata` is never
  used for authorization.
- The DB enum is lowercase (`admin`); the API is uppercase (`ADMIN`). Map them
  only with `toAppRole` (`src/helpers/roles/index.ts`).
- IDs passed to guards identify the resource being accessed. They are compared
  against the caller's own records, never trusted as identity.

## 2. Supabase clients

| Client | Where | Key | RLS |
| ------ | ----- | --- | --- |
| `createSupabaseServerClient()` (`src/helpers/supabase-server/index.ts`) | Route Handlers, Server Components, Server Functions | publishable + user cookies | **Applies.** Use this for all normal reads and writes. |
| `createSupabaseBrowserClient()` (`src/helpers/supabase-browser/index.ts`) | Client Components | publishable | Applies |
| `createSupabaseAdminClient()` (`src/helpers/supabase-admin/index.ts`) | **Only** `src/functions/provisioning/index.ts` | secret | **Bypassed** |

- Create **one** server client per request and pass it to the guard and every
  query, so they share the same session:

  ```ts
  const supabase = await createSupabaseServerClient();
  const user = unwrapResult(await requireAdmin(supabase));
  ```
- Clients are typed with the generated `Database` type
  (`src/types/database/index.ts`). Functions take
  `DbClient` (`src/types/supabase`), i.e. `SupabaseClient<Database>`.
- `tests/server-only.test.ts` fails if anything except
  `src/functions/provisioning/index.ts` imports the admin client, or if any route other than the two admin-guarded people routes
  (`POST /api/teachers`, `POST /api/students`, both calling `requireAdmin`
  first) imports the provisioning function. If Phase 3 needs a new privileged
  operation, add it as a reviewed function next to `provisionAccount`, update
  that test deliberately, and document why RLS cannot express it.

## 3. Layering

```
src/app/api/<resource>/route.ts     Route Handler: apiRoute, CSRF, guard, parse, queries, respond
src/functions/<module>/index.ts     Logic shared between routes; returns { success, message, data }
src/helpers/…                       Errors, responses, validation, query wrappers (throwing or pure)
```

**Route Handler template**

```ts
import { z } from 'zod';
import { SUBJECT_COLUMNS, SUBJECT_ERRORS } from '@/constants/subjects';
import { requireAdmin } from '@/functions/authorization';
import { apiRoute, created } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { one } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { parseJsonBody } from '@/helpers/request-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import type { Subject } from '@/types/subjects';

const createSubjectSchema = z.strictObject({ code: z.string().trim().min(1).max(20), name: z.string().trim().min(1).max(100) });

export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request); // EVERY STATE-CHANGING HANDLER
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAdmin(supabase));
  const newSubject = await parseJsonBody(request, createSubjectSchema);
  const query = supabase.from('subjects').insert(newSubject).select(SUBJECT_COLUMNS).maybeSingle();
  return created(await one<Subject>('subjects.insert', query, SUBJECT_ERRORS));
});
```

- **GET with params:** use `parseParams(context.params, idParamsSchema)`. For
  collections, use `getPagination(searchParams)`, `.range(from, to)` and
  `page(operation, query, pagination, errors)`, which returns
  `{ items, pagination }`.
- **Every query** goes through `src/helpers/db-query` (`one`, `maybeOne`,
  `many`, `page`, `rpcResult`, `parseRow`). A failed query always throws a
  mapped error and never returns partial data; `parseRow` validates row shapes
  with zod where authorization depends on them.
- **Done in Phase 3:** `mapDbError` (`src/helpers/db-error/index.ts`) maps
  PostgREST/Postgres codes to API errors. See `docs/school-api.md`.

  | Code | Return |
  | ---- | ------ |
  | `23505` | 409 `CONFLICT` |
  | `23503` | 409 or 422 (invalid reference) |
  | `23514` / `22023` | 422 `VALIDATION_ERROR` |
  | `42501` (RLS/grant denied) | 403 `FORBIDDEN` |
  | `PGRST116` | 404 where a single row was expected |

  Never pass raw database messages through.

## 4. Responses and errors

- **Success:** `ok(data)` (200) or `created(data)` (201) →
  `{ "data": …, "error": null }`.
- **Failure:** throw an `ApiError` (factories in `src/helpers/api-error/index.ts`) →
  `{ "data": null, "error": { "code", "message", "details"? } }`.
- **Status rules:**
  - 400: malformed body, params or query.
  - 422: a JSON body that fails its schema.
  - 401: unauthenticated. 403: authenticated but not allowed.
  - 404, 409, 429 as usual.
  - 500: unexpected.
  - 503: Supabase is unconfigured or unreachable.
- `apiRoute` forces request-time execution, converts thrown errors, and logs
  only metadata. Never `console.log` request bodies, tokens or emails.
- Body schemas are `z.strictObject`, so unknown fields such as `role`,
  `userId` or `isActive` are rejected, not ignored.

## 5. Account creation and status

- **Create** students, teachers and admins with `provisionAccount(input,
  { actorUserId: admin.id })`. Call it only from an admin-guarded handler. It
  creates the Auth user and the `users` + profile + audit rows, compensates on
  failure, and returns 409 on duplicates.
- **Role and `isActive` changes** are not possible through the
  publishable-key client (column grants). For Phase 3:
  - Implement deactivation and reactivation as a reviewed service-role
    operation next to `provisionAccount`.
  - Set `isActive` and `deactivatedAt` together.
  - Write an `auditLogs` entry.
  - Consider calling `auth.admin.signOut` for the user so their session ends.
- Public sign-up is disabled on the project. Keep it that way.

## 6. Database changes

1. `npx supabase migration new <name>`, then write the SQL.
2. In the SQL:
   - Explicit `GRANT`s, since new tables get no access by default.
   - `ENABLE ROW LEVEL SECURITY`.
   - Policies `TO authenticated` with row predicates built from the `app.*`
     helpers (`app."isAdmin"()`, `app."teachesClass"(…)`,
     `app."currentStudentId"()`, …), wrapped in `(select …)`.
   - UPDATE policies need both `USING` and `WITH CHECK`.
   - One permissive policy per command per table.
3. Apply and check:
   ```bash
   npm run db:push -- --dry-run
   npm run db:push
   npm run db:advisors
   npm run db:types
   npm run typecheck
   ```
4. Never edit applied migrations. Workflow details: `docs/supabase.md` §3.

## 7. Testing Phase 3 work

| What | Where | How |
| ---- | ----- | --- |
| Route and function logic | `tests/school/*.test.ts`, `tests/auth/*.test.ts` (`npm test`) | Real route handlers against `tests/helpers/fake-db.ts` with `tests/helpers/route-harness.ts`; guards against `fake-supabase.ts`. Offline. |
| RLS for new tables/policies | `tests/integration/rls.test.ts` (`npm run test:integration`) | Extend `helpers/school.ts` fixtures; `actAs(db, "studentA")`, then assert exact visible IDs, `expectSqlError(…, "42501")` for denied writes, and `affected(…) === 0` for filtered updates. Always rolled back. |
| Real end-to-end | `tests/integration/*.test.ts` | Real Auth sessions via `provisionAccount` with `it-<run>-*@example.com` identities. Delete them in `afterAll`. |

Rules:

- Every new endpoint needs tests for each role: allowed, forbidden (403),
  unauthenticated (401), and invalid input.
- **Scope assertions to fixture IDs.** The project now holds real data (the
  admin), so never assert global row counts.
- Never write to or delete non-fixture rows. Never run the integration suite
  against a database with real student data unless it's isolated (e.g. a
  Supabase branch).
- Don't weaken a policy or a test to make it pass. Fix the cause.

## 8. Known open items carried into Phase 3

- ~~The Postgres error-code mapper~~ (done in Phase 3: `src/helpers/db-error/index.ts`).
- ~~The deactivation/reactivation service~~ (done in Phase 3: `src/functions/account-status/index.ts`).
- ~~Integration coverage for the ownership lookups through real routes~~
  (done: the route-level integration suites exercise them).
- `users.email` isn't synced if a user changes their Auth email.
- No app-level rate limiting. (Teacher double-booking is prevented in the database since Phase 6.)
