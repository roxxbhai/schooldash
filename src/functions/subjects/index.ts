import 'server-only';
import { SUBJECT_COLUMNS, SUBJECT_ERRORS } from '@/constants/subjects';
import { one } from '@/helpers/db-query';
import { functionFailure, functionSuccess } from '@/helpers/function-result';
import type { Subject } from '@/types/subjects';
import type { FunctionResult } from '@/types/function-result';
import type { DbClient } from '@/types/supabase';

/** ONE ROW BY ID, AS THE CALLER MAY SEE IT (RLS); 404 IF IT DOESN'T EXIST OR IS HIDDEN. */
export async function findSubject(client: DbClient, id: string): Promise<FunctionResult<Subject>> {
  try {
    const row = await one<Subject>('subjects.get', client.from('subjects').select(SUBJECT_COLUMNS).eq('id', id).maybeSingle(), SUBJECT_ERRORS);
    return functionSuccess(row);
  } catch (error) {
    return functionFailure(error, 'subjects.get');
  }
}
