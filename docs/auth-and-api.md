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
| `src/functions/provisioning/index.ts` | `provisionAccount()`: creates Auth identities and application accounts (secret-key client). |
| `src/functions/account-setup/index.ts` | `issueSetupCode`, `completeAccountSetup`: one-time setup codes for administrators (secret-key client; see below). |
| `src/functions/sign-in/index.ts` | `signInAdmin`, `signInTeacher`, `signUpTeacher`, `signInStudent`, `resetTeacherSignUp`: one sign-in per role (secret-key client only to look up the identity behind a phone or admission number). |
| `src/functions/session/index.ts` | `getAuthenticatedUser`, `getCurrentAppUser`, `signInWithPassword`, `acceptNewSession` (role check, discards a refused session), `signOutCurrentSession`, `toSessionProfile`. |
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
{ "data": { "id": "<users.id>", "role": "STUDENT", "isActive": true, "fullName": "Asha Verma", "email": "asha@example.com" }, "error": null }
```

| Status | Code | When |
| ------ | ---- | ---- |
| 200 | — | Valid session, provisioned, active. |
| 401 | `UNAUTHORIZED` | No session, or the Auth server rejects it (expired, revoked, malformed). |
| 403 | `ACCOUNT_NOT_PROVISIONED` | Valid Auth user with no `users` row. |
| 403 | `ACCOUNT_INACTIVE` | `users.isActive = false`. |
| 503 | `SERVICE_UNAVAILABLE` | Supabase not configured or unreachable. |

### One sign-in per role

Each role has its own page and its own endpoint; none of them accepts another
role's account. Supabase Auth still identifies everyone by email: teachers and
students never type it, the server looks it up from the phone or admission
number. All of these endpoints are public, same-origin only, take a **strict**
JSON body (unknown fields such as `role`, `userId` or `isActive` are rejected
with 422), set the session cookies on success, and return the `/api/auth/me`
body (or `{ isSignedIn, profile }` after choosing a password). None of them
creates accounts or assigns roles. If the account is unprovisioned, inactive or
of another role, the new session is revoked before the error is returned.

| Role | Page | Endpoint | Body |
| ---- | ---- | -------- | ---- |
| Administrator | `/admin/sign-in` | `POST /api/auth/admin/login` | `{ email, password }` |
| Administrator (first time / reset) | `/admin/account-setup` | `POST /api/auth/admin/setup` | `{ email, code, password }` |
| Teacher | `/teacher/sign-in` | `POST /api/auth/teacher/login` | `{ phone, password }` |
| Teacher (first time) | `/teacher/sign-up` | `POST /api/auth/teacher/sign-up` | `{ phone, password }` |
| Student | `/student/sign-in` | `POST /api/auth/student/login` | `{ admissionNumber }` |

**Administrators.** There is no admin sign-up. The first administrator is
created with `npm run bootstrap:admin`; every later one by an administrator
(`POST /api/admins`, the Administrators page), who is shown a one-time setup
code to hand over. A wrong password, an unknown email and a teacher's or
student's account all get the same 401 `INVALID_CREDENTIALS` ("The email or
password is incorrect.").

**Teachers.** An administrator adds the teacher with their mobile number
(required, stored as 10 digits, unique among teachers). The teacher then signs
up once on `/teacher/sign-up` with that number and a new password (12–72
characters); no verification code is sent, by design, because only teachers an
administrator added (active, not yet signed up) can sign up. Numbers are
accepted as people write them (`+91 98765-43210`, `098765 43210`). The sign-up
is claimed atomically (`claimTeacherSignUp`), so two simultaneous sign-ups for
one number cannot both succeed; if setting the password then fails, the claim
is released. An administrator can **reset** a teacher's sign-up
(`POST /api/users/{userId}/reset-sign-up`) after a forgotten password: their
sessions end, the old password is replaced with a random one, and they sign up
again.

| Endpoint | Status | Code | When |
| -------- | ------ | ---- | ---- |
| teacher/login | 401 | `INVALID_CREDENTIALS` | Unknown number, wrong password, not signed up yet, or not a teacher ("The phone number or password is incorrect."). |
| teacher/sign-up | 404 | `NOT_FOUND` | No teacher has this number. |
| teacher/sign-up | 409 | `CONFLICT` | Already signed up. |
| teacher/sign-up | 422 | `VALIDATION_ERROR` | Not a 10-digit mobile number, password outside 12–72 characters, or a password Supabase Auth rejects as weak (`details` on `password`). |
| both | 403 | `ACCOUNT_INACTIVE` | Deactivated teacher. |

**Students** sign in with their admission number only (exact match after
trimming), no password. The server mints a one-time magic-link token for the
student's Auth identity with the secret key (`generateLink`, no email is sent)
and redeems it at once on the request client (`verifyOtp`), which writes the
session cookies. **Anyone who knows a student's admission number can sign in
as that student**; this was a deliberate product decision. An unknown number is
401 `INVALID_CREDENTIALS`, a deactivated student 403 `ACCOUNT_INACTIVE`.

Common to all: 400 `BAD_REQUEST` / `INVALID_JSON` (not JSON), 403
`CSRF_REJECTED` (cross-site), 429 `RATE_LIMITED` (Supabase Auth rate limit),
503 `SERVICE_UNAVAILABLE`.

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

### `POST /api/auth/admin/setup`

An administrator added by another administrator chooses their password, and
the admin-issued password reset. Public, same-origin only.

```json
{ "email": "office@example.com", "code": "7K2M-Q9TB-4HXD", "password": "at least 12 characters" }
```

- The code is case-insensitive; spaces and dashes are optional, and the look-alike letters O, I and L are read as 0 and 1.
- On success the password is set, the administrator is signed in (session cookies), and the response is `{ isSignedIn, profile }`, where `profile` is the `/api/auth/me` body. If only that last sign-in step fails, `isSignedIn` is `false` and they sign in normally.
- Codes exist for **administrator accounts only** (migration 15): issued by `POST /api/admins` (returned as `setupCode`) or `POST /api/users/{userId}/setup-code`. They are 12 characters (≈60 bits), valid for 7 days, single-use, stored only as a SHA-256 hash, and a new code replaces the old one. A code row for any other account never matches.
- The code is consumed atomically before the password is set, so two requests can't both use it. If setting the password fails, the code is restored.
- Five wrong guesses against an account's code invalidate it.

| Status | Code | When |
| ------ | ---- | ---- |
| 200 | — | Password set. |
| 401 | `INVALID_SETUP_CODE` | Unknown email, wrong, used or expired code. One message for all of them, so responses don't reveal which accounts exist. |
| 403 | `ACCOUNT_INACTIVE` | Valid code for a deactivated account (the code is kept). |
| 403 | `CSRF_REJECTED` | Cross-site request. |
| 422 | `VALIDATION_ERROR` | Malformed email, missing code, password outside 12–72 characters, unknown fields, or a password Supabase Auth rejects as weak (`details` on `password`). |
| 429 | `RATE_LIMITED` | Supabase Auth rate limit hit. |
| 503 | `SERVICE_UNAVAILABLE` | Supabase unreachable. |

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
| 401 | `UNAUTHORIZED`, `INVALID_CREDENTIALS`, `INVALID_SETUP_CODE` |
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

**Rate limiting:** there is no application-level limiter. The sign-in endpoints
rely on Supabase Auth's built-in limits and map them to 429. Those limits count
per client IP, and every sign-in reaches Supabase from the server, so they are
shared by everyone (student sign-in uses the token-verification limit). Before
production, raise them in the Supabase dashboard to suit the school's morning
peak, and add an app-level limiter (per IP, in a shared store), above all for
student sign-in, where admission numbers are easy to guess.

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
