import 'client-only';
import { PEOPLE_RESULT_LIMIT } from '@/constants/command-palette';
import { API_PATHS } from '@/constants/api-client';
import { apiRequest } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { PaginatedList } from '@/types/api';
import type { ApiResult } from '@/types/api-client';
import type { PeopleMatches } from '@/types/command-palette';
import type { Student } from '@/types/students';
import type { Teacher } from '@/types/teachers';

/** THE FIRST FEW STUDENTS AND TEACHERS MATCHING `search` (NAME, ADMISSION NUMBER, EMAIL OR PHONE). */
export async function searchPeople(search: string, signal: AbortSignal): Promise<ApiResult<PeopleMatches>> {
  try {
    const query = { search, page: 1, limit: PEOPLE_RESULT_LIMIT };
    const [students, teachers] = await Promise.all([
      apiRequest<PaginatedList<Student>>(API_PATHS.students, { query, signal }),
      apiRequest<PaginatedList<Teacher>>(API_PATHS.teachers, { query, signal }),
    ]);
    if (!students.success) return students;
    if (!teachers.success) return teachers;
    return { success: true, message: 'Operation successful', data: { students: students.data.items, teachers: teachers.data.items } };
  } catch {
    return networkFailure();
  }
}
