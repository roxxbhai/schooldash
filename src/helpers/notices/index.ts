import 'server-only';
import { toAppRole } from '@/helpers/roles';
import type { Notice, NoticeWithAudiences } from '@/types/notices';

/**
 * THE API SHAPE OF A NOTICE. AUDIENCES (ADMIN VIEWS ONLY) USE UPPERCASE ROLES
 * LIKE THE REST OF THE API, IN A STABLE ORDER.
 */
export function presentNotice(notice: Notice | NoticeWithAudiences) {
  if (!('audiences' in notice)) return notice;
  const audiences = notice.audiences
    .map((audience) => ({ id: audience.id, role: audience.audienceRole ? toAppRole(audience.audienceRole) : null, classId: audience.classId }))
    .sort((a, b) => `${a.role ?? ''}${a.classId ?? ''}`.localeCompare(`${b.role ?? ''}${b.classId ?? ''}`));
  return { ...notice, audiences };
}
