# Phase 3 handoff: integration contract

Everything Phase 3 builds must use the interfaces below. They are implemented,
and they are verified against the real Supabase project in the pre-Phase-3
release gate (2026-10-15).

**Non-negotiable**

- Phase 3 reads and writes the **real Supabase database** through production
  repository modules.
- Mocks and fakes (`tests/helpers/fake-supabase.ts`, a stubbed `fetch`) are for
  **unit tests only**. They must never become a data store, and no code path may
  return success for a write that did not happen.

## 1. Identity and roles

| Need | Use | Returns / throws |
| ---- | --- | ---------------- |
| Any signed-in, active user | `requireAuthenticatedUser({ client })` | `AppUser` or 401 / 403 `ACCOUNT_NOT_PROVISIONED` / 403 `ACCOUNT_INACTIVE` |
| A specific role | `requireRole(["ADMIN", "TEACHER"], { client })` | `AppUser` or 401 / 403 |
| Admin only | `requireAdmin({ client })` | `AppUser` or 401 / 403 |
| A student's own record | `requireStudentOwnership(studentId, { client, allowAdmin? })` | `{ user, studentId, grantedBy }` or 400 / 401 / 403 |
| A teacher's assigned class/subject | `requireTeacherAssignment(teacherId, classId, subjectId?, { client })` | `{ user, teacherId, classId, subjectId? }` or 400 / 401 / 403 |

`AppUser = { id, authUserId, role: "ADMIN" | "TEACHER" | "STUDENT", isActive: true }`.

- `id` is `users.id`. Use it for `markedByUserId`, `enteredByUserId`,
  `createdByUserId` and `actorUserId`, **never a value from the request**.
- Identity comes from `auth.getUser()` (validated with the Auth server), and the
  role comes from the `users` row. JWT `user_metadata`/`app_metadata` is never
  used for authorization.
- The DB enum is lowercase (`admin`); the API is uppercase (`ADMIN`). Map them
  only with `toAppRole` (`lib/auth/roles.ts`).
- IDs passed to guards identify the resource being accessed. They are compared
  against the caller's own records, never trusted as identity.

## 2. Supabase clients

| Client | Where | Key | RLS |
| ------ | ----- | --- | --- |
| `createSupabaseServerClient()` (`lib/supabase/server.ts`) | Route Handlers, Server Components, Server Functions | publishable + user cookies | **Applies.** Use this for all normal reads and writes. |
| `createSupabaseBrowserClient()` (`lib/supabase/client.ts`) | Client Components | publishable | Applies |
| `createSupabaseAdminClient()` (`lib/supabase/admin.ts`) | **Only** `lib/auth/provisioning.ts` | secret | **Bypassed** |

- Create **one** server client per request and pass it to the guard and the
  repositories, so the guard and queries share the same session:

  ```ts
  const supabase = await createSupabaseServerClient();
  const user = await requireAdmin({ client: supabase });
  const rows = await listSubjects(supabase, pagination);
  ```
- Clients are typed with the generated `Database` type
  (`lib/supabase/database.types.ts`). Repository signatures take
  `SupabaseClient<Database>`.
- `tests/server-only.test.ts` fails if anything except
  `lib/auth/provisioning.ts` imports the admin client, or if any `app/` file
  imports the provisioning service. If Phase 3 needs a new privileged
  operation, add it as a reviewed function next to `provisionAccount`, update
  that test deliberately, and document why RLS cannot express it.

## 3. Layering

```
app/api/<resource>/route.ts      Route Handler: apiRoute, CSRF, guard, parse, call service, respond
lib/<domain>/service.ts          Business rules (e.g. "a class teacher must teach in that class")
lib/<domain>/repository.ts       Supabase queries only; map rows/errors; no HTTP concerns
```

**Route Handler template**

```ts
import { z } from "zod";
import { assertSameOrigin } from "@/lib/api/csrf";
import { apiRoute, created } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/validation";
import { requireAdmin } from "@/lib/auth/authorization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSubject } from "@/lib/subjects/service";

const bodySchema = z.strictObject({ code: z.string().trim().min(1).max(20), name: z.string().trim().min(1).max(100) });

export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);                         // every state-changing handler
  const supabase = await createSupabaseServerClient();
  const user = await requireAdmin({ client: supabase });
  const input = await parseJsonBody(request, bodySchema);
  return created(await createSubject(supabase, input, user));
});
```

- **GET with params:** use `parseParams(params, z.object({ id: uuidSchema }))`.
  For collections, use `getPagination(new URL(request.url).searchParams)`, then
  `.range(from, to)`.
- **Repositories** must:
  - check `error` on every Supabase result and never return partial data;
  - validate unexpected row shapes;
  - throw `DataAccessError(operation, error.code)` on failure. See
    `lib/auth/repository.ts` for the pattern (`unwrap`).
- **Required Phase 3 addition:** a shared mapper from PostgREST/Postgres codes
  to API errors. Today any non-network `DataAccessError` becomes 500.

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
- **Failure:** throw an `ApiError` (factories in `lib/api/errors.ts`) →
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
| Route/service logic | `tests/<domain>/*.test.ts` (`npm test`) | Mock at the repository boundary or use `fake-supabase.ts`. Offline. |
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

- The Postgres error-code mapper above (required).
- The deactivation/reactivation service (required for user management).
- Integration coverage for `requireStudentOwnership`/`requireTeacherAssignment`
  repository lookups through real routes (they're unit-tested; RLS enforces the
  same rules and is integration-tested).
- `users.email` isn't synced if a user changes their Auth email.
- No app-level rate limiting; no DB-level teacher double-booking guard.
