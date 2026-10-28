import { z } from 'zod';
import { uuidSchema } from '@/helpers/request-validation';
import type { DbErrorContext } from '@/types/supabase';

export const NOTICE_COLUMNS = 'id, title, body, category, status, publishedAt, createdByUserId, createdAt, updatedAt';
// A STUDENT AUDIENCE CARRIES THE STUDENT'S NAME AND ADMISSION NUMBER, SO ADMINS CAN READ WHO IT IS.
export const NOTICE_COLUMNS_WITH_AUDIENCES =
  `${NOTICE_COLUMNS}, audiences:noticeAudiences(id, audienceRole, classId, studentId, ` +
  'student:students!noticeAudiences_studentId_fkey(admissionNumber, user:users!studentsUserFkey(fullName)))';

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
    noticeAudiencesNoticeStudentKey: { message: 'The same audience is listed twice.' },
    noticeAudiences_classId_fkey: { message: 'Class not found.', field: 'audiences' },
    noticeAudiences_studentId_fkey: { message: 'Student not found.', field: 'audiences' },
    noticeAudiencesExactlyOneTarget: { message: 'Each audience must be exactly one of a role, a class or a student.', field: 'audiences' },
  },
};

export const NOTICE_TITLE_SCHEMA = z.string().trim().min(1).max(200);
export const NOTICE_BODY_SCHEMA = z.string().trim().min(1).max(10_000);

/** ROLES A NOTICE CAN BE ADDRESSED TO. NOT ADMINS: THEY ALREADY SEE EVERY NOTICE. */
export const NOTICE_AUDIENCE_ROLES = ['STUDENT', 'TEACHER'] as const;

/** A ROLE (`{ role: 'STUDENT' }`), A CLASS (`{ classId }`) OR ONE STUDENT (`{ studentId }`; MIGRATION 19), NEVER MORE THAN ONE. */
export const AUDIENCE_SCHEMA = z.union([
  z.strictObject({ role: z.enum(NOTICE_AUDIENCE_ROLES) }),
  z.strictObject({ classId: uuidSchema }),
  z.strictObject({ studentId: uuidSchema }),
]);

/** THE KEY THAT MAKES AN AUDIENCE UNIQUE WITHIN A NOTICE. */
function audienceKey(audience: z.output<typeof AUDIENCE_SCHEMA>): string {
  if ('role' in audience) return `role:${audience.role}`;
  if ('classId' in audience) return `class:${audience.classId}`;
  return `student:${audience.studentId}`;
}

/** UP TO 50 AUDIENCES, NO DUPLICATES (OVERLAPPING ONES, E.G. STUDENT + ONE CLASS, ARE ALLOWED). */
export const AUDIENCES_SCHEMA = z
  .array(AUDIENCE_SCHEMA)
  .max(MAX_AUDIENCES)
  .superRefine((audiences, ctx) => {
    const seenKeys = new Set<string>();
    audiences.forEach((audience, index) => {
      const key = audienceKey(audience);
      if (seenKeys.has(key)) ctx.addIssue({ code: 'custom', path: [index], message: 'Duplicate audience.' });
      seenKeys.add(key);
    });
  });
