import 'server-only';
import { EXAM_COLUMNS, EXAM_ERRORS } from '@/constants/exams';
import { one } from '@/helpers/db-query';
import { functionFailure, functionSuccess } from '@/helpers/function-result';
import type { Exam } from '@/types/exams';
import type { FunctionResult } from '@/types/function-result';
import type { DbClient } from '@/types/supabase';

/** ONE EXAM; 404 IF IT DOESN'T EXIST. */
export async function findExam(client: DbClient, id: string): Promise<FunctionResult<Exam>> {
  try {
    const query = client.from('exams').select(EXAM_COLUMNS).eq('id', id).maybeSingle();
    return functionSuccess(await one<Exam>('exams.get', query, EXAM_ERRORS));
  } catch (error) {
    return functionFailure(error, 'exams.get');
  }
}
