import { z } from 'zod';
import { APP_ROLES } from '@/constants/auth';
import { uuidSchema } from '@/helpers/request-validation';
import type { DbErrorContext } from '@/types/supabase';

export const NOTICE_COLUMNS = 'id, title, body, category, status, publishedAt, createdByUserId, createdAt, updatedAt';
export const NOTICE_COLUMNS_WITH_AUDIENCES = `${NOTICE_COLUMNS}, audiences:noticeAudiences(id, audienceRole, classId)`;

const MAX_AUDIENCES = 50;

export const NOTICE_ERRORS: DbErrorContext = {
  notFoundMessage: 'Notice not found.',
  constraints: {
    noticesTitleNotBlank: { message: 'title must not be blank.', field: 'title' },
    noticesStatusTransition: { message: 'The notice is not in a state that allows this change.' },
    noticesPublishRequiresAudience: { message: 'Add at least one audience before publishing.' },
    noticesContentLocked: { message: 'Only draft notices can be edited.' },
    noticesPublishedAtLocked: { message: 'publishedAt is set only when publishing.' },
    noticeAudiencesNoticeNotDraft: { message: 'Audiences can change only while the notice is a draft.' },
    noticeAudiencesNoticeRoleKey: { message: 'The same audience is listed twice.' },
    noticeAudiencesNoticeClassKey: { message: 'The same audience is listed twice.' },
    noticeAudiences_classId_fkey: { message: 'Class not found.', field: 'audiences' },
    noticeAudiencesExactlyOneTarget: { message: 'Each audience must be either a role or a class.', field: 'audiences' },
  },
};

export const NOTICE_TITLE_SCHEMA = z.string().trim().min(1).max(200);
export const NOTICE_BODY_SCHEMA = z.string().trim().min(1).max(10_000);

/** A ROLE (`{ role: 'STUDENT' }`) OR A CLASS (`{ classId }`), NEVER BOTH. */
export const AUDIENCE_SCHEMA = z.union([z.strictObject({ role: z.enum(APP_ROLES) }), z.strictObject({ classId: uuidSchema })]);

/** UP TO 50 AUDIENCES, NO DUPLICATES (OVERLAPPING ONES, E.G. STUDENT + ONE CLASS, ARE ALLOWED). */
export const AUDIENCES_SCHEMA = z
  .array(AUDIENCE_SCHEMA)
  .max(MAX_AUDIENCES)
  .superRefine((audiences, ctx) => {
    const seenKeys = new Set<string>();
    audiences.forEach((audience, index) => {
      const key = 'role' in audience ? `role:${audience.role}` : `class:${audience.classId}`;
      if (seenKeys.has(key)) ctx.addIssue({ code: 'custom', path: [index], message: 'Duplicate audience.' });
      seenKeys.add(key);
    });
  });
