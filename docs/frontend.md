# Frontend architecture (Frontend Phase 1: authentication + admin portal)

The portal is a Next.js 16 App Router app with Cache Components on. It talks to
the backend only through the existing `/api/*` route handlers; no browser code
calls Supabase directly. The structure follows the root `AGENTS.md`.

## Routes

| Path | Group | Who |
| ---- | ----- | --- |
| `/` | — | Redirects to `/sign-in`. |
| `/sign-in` | `(auth)` | Public. Anyone already signed in is sent to their home page. |
| `/account-setup` | `(auth)` | Public. First-time password with an admin-issued setup code (also an admin-issued reset). |
| `/access-denied` | `(auth)` | Signed-in teachers and students until their portals exist. |
| `/admin` and `/admin/*` | `(admin)` | Active admins only. |

Admin pages: dashboard, academic years, classes, subjects, students (+ profile),
teachers (+ profile), enrollments, teacher assignments, student attendance,
teacher attendance, exams (+ papers), marks entry, report cards, timetable,
notices (+ notice page).

The school photographs appear only in `(auth)/layout.tsx` (enforced by
`tests/frontend-conventions.test.ts`).

## Authentication and access

- **Session:** the httpOnly Supabase cookies set by `POST /api/auth/login` and
  `POST /api/auth/setup`. Nothing about the session is stored in browser storage
  or Zustand.
- **Gate:** `src/app/(admin)/admin/layout.tsx` renders `<AdminGate>` inside
  `<Suspense>`. The gate (a Server Component) calls `getCurrentAppUser` and
  checks the **database** role: no session → `/sign-in`; inactive or
  unprovisioned → `/sign-in?reason=…`; not an admin → `/access-denied`;
  Supabase unreachable → a "portal unavailable" page. Admin pages render only
  inside the gate, so nothing renders before the role is known. The gate awaits
  `connection()` first: the session read must never be prerendered.
- **The gate decides which pages render; it is not the security boundary.**
  Every API route enforces its own permissions, backed by RLS.
- **Expired session:** any API call answering 401 `UNAUTHORIZED` sends the
  person to `/sign-in?reason=session-expired` with a full page load, which also
  discards all in-memory state. Sign-out does the same.

## Data flow

| Layer | Files | Role |
| ----- | ----- | ---- |
| API client | `src/functions/api-client` | `apiRequest` (one `fetch` wrapper), `fetchAllPages` (bounded reference lists only), `countRecords` (`limit=1` totals), `createRecord`/`updateRecord`/`deleteRecord`/`runRecordAction`. Never throws; always `{ success, message, data }`. A failure's `data` is `{ status, code, details }`. |
| Messages | `src/constants/api-client`, `src/helpers/api-client` | Plain-language text for generic codes (credentials, rate limit, outage, network); specific server messages (conflicts, not found) are shown as they are. |
| Module calls | `src/functions/admin-<module>` | Named calls (`createClass`, `issueSetupCode` …) with try/catch, per `AGENTS.md`. |
| Loading | `src/hooks/use-async-result`, `use-api-query` | Load on key change or `reload()`; a newer request always wins (stale responses are aborted and ignored). |
| Saving | `src/hooks/use-mutation` | No double submits; field errors go next to fields, other failures to one message; success toasts only after the server confirms. |
| Reference data | `src/zustand/reference-data`, `src/functions/reference-data`, `src/hooks/use-reference-data` | Academic years, classes, subjects and teachers, loaded once per session to turn ids into names. Call `refreshReferenceData()` after changing one; refreshes run in the background without blanking the page. |
| UI state | `src/zustand/admin-shell` | The mobile navigation drawer. |

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
