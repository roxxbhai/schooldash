import { connect } from './db';
import { randomBytes } from 'node:crypto';
import { provisionAccount } from '@/functions/provisioning';
import { unwrapResult } from '@/helpers/function-result';
import type { ProvisionAccountInput } from '@/functions/provisioning';
import { createSupabaseAdminClient } from '@/helpers/supabase-admin';

/**
 * Real identities and records for route-level integration tests.
 *
 * - The integration admin (IT_ADMIN_EMAIL) is a dedicated, persistent test
 *   account: audit entries reference whoever acted and can never be deleted,
 *   so the actor must persist. Each run gives it a new random password and
 *   reactivates it; `retireItAdmin()` deactivates it again afterwards.
 * - Everything else a test creates is registered with `track()` and removed
 *   by `cleanupTracked()`, children before parents. Only tracked IDs are ever
 *   deleted — never the real administrator or real school data.
 */

export const IT_ADMIN_EMAIL = 'schooldash-it-admin@example.com';
export const runId = `${Date.now().toString(36)}${randomBytes(2).toString('hex')}`;
export const testEmail = (label: string) => `it-${runId}-${label}@example.com`;
export const testCode = (label: string) => `IT-${runId}-${label}`.toUpperCase();
/** SUBJECT NAMES ARE UNIQUE, UPPER-CASE LETTERS/DIGITS/SPACES (MIGRATION 18); `label` MUST BE ALPHANUMERIC. */
export const testSubjectName = (label: string) => `IT ${runId} ${label}`.toUpperCase();
export const testPassword = () => `It-${randomBytes(18).toString('base64url')}`;
/** A RANDOM MOBILE NUMBER (TEACHER NUMBERS ARE UNIQUE). STARTS WITH 6 SO IT IS UNLIKELY TO BE A REAL TEACHER'S. */
export const testPhone = () => `6${randomBytes(5).readUIntBE(0, 5).toString().padStart(9, '0').slice(-9)}`;

const admin = () => createSupabaseAdminClient();

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export interface TestAccount {
  email: string;
  password: string;
  userId: string;
  authUserId: string;
}

async function setStatus(userId: string, isActive: boolean) {
  const { error } = await admin().rpc('setAppUserStatus', { userId, isActive, actorUserId: null as never });
  if (error) throw new Error(`setAppUserStatus failed: ${error.code}`);
}

/**
 * Persistent test identities perform audited actions: audit entries reference
 * the actor forever, so the actor can never be deleted. Each run gives the
 * identity a fresh random password and reactivates it; `retire()` deactivates
 * it and rotates the password again afterwards.
 */
async function ensurePersistent(
  email: string,
  input: { fullName: string; role: 'ADMIN' } | { fullName: string; role: 'TEACHER'; phone: string; profile: Record<string, never> },
): Promise<TestAccount> {
  const password = testPassword();
  const found = await admin().rpc('findAuthUserIdByEmail', { email });
  if (found.error) throw new Error(`lookup failed: ${found.error.code}`);

  if (found.data) {
    const updated = await admin().auth.admin.updateUserById(found.data, { password });
    if (updated.error) throw new Error(`password reset failed: ${updated.error.code}`);
  }
  const db = await connect();
  try {
    let row = (await db.query('select id, "isActive" from public.users where lower(email) = $1', [email])).rows[0];
    if (!row) {
      const account = unwrapResult(await provisionAccount({ ...input, email, password }, { linkExistingAuthUser: true }));
      row = { id: account.userId, isActive: true };
    }
    if (!row.isActive) await setStatus(row.id, true);
    const authUserId = (await admin().rpc('findAuthUserIdByEmail', { email })).data!;
    return { email, password, userId: row.id, authUserId };
  } finally {
    await db.end();
  }
}

export const ensureItAdmin = () => ensurePersistent(IT_ADMIN_EMAIL, { fullName: 'Integration Test Admin', role: 'ADMIN' });

export const IT_TEACHER_EMAIL = 'schooldash-it-teacher@example.com';
export const ensureItTeacher = () =>
  ensurePersistent(IT_TEACHER_EMAIL, {
    fullName: 'Integration Test Teacher',
    role: 'TEACHER',
    phone: '6000000001',
    profile: {},
  });

/** Deactivates a persistent identity and invalidates this run's password. */
export async function retire(account: TestAccount): Promise<void> {
  await setStatus(account.userId, false);
  await admin().auth.admin.updateUserById(account.authUserId, { password: testPassword() });
}

/**
 * afterAll for every suite: removes tracked records, and ALWAYS retires the
 * persistent identities — even if cleanup fails part-way.
 */
export async function teardown(...persistent: (TestAccount | undefined)[]): Promise<void> {
  try {
    await cleanupTracked();
  } finally {
    for (const account of persistent) if (account) await retire(account);
  }
}

// --- tracked test records ----------------------------------------------------------

type Tracked =
  | 'notices'
  | 'timetableEntries'
  | 'results'
  | 'examSubjects'
  | 'exams'
  | 'studentAttendance'
  | 'teacherAttendance'
  | 'teacherAssignments'
  | 'studentEnrollments'
  | 'classes'
  | 'subjects'
  | 'academicYears'
  | 'authUsers';
const tracked: Record<Tracked, Set<string>> = {
  notices: new Set(),
  timetableEntries: new Set(),
  results: new Set(),
  examSubjects: new Set(),
  exams: new Set(),
  studentAttendance: new Set(),
  teacherAttendance: new Set(),
  teacherAssignments: new Set(),
  studentEnrollments: new Set(),
  classes: new Set(),
  subjects: new Set(),
  academicYears: new Set(),
  authUsers: new Set(),
};

export function track(kind: Tracked, id: string | undefined | null): void {
  if (id) tracked[kind].add(id);
}

/** Provisions a tracked student/teacher/admin account with a known password (teachers get a random phone number). */
export async function provisionTestAccount(
  label: string,
  input: DistributiveOmit<ProvisionAccountInput, 'email' | 'password' | 'fullName' | 'phone'> & { fullName?: string; phone?: string },
): Promise<TestAccount> {
  const email = testEmail(label);
  const password = testPassword();
  const phone = input.role === 'TEACHER' ? (input.phone ?? testPhone()) : undefined;
  const account = unwrapResult(
    await provisionAccount({ fullName: `IT ${label}`, ...input, email, password, ...(phone ? { phone } : {}) } as ProvisionAccountInput),
  );
  track('authUsers', account.authUserId);
  return { email, password, userId: account.userId, authUserId: account.authUserId };
}

/** Deletes only tracked rows, children before parents, then the tracked Auth users. */
export async function cleanupTracked(): Promise<void> {
  const db = await connect();
  const ids = (kind: Tracked) => [...tracked[kind]];
  const column = async (sql: string, params: unknown[]) =>
    (await db.query(sql, params)).rows.map((row) => row.id as string);
  try {
    const userIds = await column('select id from public.users where "authUserId" = any($1)', [ids('authUsers')]);
    const studentIds = await column('select id from public.students where "userId" = any($1)', [userIds]);
    const teacherIds = await column('select id from public.teachers where "userId" = any($1)', [userIds]);

    // Setup codes reference the account and the issuing admin.
    await db.query('delete from public."accountSetupCodes" where "userId" = any($1) or "issuedByUserId" = any($1)', [userIds]);
    // Notices (their audiences cascade) reference classes and the creating user.
    await db.query('delete from public.notices where id = any($1) or "createdByUserId" = any($2)', [ids('notices'), userIds]);
    // Timetable entries reference assignments, classes, subjects and teachers.
    await db.query('delete from public."timetableEntries" where id = any($1) or "teacherId" = any($2) or "classId" = any($3)', [ids('timetableEntries'), teacherIds, ids('classes')]);
    // Results → papers → exams first: they reference enrollments, classes and years.
    await db.query('delete from public.results where id = any($1) or "studentId" = any($2) or "enteredByUserId" = any($3) or "examSubjectId" = any($4)', [ids('results'), studentIds, userIds, ids('examSubjects')]);
    await db.query('delete from public."examSubjects" where id = any($1) or "examId" = any($2)', [ids('examSubjects'), ids('exams')]);
    await db.query('delete from public.exams where id = any($1)', [ids('exams')]);
    // Attendance first: it references enrollments, teachers and the marking user.
    await db.query('delete from public."studentAttendance" where id = any($1) or "studentId" = any($2) or "markedByUserId" = any($3)', [ids('studentAttendance'), studentIds, userIds]);
    await db.query('delete from public."teacherAttendance" where id = any($1) or "teacherId" = any($2) or "markedByUserId" = any($3)', [ids('teacherAttendance'), teacherIds, userIds]);
    await db.query('delete from public."teacherAssignments" where id = any($1) or "teacherId" = any($2)', [ids('teacherAssignments'), teacherIds]);
    await db.query('delete from public."studentEnrollments" where id = any($1) or "studentId" = any($2)', [ids('studentEnrollments'), studentIds]);
    await db.query('update public.classes set "classTeacherId" = null where "classTeacherId" = any($1)', [teacherIds]);
    await db.query('delete from public.classes where id = any($1)', [ids('classes')]);
    await db.query('delete from public.subjects where id = any($1)', [ids('subjects')]);
    await db.query('delete from public."academicYears" where id = any($1)', [ids('academicYears')]);
    await db.query('delete from public.students where id = any($1)', [studentIds]);
    await db.query('delete from public.teachers where id = any($1)', [teacherIds]);
    // One user at a time: a user referenced by an audit entry as the actor can
    // never be deleted (audit history is immutable). Such users are retained,
    // deactivated, with their password rotated — and reported.
    for (const userId of userIds) {
      const actor = (await db.query('select exists(select 1 from public."auditLogs" where "actorUserId" = $1) as actor', [userId])).rows[0].actor;
      const authUserId = (await db.query('select "authUserId" from public.users where id = $1', [userId])).rows[0].authUserId as string;
      if (actor) {
        await setStatus(userId, false).catch(() => undefined); // may already be inactive
        await admin().auth.admin.updateUserById(authUserId, { password: testPassword() });
        tracked.authUsers.delete(authUserId);
        console.warn(`[integration cleanup] retained audit actor ${userId} (deactivated, password rotated)`);
      } else {
        await db.query('delete from public.users where id = $1', [userId]);
      }
    }
  } finally {
    await db.end();
  }
  for (const authId of tracked.authUsers) {
    await admin().auth.admin.deleteUser(authId);
  }
  for (const set of Object.values(tracked)) set.clear();
}
