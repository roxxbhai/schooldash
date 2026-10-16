import 'server-only';
import { ACADEMIC_YEAR_COLUMNS, ACADEMIC_YEAR_ERRORS } from '@/constants/academic-years';
import { one } from '@/helpers/db-query';
import { functionFailure, functionSuccess } from '@/helpers/function-result';
import type { AcademicYear } from '@/types/academic-years';
import type { FunctionResult } from '@/types/function-result';
import type { DbClient } from '@/types/supabase';

/** ONE ROW BY ID, AS THE CALLER MAY SEE IT (RLS); 404 IF IT DOESN'T EXIST OR IS HIDDEN. */
export async function findAcademicYear(client: DbClient, id: string): Promise<FunctionResult<AcademicYear>> {
  try {
    const row = await one<AcademicYear>('academicYears.get', client.from('academicYears').select(ACADEMIC_YEAR_COLUMNS).eq('id', id).maybeSingle(), ACADEMIC_YEAR_ERRORS);
    return functionSuccess(row);
  } catch (error) {
    return functionFailure(error, 'academicYears.get');
  }
}
