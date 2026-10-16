import 'server-only';
import { CLASS_COLUMNS, CLASS_ERRORS } from '@/constants/classes';
import { one } from '@/helpers/db-query';
import { functionFailure, functionSuccess } from '@/helpers/function-result';
import type { SchoolClass } from '@/types/classes';
import type { FunctionResult } from '@/types/function-result';
import type { DbClient } from '@/types/supabase';

/** ONE ROW BY ID, AS THE CALLER MAY SEE IT (RLS); 404 IF IT DOESN'T EXIST OR IS HIDDEN. */
export async function findClass(client: DbClient, id: string): Promise<FunctionResult<SchoolClass>> {
  try {
    const row = await one<SchoolClass>('classes.get', client.from('classes').select(CLASS_COLUMNS).eq('id', id).maybeSingle(), CLASS_ERRORS);
    return functionSuccess(row);
  } catch (error) {
    return functionFailure(error, 'classes.get');
  }
}
