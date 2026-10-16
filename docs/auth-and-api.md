# Authentication, authorization and API conventions

> **Status:** connected to the real Supabase project (Phase 2.5). Covered by
> offline unit tests (`npm test`) **and** by real-project integration tests
> (`npm run test:integration`). RLS policies in `db/README.md` are live.
> Setup and operations: `docs/supabase.md`.

## Module map

| Module | Responsibility |
| ------ | -------------- |
| `src/helpers/supabase-server/index.ts` | `createSupabaseServerClient()`: request-scoped client (publishable key + session cookies). `clearSupabaseAuthCookies()`: logout fallback. |
| `src/helpers/supabase-browser/index.ts` | `createSupabaseBrowserClient()` for Client Components (publishable key only). |
| `src/helpers/supabase-proxy/index.ts` + `src/proxy.ts` | Session refresh before pages/handlers run (`getClaims()`). |
| `src/functions/provisioning/index.ts` | `provisionAccount()`: the only secret-key user; creates Auth identities and application accounts. |
| `src/functions/session/index.ts` | `getAuthenticatedUser`, `getCurrentAppUser`, `signInWithPassword`, `signOutCurrentSession`, `toSessionProfile`, and the `users`-row lookup. |
| `src/functions/authorization/index.ts` | Guards: `requireAuthenticatedUser`, `requireRole`, `requireAdmin`, `requireStudentOwnership`, `requireTeacherAssignment`; checks `teachesClass`, `teacherHasAssignment`, `findTeacherIdByUserId`. |
| `src/helpers/roles/index.ts` | `toAppRole` / `toDbRole`: the only mapping between the API's uppercase roles and the lowercase database enum. |
| `src/helpers/api-response/index.ts` | `ok`, `created`, `paginated`, `errorResponse`, `toErrorResponse`, `apiRoute`. |
| `src/helpers/function-result/index.ts` | `functionSuccess`, `functionFailure`, `unwrapResult`: the `{ success, message, data }` contract of `src/functions` (see `docs/architecture.md`). |
| `src/helpers/api-error/index.ts` | `ApiError`, `DataAccessError`, one factory per error code, and `toApiError` (classifies anything thrown). |
| `src/helpers/request-validation/index.ts` | `parseJsonBody`, `parseParams`, `parseQuery`, `uuidSchema`, `assertUuid`, pagination. |
| `src/helpers/csrf/index.ts` | `assertSameOrigin` for state-changing handlers. |
| `src/helpers/logger/index.ts` | `logServerError`: metadata-only error logging. |

Every module above imports `server-only`. Importing one from a Client
Component fails the build, and `tests/server-only.test.ts` enforces this.

## Endpoints

All responses use the standard envelope and send
`Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0`.

### `GET /api/auth/me`

Returns the session profile of the signed-in user.

```json
{ "data": { "id": "<users.id>", "role": "STUDENT", "isActive": true }, "error": null }
```

| Status | Code | When |
| ------ | ---- | ---- |
| 200 | — | Valid session, provisioned, active. |
| 401 | `UNAUTHORIZED` | No session, or the Auth server rejects it (expired, revoked, malformed). |
| 403 | `ACCOUNT_NOT_PROVISIONED` | Valid Auth user with no `users` row. |
| 403 | `ACCOUNT_INACTIVE` | `users.isActive = false`. |
| 503 | `SERVICE_UNAVAILABLE` | Supabase not configured or unreachable. |

### `POST /api/auth/login`

Request (`Content-Type: application/json`, same-origin):

```json
{ "email": "user@example.com", "password": "user-password" }
```

- The body is a strict schema. Unknown fields such as `role`, `userId` or
  `isActive` are rejected with 422, not silently ignored.
- On success it sets the Supabase session cookies and returns the same body as
  `/api/auth/me`.
- It never registers users, creates `users` rows, or assigns roles. If the Auth
  user is unprovisioned or inactive, the newly created session is revoked and
  its cookies cleared before the 403 is returned.

| Status | Code | When |
| ------ | ---- | ---- |
| 200 | — | Signed in. |
| 400 | `BAD_REQUEST` / `INVALID_JSON` | Not `application/json`, or unparseable body. |
| 403 | `CSRF_REJECTED` | Cross-site request. |
| 422 | `VALIDATION_ERROR` | Malformed email, missing password, unknown fields. |
| 401 | `INVALID_CREDENTIALS` | Wrong password, unknown or unconfirmed email, banned user. All of these return the same message, so responses don't reveal which accounts exist. |
| 403 | `ACCOUNT_NOT_PROVISIONED` / `ACCOUNT_INACTIVE` | As above. |
| 429 | `RATE_LIMITED` | Supabase Auth rate limit hit. |
| 503 | `SERVICE_UNAVAILABLE` | Supabase not configured or unreachable. |

### `POST /api/auth/logout`

No body. Same-origin only. Signs out the current session (`scope: "local"`,
which revokes this device's refresh token) and clears its cookies.

```json
{ "data": { "signedOut": true }, "error": null }
```

| Status | Code | When |
| ------ | ---- | ---- |
| 200 | — | Signed out, including when there was no session. |
| 403 | `CSRF_REJECTED` | Cross-site request, or neither `Origin` nor `Sec-Fetch-Site` sent. |
| 503 | `SERVICE_UNAVAILABLE` | Supabase not configured. |

- Without a session it returns 200 and makes no network call.
- With an expired or revoked session it returns 200 and clears the cookies.
- If Supabase is unreachable, the auth cookies are still deleted locally and
  it returns 200. Revoking on the server is then best-effort. With an expired
  access token, supabase-js retries the refresh with backoff for up to ~30 s
  before giving up, so logout can be slow during a Supabase outage.

## School management endpoints

School endpoints (Phases 3–6: school resources, people, attendance, exams and
results, timetable, notices), their permissions, the database error mapping
and the account-status behaviour are documented in `docs/school-api.md`.

## Response and error conventions

```json
{ "data": { }, "error": null }
{ "data": null, "error": { "code": "UNAUTHORIZED", "message": "Authentication is required." } }
```

Validation errors add `details: [{ "path": "email", "message": "…" }]`.
Details never include the submitted values.

| Status | Codes |
| ------ | ----- |
| 200 / 201 | `ok()` / `created()` |
| 400 | `BAD_REQUEST`, `INVALID_JSON`, `VALIDATION_ERROR` (route params, query string) |
| 401 | `UNAUTHORIZED`, `INVALID_CREDENTIALS` |
| 403 | `FORBIDDEN`, `ACCOUNT_NOT_PROVISIONED`, `ACCOUNT_INACTIVE`, `CSRF_REJECTED` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 422 | `VALIDATION_ERROR` (JSON bodies that parse but fail the schema) |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` (anything unexpected) |
| 503 | `SERVICE_UNAVAILABLE` (missing configuration, Supabase unreachable) |

Write every Route Handler with `apiRoute`:

```ts
export const GET = apiRoute(async (request: Request, { params }: RouteContext<"/api/x/[id]">) => {
  const user = await requireRole(["ADMIN", "TEACHER"]);
  const { id } = await parseParams(params, z.object({ id: uuidSchema }));
  const { page, limit, from, to } = getPagination(new URL(request.url).searchParams);
  // …query with the request-scoped client, then:
  return ok(result);
});
```

`apiRoute` does two things:

1. It awaits `connection()` so handlers run at request time. With Cache
   Components enabled, a GET handler that fails before reading cookies could
   otherwise be prerendered at build time.
2. It converts anything thrown into a safe response. `ApiError`s pass through,
   `EnvValidationError` becomes 503, and everything else becomes a generic 500.
   Raw Supabase, PostgREST or stack details never reach clients.

## Authorization guards

| Guard | Allows | Rejects |
| ----- | ------ | ------- |
| `requireAuthenticatedUser(client)` | Any active, provisioned user | 401 no/invalid session; 403 unprovisioned/inactive |
| `requireRole(client, roles)` | Users whose **database** role is in `roles` | 401; 403 other roles |
| `requireAdmin(client)` | Active `ADMIN` | 401; 403 |
| `requireStudentOwnership(client, studentId, { isAdminAllowed? })` | The student whose `students.userId` is the caller; admins only if `isAdminAllowed: true` | 401; 400 malformed id; 403 other students, teachers, admins without opt-in |
| `requireTeacherAssignment(client, { teacherId, classId, subjectId? })` | The caller's own teacher profile, assigned to the class (and subject when given) via `teacherAssignments`, or as class teacher when no subject is given | 401; 400 malformed ids; 403 another teacher's id, unassigned class/subject, non-teachers (including admins) |

Every guard takes the request-scoped client and returns the standard
`{ success, message, data }` result. Routes call
`unwrapResult(await requireAdmin(supabase))`, which gives the user or rethrows
the 401/403 for `apiRoute`.

**Verification:** the guards' logic is unit-tested against an in-memory fake.
The same rules are enforced in the database by RLS (`app.teachesClass`,
`app.teachesClassSubject`, …), which `tests/integration/rls.test.ts` verifies
against the real database. `getCurrentAppUser` and the user lookup are verified
end to end in `tests/integration/auth.test.ts`. The student and teacher
ownership lookups are exercised end to end by the route-level integration
suites (`phase3-matrix`, `people`, `attendance`, `results`, `workflow`).

## Security safeguards

1. **Caller identity comes only from the session.** `auth.getUser()` validates
   the token with the Auth server. Roles come from the `users` row; roles in
   Auth metadata and IDs in requests are ignored as proof of identity. IDs
   passed to guards identify the *resource*, and are compared against the
   caller's own records.
2. **No service role for user requests.** Auth, guards and API routes use the
   anon-key client, so RLS applies. A test fails if any of them imports
   `src/helpers/supabase-admin/index.ts`.
3. **No secrets in responses, logs or bundles.**
   - `logServerError` records only event, error name, code and status. It never
     logs messages, which can contain emails or values.
   - Tests assert that the password, tokens and service key appear in no
     response or log output.
   - The service key is not `NEXT_PUBLIC_` and is only referenced server-side.
4. **No public registration or admin creation.** There is no sign-up endpoint.
   Login never creates `users` rows or assigns roles (see initial-admin
   provisioning in `db/README.md`).
5. **No silent account creation.** Unprovisioned Auth users are refused and
   their session is discarded.
6. **Validation before data access.** Bodies, params and query strings go
   through Zod first. Guards validate UUIDs after authentication, so
   unauthenticated callers get 401 rather than validation details.
7. **Safe errors.** Error messages are fixed strings, and credential failures
   are indistinguishable from each other.
8. **CSRF.** Next.js checks Origin only for Server Actions, not Route Handlers.
   State-changing handlers therefore call `assertSameOrigin`:
   - `Origin` must match the request host.
   - Without `Origin`, `Sec-Fetch-Site` must be `same-origin` or `none`.
   - With neither header, the request is rejected.

   This is layered on top of Supabase's `SameSite=Lax` cookies and the
   `application/json` body requirement, which plain HTML forms cannot send.
9. **Supabase SSR cookie pattern.**
   - Cookies are read with `getAll` and written with `setAll` on a new client
     per request.
   - Writes happen only in Route Handlers, where Next.js allows them. The
     try/catch in `setAll` covers Server Components, which cannot write
     cookies.
   - `src/proxy.ts` refreshes expired sessions with `getClaims()` before any page
     or handler runs, and forwards the new cookies with `no-store` headers.
     Route Handlers still validate with `getUser()`.
10. **Server-only.** All of the modules above import `server-only`.

**Rate limiting:** there is no application-level limiter. The login endpoint
relies on Supabase Auth's built-in limits and maps them to 429. Add an
app-level limiter (e.g. per IP + email, in a shared store) before production if
stricter limits are needed.

## Testing

- `tests/auth/session.test.ts` and `tests/auth/authorization.test.ts` use an
  in-memory fake client (`tests/helpers/fake-supabase.ts`) seeded with a small
  school.
- `tests/auth/routes.test.ts` runs the real `@supabase/ssr` and
  `@supabase/supabase-js` code against a stubbed `fetch` and a fake Next.js
  cookie store. It covers cookie writes, token handling and error mapping.
- `tests/api/*` covers the response, validation, pagination and CSRF helpers.

Real-project integration tests (`tests/integration/`, run with
`npm run test:integration`) cover:

- Login, refresh, revocation and the proxy against the real Auth server.
- RLS for every role.
- The applied schema.
- Provisioning.

See `docs/supabase.md` section 6.
