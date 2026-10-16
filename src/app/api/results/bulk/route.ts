import { z } from 'zod';
import { MARK_FIELDS, MAX_BULK_RESULTS, RESULT_COLUMNS, RESULT_ERRORS } from '@/constants/results';
import { requireRole } from '@/functions/authorization';
import { findPaperForWrite, validateMarks } from '@/functions/results';
import { apiRoute, created } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { many } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { parseJsonBody, uuidSchema } from '@/helpers/request-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import type { Result } from '@/types/results';

const bulkResultsSchema = z
  .strictObject({
    examSubjectId: uuidSchema,
    records: z.array(z.strictObject({ studentId: uuidSchema, ...MARK_FIELDS })).min(1).max(MAX_BULK_RESULTS),
  })
  .superRefine((submission, ctx) => {
    const seenStudentIds = new Set<string>();
    submission.records.forEach((record, index) => {
      if (seenStudentIds.has(record.studentId)) {
        ctx.addIssue({ code: 'custom', path: ['records', index, 'studentId'], message: 'Duplicate student in this submission.' });
      }
      seenStudentIds.add(record.studentId);
    });
  });

/**
 * ADMINS, OR THE PAPER'S SUBJECT TEACHER. { examSubjectId, RECORDS: [{ studentId, marksObtained, REMARKS? }] }
 * (MAX 200). ALL-OR-NOTHING: EVERY INVALID RECORD IS NAMED BY INDEX, AND THE
 * MARKS ARE WRITTEN IN ONE INSERT STATEMENT, SO EITHER ALL ARE SAVED OR NONE.
 */
export const POST = apiRoute(async (request: Request) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  const actor = unwrapResult(await requireRole(supabase, ['ADMIN', 'TEACHER']));
  const { examSubjectId, records } = await parseJsonBody(request, bulkResultsSchema);
  const paper = unwrapResult(await findPaperForWrite(supabase, examSubjectId, actor));
  unwrapResult(await validateMarks(supabase, paper, records, true));

  const rows = records.map((record) => ({ ...record, examSubjectId: paper.id, classId: paper.classId, enteredByUserId: actor.id }));
  const items = await many<Result>('results.insert', supabase.from('results').insert(rows).select(RESULT_COLUMNS), RESULT_ERRORS);
  return created({ items, count: items.length });
});
