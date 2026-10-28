import { z } from 'zod';
import type { DbErrorContext } from '@/types/supabase';

/** A CLASS IS PROMOTED IN ONE REQUEST; NO CLASS COMES CLOSE TO THIS MANY STUDENTS. */
export const MAX_PROMOTION_STUDENTS = 500;

/** THE LAST CLASS. ITS STUDENTS GRADUATE INSTEAD OF MOVING UP. */
export const FINAL_GRADE = '12';

/** THE "GRADUATE" CHOICE IN THE PROMOTE DIALOG'S TARGET LIST (A CLASS ID IS ALWAYS A UUID). */
export const GRADUATE_TARGET = 'graduate';

/** THE "CREATE THE NEXT CLASS" CHOICE, OFFERED TO ADMINS WHEN IT DOESN'T EXIST YET. */
export const NEW_CLASS_TARGET = 'new-class';

/** WHY A SELECTED STUDENT WASN'T MOVED, AS THE DATABASE REPORTS IT (MIGRATION 20). */
export const SKIP_REASONS = ['inactive', 'alreadyEnrolled', 'alreadyGraduated', 'enrolledLater'] as const;

export const SKIP_REASON_LABELS: Record<(typeof SKIP_REASONS)[number], string> = {
  inactive: 'inactive',
  alreadyEnrolled: 'already enrolled in that year',
  alreadyGraduated: 'already graduated',
  enrolledLater: 'already enrolled in a later year',
};

export const PROMOTION_ERRORS: DbErrorContext = {
  notFoundMessage: 'Class not found.',
  constraints: {
    promotionTargetClassExists: { message: 'Class not found.', field: 'targetClassId' },
    promotionTargetLaterYear: { message: 'Choose a class in a later academic year.', field: 'targetClassId' },
    promotionStudentsRequired: { message: 'Choose at least one student.' },
    promotionStudentsUnique: { message: 'Each student can be listed once.' },
    promotionStudentInClass: { message: 'Every student must be enrolled in this class. Reload the page and try again.' },
    studentEnrollmentsRollNumberPositive: { message: 'Roll numbers must be whole numbers from 1.' },
    studentEnrollmentsStudentYearKey: { message: 'A student was enrolled in that year at the same moment. Reload the page and try again.' },
    studentEnrollmentsClassRollKey: { message: 'A roll number was taken at the same moment. Reload the page and try again.' },
    graduationFinalClass: { message: `Only class ${FINAL_GRADE} can graduate.` },
    graduationDateRequired: { message: 'The graduation date is required.' },
  },
};

/** WHAT `classPromotionOptions` RETURNS: LATER CLASSES, WHERE THE CLASS'S STUDENTS ALREADY MOVED, AND TAKEN ROLL NUMBERS. */
export const PROMOTION_OPTIONS_SCHEMA = z.object({
  classes: z.array(z.object({ id: z.string(), academicYearId: z.string(), name: z.string(), section: z.string() })),
  moves: z.array(z.object({ studentId: z.string(), classId: z.string(), academicYearId: z.string() })),
  takenRollNumbers: z.array(z.object({ classId: z.string(), rollNumber: z.number().int() })),
});

const SKIPPED_SCHEMA = z.array(z.object({ studentId: z.string(), reason: z.enum(SKIP_REASONS), classId: z.string().optional() }));

/** WHAT `promoteStudents` RETURNS. ON A ROLL NUMBER CONFLICT NOTHING WAS WRITTEN. */
export const PROMOTION_RESULT_SCHEMA = z.discriminatedUnion('status', [
  z.object({ status: z.literal('promoted'), promoted: z.array(z.object({ studentId: z.string(), enrollmentId: z.string() })), skipped: SKIPPED_SCHEMA }),
  z.object({ status: z.literal('rollConflicts'), conflicts: z.array(z.object({ studentId: z.string(), rollNumber: z.number().int() })) }),
]);

/** WHAT `graduateStudents` RETURNS. */
export const GRADUATION_RESULT_SCHEMA = z.object({ status: z.literal('graduated'), graduated: z.array(z.string()), skipped: SKIPPED_SCHEMA });
