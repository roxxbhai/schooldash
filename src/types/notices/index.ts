import type { z } from 'zod';
import type { AUDIENCE_SCHEMA } from '@/constants/notices';
import type { Enums, Tables } from '@/types/database';

export type Notice = Tables<'notices'>;
type NoticeAudience = Tables<'noticeAudiences'>;
export type NoticeWithAudiences = Notice & { audiences: Pick<NoticeAudience, 'id' | 'audienceRole' | 'classId'>[] };

/** AN AUDIENCE AS THE NOTICE DATABASE FUNCTIONS EXPECT IT. */
export type AudienceRow = { audienceRole: Enums<'userRole'> } | { classId: string };

/** AN AUDIENCE AS THE API ACCEPTS IT. */
export type AudienceInput = z.output<typeof AUDIENCE_SCHEMA>;
