import { marksSchema, optionalText } from '@/helpers/school-validation';
import type { DbErrorContext } from '@/types/supabase';

export const RESULT_COLUMNS = 'id, examSubjectId, studentId, classId, marksObtained, remarks, enteredByUserId, createdAt, updatedAt';

export const MAX_BULK_RESULTS = 200;

export const RESULT_ERRORS: DbErrorContext = {
  notFoundMessage: 'Result not found.',
  constraints: {
    resultsExamSubjectStudentKey: { message: 'Marks for this student and exam subject already exist.' },
    resultsEnrollmentFkey: { message: "The student is not enrolled in the exam subject's class.", field: 'studentId' },
    resultsExamSubjectFkey: { message: 'Exam subject not found.', field: 'examSubjectId' },
    resultsMarksNonNegative: { message: 'marksObtained must not be negative.', field: 'marksObtained' },
    resultsStudentActive: { message: "The student's account is deactivated.", field: 'studentId' },
  },
};

/** THE FIELDS OF ONE MARK, IN SINGLE AND BULK ENTRY. 0 IS A REAL MARK. */
export const MARK_FIELDS = { marksObtained: marksSchema, remarks: optionalText(500) };
