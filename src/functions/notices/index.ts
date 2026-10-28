import 'server-only';
import { NOTICE_COLUMNS, NOTICE_COLUMNS_WITH_AUDIENCES, NOTICE_ERRORS } from '@/constants/notices';
import { conflict, notFound, validationError } from '@/helpers/api-error';
import { many, one, orNullIfMissing } from '@/helpers/db-query';
import { functionFailure, functionSuccess } from '@/helpers/function-result';
import { presentNotice } from '@/helpers/notices';
import { toDbRole } from '@/helpers/roles';
import type { FunctionResult } from '@/types/function-result';
import type { AudienceInput, AudienceRow, Notice, NoticeWithAudiences } from '@/types/notices';
import type { DbClient } from '@/types/supabase';

/**
 * NOTICE OPERATIONS SHARED BY THE NOTICE ROUTES. LIFECYCLE AND AUDIENCE RULES ARE
 * ENFORCED BY THE DATABASE (MIGRATION 12) FOR EVERY WRITER; RLS DECIDES WHO SEES WHAT.
 */

function queryNotice(client: DbClient, id: string, isAdminView: boolean) {
  const query = client
    .from('notices')
    .select(isAdminView ? NOTICE_COLUMNS_WITH_AUDIENCES : NOTICE_COLUMNS)
    .eq('id', id)
    .maybeSingle()
    .overrideTypes<Notice | NoticeWithAudiences, { merge: false }>();
  return one<Notice | NoticeWithAudiences>('notices.get', query, NOTICE_ERRORS);
}

/**
 * A NOTICE IN ITS API SHAPE. ADMINS SEE ANY NOTICE WITH ITS AUDIENCES; OTHERS
 * ONLY PUBLISHED NOTICES ADDRESSED TO THEM (RLS), WITHOUT AUDIENCES — ANYTHING
 * ELSE IS A 404, SO GUESSING AN ID REVEALS NOTHING.
 */
export async function findNotice(client: DbClient, id: string, isAdminView: boolean): Promise<FunctionResult<ReturnType<typeof presentNotice>>> {
  try {
    return functionSuccess(presentNotice(await queryNotice(client, id, isAdminView)));
  } catch (error) {
    return functionFailure(error, 'notices.get');
  }
}

/** THE IDS OF `ids` THAT EXIST IN `table`. ONE QUERY; NONE WHEN THE LIST IS EMPTY. */
async function existingIds(client: DbClient, table: 'classes' | 'students', ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await many<{ id: string }>(`${table}.exist`, client.from(table).select('id').in('id', ids), NOTICE_ERRORS);
  return new Set(rows.map((row) => row.id));
}

/** THE AUDIENCE AS THE DATABASE FUNCTIONS EXPECT IT: ROLES BECOME DATABASE VALUES. */
function toAudienceRow(audience: AudienceInput): AudienceRow {
  if ('role' in audience) return { audienceRole: toDbRole(audience.role) };
  if ('classId' in audience) return { classId: audience.classId };
  return { studentId: audience.studentId };
}

/** CLASS AND STUDENT AUDIENCES MUST REFERENCE EXISTING RECORDS (422 ON THE EXACT ENTRY). */
export async function toAudienceRows(client: DbClient, audiences: AudienceInput[]): Promise<FunctionResult<AudienceRow[]>> {
  try {
    const [existingClassIds, existingStudentIds] = await Promise.all([
      existingIds(client, 'classes', audiences.flatMap((audience) => ('classId' in audience ? [audience.classId] : []))),
      existingIds(client, 'students', audiences.flatMap((audience) => ('studentId' in audience ? [audience.studentId] : []))),
    ]);
    const issues = audiences.flatMap((audience, index) => {
      if ('classId' in audience && !existingClassIds.has(audience.classId)) return [{ path: `audiences.${index}.classId`, message: 'Class not found.' }];
      if ('studentId' in audience && !existingStudentIds.has(audience.studentId)) return [{ path: `audiences.${index}.studentId`, message: 'Student not found.' }];
      return [];
    });
    if (issues.length > 0) throw validationError(issues);
    return functionSuccess(audiences.map(toAudienceRow));
  } catch (error) {
    return functionFailure(error, 'notices.audiences');
  }
}

/**
 * WHY A CONDITIONAL CHANGE MATCHED NOTHING: 404 IF THE NOTICE IS GONE (OR
 * HIDDEN), OTHERWISE THE STATE CONFLICT (409). AN OUTAGE STAYS A 503.
 */
export async function explainRefusedChange(client: DbClient, id: string, conflictMessage: string): Promise<FunctionResult<never>> {
  try {
    const current = await orNullIfMissing(queryNotice(client, id, false));
    if (!current) throw notFound('Notice not found.');
    throw conflict(conflictMessage);
  } catch (error) {
    return functionFailure(error, 'notices.explainRefusedChange');
  }
}
