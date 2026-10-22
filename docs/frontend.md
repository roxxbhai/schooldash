# Frontend architecture (Frontend Phase 1: authentication + admin portal)

The portal is a Next.js 16 App Router app with Cache Components on. It talks to
the backend only through the existing `/api/*` route handlers; no browser code
calls Supabase directly. The structure follows the root `AGENTS.md`.

## Routes

| Path | Group | Who |
| ---- | ----- | --- |
| `/` | — | Redirects to `/student/sign-in`. |
| `/student/sign-in` | `(auth)` | Public. Admission number only. |
| `/teacher/sign-in` | `(auth)` | Public. Mobile number + password. |
| `/teacher/sign-up` | `(auth)` | Public. A teacher the school added chooses their password, once. |
| `/admin/sign-in` | `(auth)` | Public. Email + password. There is no admin sign-up. |
| `/admin/account-setup` | `(auth)` | Public. A new administrator chooses their password with a setup code from another administrator (also an admin-issued reset). |
| `/admin` and `/admin/*` | `(admin)` | Active admins only. |
| `/teacher` and `/teacher/*` | `(teacher)` | Active teachers only (Frontend Phase 2): overview, classes, rosters, attendance, marks, timetable, notices, profile. |
| `/student` and `/student/*` | `(student)` | Active students only (Frontend Phase 3): overview, attendance, timetable, results, notices, profile. Read-only. |

There is no shared sign-in page: each role has its own route. Every sign-in page
sends someone already signed in to their home page; where the role is unknown
(`/`, an ended session outside a portal) the fallback is student sign-in. The
`(auth)` and `(admin)` groups both contain an `admin` folder: `/admin/sign-in` and
`/admin/account-setup` live in `(auth)`, so the admin gate never wraps them.

Admin pages: dashboard, academic years, classes, subjects, students (+ profile),
teachers (+ profile), enrollments, teacher assignments, student attendance,
teacher attendance, exams (+ papers), marks entry, report cards, timetable,
notices (+ notice page), administrators.

The school photographs appear only in `(auth)/layout.tsx` (enforced by
`tests/frontend-conventions.test.ts`).

## Authentication and access

- **Session:** the httpOnly Supabase cookies set by the role's sign-in endpoint
  (`/api/auth/admin/login`, `/api/auth/teacher/login`, `/api/auth/student/login`,
  or after choosing a password, `/api/auth/teacher/sign-up` and `/api/auth/admin/setup`). Nothing about the session is stored in browser storage
  or Zustand.
- **Gate:** every portal layout (`(admin)/admin`, `(teacher)/teacher`,
  `(student)/student`) renders `<PortalGate role=…>` inside `<Suspense>`. The gate (a Server Component) calls `getCurrentAppUser` and
  checks the **database** role: no session → the portal's sign-in; inactive or
  unprovisioned → that sign-in with `?reason=…`; another role → that role's own home;
  Supabase unreachable → a "portal unavailable" page. Admin pages render only
  inside the gate, so nothing renders before the role is known. The gate awaits
  `connection()` first: the session read must never be prerendered.
- **Own record:** for teachers and students the gate also resolves their own
  `teachers.id` / `students.id` on the server (`findTeacherIdByUserId` /
  `findStudentIdByUserId`, from the session's user id, never from the browser) and
  hands it to `zustand/portal-session` (`recordId`) through `<PortalSessionSync>`.
  Pages use it only for filters and labels; the API checks ownership itself.
- **The gate decides which pages render; it is not the security boundary.**
  Every API route enforces its own permissions, backed by RLS.
- **Expired session:** any API call answering 401 `UNAUTHORIZED` sends the
  person to their portal's sign-in (`signInPathFor`, e.g. `/admin/sign-in`) with
  `?reason=session-expired`, using a full page load, which also discards all
  in-memory state. Sign-out does the same, to the role's own sign-in page.
- **Auth forms** share `src/hooks/use-auth-form.ts` (values, client checks,
  no double submit, server field errors, one clear message, navigation). Each
  form passes a `formId` that prefixes its field ids: Next.js keeps the previous
  page in the document, hidden, after a client navigation, so the teacher sign-in
  and sign-up forms would otherwise share `id="phone"` and the labels would point
  at the hidden one.

## Data flow

| Layer | Files | Role |
| ----- | ----- | ---- |
| API client | `src/functions/api-client` | `apiRequest` (one `fetch` wrapper), `fetchAllPages` (bounded reference lists only), `countRecords` (`limit=1` totals), `createRecord`/`updateRecord`/`deleteRecord`/`runRecordAction`. Never throws; always `{ success, message, data }`. A failure's `data` is `{ status, code, details }`. |
| Messages | `src/constants/api-client`, `src/helpers/api-client` | Plain-language text for generic codes (credentials, rate limit, outage, network); specific server messages (conflicts, not found) are shown as they are. |
| Module calls | `src/functions/admin-<module>` | Named calls (`createClass`, `issueSetupCode` …) with try/catch, per `AGENTS.md`. |
| Loading | `src/hooks/use-async-result`, `use-api-query` | Load on key change or `reload()`; a newer request always wins (stale responses are aborted and ignored). |
| Saving | `src/hooks/use-mutation` | No double submits; field errors go next to fields, other failures to one message; success toasts only after the server confirms. |
| Reference data | `src/zustand/reference-data`, `src/functions/reference-data`, `src/hooks/use-reference-data` | Academic years, classes, subjects and teachers, loaded once per session to turn ids into names. Classes are whatever the person may see (RLS: all for admins, the classes they teach for teachers); the teachers list is admin-only, so outside `/admin` it is never requested and stays empty. Call `refreshReferenceData()` after changing one; refreshes run in the background without blanking the page. |
| UI state | `src/zustand/portal-shell` | The mobile navigation drawer. |
| Shell | `components/portal-shell`, `portal-sidebar`, `portal-header`, `constants/portal-shell` | One sidebar + header + drawer for all three portals; each portal is a `PortalConfig` (navigation, role label, home). Components receive the portal's **role name**, never the config, because its icon components cannot be passed from a Server Component. |

Server data is not kept in a global store. Lists that return ids only (enrollments,
attendance, results, timetable, assignments) resolve names from reference data and,
for students, from the class's own student list — never one request per row.

## Module naming

Backend server modules already use the plain domain names (`src/functions/students`
is server-only). Frontend modules are named after the portal page that owns them:
`components/admin-students` ↔ `functions/admin-students` ↔ `constants/admin-students`
↔ `types/admin-students`. A future teacher portal would add `teacher-*` modules
the same way.

Every module in `src/functions` and `src/configs` declares its side with its first
import: `import 'server-only';` or `import 'client-only';`. A helper may declare a
side or be pure (no environment, no server APIs, no imports of marked modules). No
browser code may import a server-only module. `tests/server-only.test.ts` enforces
all of this by resolving every import.

## Teacher portal

Everything is limited by the API and RLS to what the teacher teaches; the UI only
mirrors it (hidden papers, class lists), it never decides access.

| Page | Data |
| ---- | ---- |
| Overview | Own record and assignments, today's own periods, today's attendance count per class (one `limit=1` count each), upcoming papers of their subjects, latest notices. |
| My classes | Classes they teach (RLS), their subjects, class-teacher role, students enrolled (one count per class). |
| Class roster | Roll number, name, admission number only, in roll order, with search. Another class is "not found". |
| Student | Name, admission number, class, roll; this year's attendance counts in their classes; marks in their own subjects (`components/report-card-browser`, server scope `assignedSubjects`, no totals). No address, parents or date of birth. |
| Attendance | The admin register (`components/admin-student-attendance`, `role='TEACHER'`): their classes only; `?classId=` opens a class. New records in one all-or-nothing bulk request, corrections one by one. |
| Marks entry | The admin marks sheet (`components/admin-results`) with `canEnterPaper`: only papers whose class **and** subject they are assigned (the API's rule). |
| Timetable | Their own periods (`?teacherId=`; RLS alone would also show colleagues' periods in their classes). |
| Notices | `notice-feed` / `notice-reader`, read-only. |
| My profile | Own record; own attendance counts and history (admins record it). |

## Student portal (read-only)

| Page | Data |
| ---- | ---- |
| Overview | Own record, this year's enrollment, attendance counts per status for the year (four `limit=1` counts), today's periods, the latest started exam's report card, latest notices. |
| My attendance | Counts per status for a date range plus the day-by-day list (`/api/student-attendance?studentId=`, paged). **Counts only, no percentage:** the school has no rule for how late and leave days count. |
| My timetable | The class's periods for the current year (`components/timetable-week`, shared with the admin timetable). No teacher names: students cannot read teachers' accounts. |
| Results | Year → exam → the server's report card. Marks show as soon as they are entered (no publication step in the backend); no grade, percentage or pass/fail; the total only when every subject has a mark. |
| Notices | `components/notice-feed` / `notice-reader`, shared with the teacher portal. Unpublished or other audiences' notices are a 404, shown as "not found". |
| My profile | Own record (no login email) and class history; corrections go through the school office. |

## Design system

All tokens live in `src/app/globals.css` (`:root` + `@theme inline`); components
use the generated utilities and never hex values.

- **Colour:** navy chrome (`--sidebar` `#10284a`), primary `#0b3164`, a restrained
  gold accent (`--brand-gold`) for the active navigation marker and the wordmark,
  white surfaces on a cool grey page, tinted status pairs (`success`, `warning`,
  `destructive`, `info` with `-soft` backgrounds). Light mode only.
- **Type:** Geist Sans for everything, Geist Mono for codes, ids, dates, times, roll
  numbers and marks. Fonts are defined only in `src/fonts/index.ts`.
- **Shape:** every radius token is 0, so all corners are square
  (`tests/frontend-conventions.test.ts` rejects any `rounded-*` utility).
- **Depth:** three navy-tinted shadows (`xs` cards, `sm` hover, `md`/`lg` menus and dialogs).
- **Motion:** 120 ms default transitions; all motion is removed under
  `prefers-reduced-motion`.
- **Focus:** visible 2 px rings on every control.

### shadcn/ui

`components.json` uses the `radix-lyra` style with `utils` → `@/helpers/cn`. The
CLI writes flat files; each component was moved to `components/ui/<name>/index.tsx`,
converted to single quotes, and its imports of `cn` fixed (the CLI resolves this
alias to a bare `cn` package — remove that package if a future `shadcn add`
installs it). Sizes were raised to 36 px controls and 13 px text.

The generated components use state shorthands (`data-open:`, `data-checked:`,
`data-active:` …). Radix marks state with `data-state="…"`, so `globals.css`
defines matching `@custom-variant`s; a test fails if a component uses one that is
not defined. After editing those variants, restart `next dev` (its CSS cache can
keep the old output).

## Tests

- `tests/frontend/api-client.test.ts`: envelope parsing, plain-language errors,
  malformed responses, network and abort failures, session-expiry redirect,
  pagination and counts.
- `tests/frontend/helpers.test.ts`: formatting (school time zone), form helpers,
  client schemas, labels, navigation matching.
- `tests/frontend-conventions.test.ts`: square corners, token-only colours,
  photographs only on auth screens, one fonts module, state variants defined.
- `tests/server-only.test.ts`: the side markers and import rules above.
