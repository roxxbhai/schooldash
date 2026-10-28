import type { AppRole } from '@/types/auth';
import type { Notice } from '@/types/notices';

export type NoticeStatus = Notice['status'];

/** A STUDENT A NOTICE IS ADDRESSED TO, NAMED SO ADMINS CAN READ WHO IT IS. */
export interface AudienceStudent {
  id: string;
  fullName: string | null;
  admissionNumber: string;
}

/** ONE AUDIENCE AS THE API RETURNS IT TO ADMINS: EXACTLY ONE OF `role`, `classId` AND `studentId` IS SET. */
export interface NoticeAudienceView {
  id: string;
  role: AppRole | null;
  classId: string | null;
  studentId: string | null;
  /** SET FOR A STUDENT AUDIENCE. */
  student: { fullName: string | null; admissionNumber: string } | null;
}

/** A NOTICE AS ADMINS SEE IT: WITH ITS AUDIENCES. */
export type AdminNotice = Notice & { audiences: NoticeAudienceView[] };

/** THE AUDIENCES CHOSEN IN THE PICKER. STUDENTS KEEP THEIR NAMES SO THE PICKER CAN LIST THEM. */
export interface AudienceSelection {
  roles: AppRole[];
  classIds: string[];
  students: AudienceStudent[];
}
