import { z } from 'zod';
import { CLASS_COLUMNS, CLASS_ERRORS, CLASS_NAME_SCHEMA, CLASS_SECTION_SCHEMA } from '@/constants/classes';
import { requireAdmin, requireAuthenticatedUser } from '@/functions/authorization';
import { requireActiveTeacher } from '@/functions/teachers';
import { findClass } from '@/functions/classes';
import { apiRoute, ok } from '@/helpers/api-response';
import { assertSameOrigin } from '@/helpers/csrf';
import { one } from '@/helpers/db-query';
import { unwrapResult } from '@/helpers/function-result';
import { idParamsSchema, parseJsonBody, parseParams, uuidSchema } from '@/helpers/request-validation';
import { optionalText, requireChanges } from '@/helpers/school-validation';
import { createSupabaseServerClient } from '@/helpers/supabase-server';
import type { SchoolClass } from '@/types/classes';

type Context = RouteContext<'/api/classes/[id]'>;

/** academicYearId IS DELIBERATELY ABSENT: A CLASS NEVER MOVES TO ANOTHER YEAR. */
const updateClassSchema = z.strictObject({
  name: CLASS_NAME_SCHEMA.optional(),
  section: CLASS_SECTION_SCHEMA.optional(),
  classTeacherId: uuidSchema.nullable().optional(),
  roomNumber: optionalText(20),
});

/** VISIBLE PER RLS (ADMIN / TEACHER OF THE CLASS / ENROLLED STUDENT); OTHERWISE 404. */
export const GET = apiRoute(async (_request: Request, context: Context) => {
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAuthenticatedUser(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);
  return ok(unwrapResult(await findClass(supabase, id)));
});

/** ADMIN ONLY. NAME, SECTION, classTeacherId, roomNumber. */
export const PATCH = apiRoute(async (request: Request, context: Context) => {
  assertSameOrigin(request);
  const supabase = await createSupabaseServerClient();
  unwrapResult(await requireAdmin(supabase));
  const { id } = await parseParams(context.params, idParamsSchema);
  const changes = requireChanges(await parseJsonBody(request, updateClassSchema));
  unwrapResult(await requireActiveTeacher(supabase, changes.classTeacherId, 'classTeacherId'));
  const query = supabase.from('classes').update(changes).eq('id', id).select(CLASS_COLUMNS).maybeSingle();
  return ok(await one<SchoolClass>('classes.update', query, CLASS_ERRORS));
});
