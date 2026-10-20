import type { AppRole } from '@/types/auth';
import type { Notice } from '@/types/notices';

export type NoticeStatus = Notice['status'];

/** ONE AUDIENCE AS THE API RETURNS IT TO ADMINS: EXACTLY ONE OF `role` AND `classId` IS SET. */
export interface NoticeAudienceView {
  id: string;
  role: AppRole | null;
  classId: string | null;
}

/** A NOTICE AS ADMINS SEE IT: WITH ITS AUDIENCES. */
export type AdminNotice = Notice & { audiences: NoticeAudienceView[] };

/** THE AUDIENCES CHOSEN IN THE PICKER. */
export interface AudienceSelection {
  roles: AppRole[];
  classIds: string[];
}
