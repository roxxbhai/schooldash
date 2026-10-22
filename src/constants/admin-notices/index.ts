import { z } from 'zod';
import type { StatusTone } from '@/components/status-badge';
import type { AudienceSelection, NoticeStatus } from '@/types/admin-notices';
import type { AppRole } from '@/types/auth';

/** THE API ACCEPTS AT MOST 50 AUDIENCES PER NOTICE. */
export const MAX_NOTICE_AUDIENCES = 50;

/** "ALL" IN THE STATUS TABS; ANY OTHER VALUE IS A NOTICE STATUS. */
export const ALL_STATUSES = 'all';

export const NOTICE_STATUS_TABS: readonly { value: NoticeStatus | typeof ALL_STATUSES; label: string }[] = [
  { value: ALL_STATUSES, label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];

export const NOTICE_STATUS_META: Record<NoticeStatus, { label: string; tone: StatusTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  published: { label: 'Published', tone: 'success' },
  archived: { label: 'Archived', tone: 'warning' },
};

/** THE ROLES A NOTICE CAN BE ADDRESSED TO (EVERY ROLE THE API ACCEPTS). ADMINS ALREADY SEE EVERY NOTICE. */
export const AUDIENCE_ROLES: readonly { role: AppRole; label: string; description: string }[] = [
  { role: 'STUDENT', label: 'All students', description: 'Every active student account.' },
  { role: 'TEACHER', label: 'All teachers', description: 'Every active teacher account.' },
];

/** "ALL" IN THE CLASS AND SECTION FILTERS OF THE AUDIENCE PICKER. */
export const ALL_CLASS_FILTER = 'all';

export const NOTICE_CONTENT_SCHEMA = z.object({
  title: z.string().trim().min(1, { error: 'Enter a title.' }).max(200, { error: 'Use at most 200 characters.' }),
  body: z.string().trim().min(1, { error: 'Write the notice.' }).max(10_000, { error: 'Use at most 10,000 characters.' }),
  category: z.string().trim().max(50, { error: 'Use at most 50 characters.' }),
});

export const AUDIENCE_SELECTION_SCHEMA = z
  .object({ roles: z.array(z.string()), classIds: z.array(z.string()) })
  .refine((selection) => selection.roles.length + selection.classIds.length <= MAX_NOTICE_AUDIENCES, {
    path: ['audiences'],
    error: `Choose at most ${MAX_NOTICE_AUDIENCES} audiences.`,
  });

export type NoticeContentForm = z.input<typeof NOTICE_CONTENT_SCHEMA>;

export interface NewNoticeForm extends NoticeContentForm {
  audiences: AudienceSelection;
}

export const EMPTY_AUDIENCE_SELECTION: AudienceSelection = { roles: [], classIds: [] };

export const EMPTY_NOTICE_CONTENT: NoticeContentForm = { title: '', body: '', category: '' };

export const EMPTY_NOTICE_FORM: NewNoticeForm = { ...EMPTY_NOTICE_CONTENT, audiences: EMPTY_AUDIENCE_SELECTION };
