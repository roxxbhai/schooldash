import { marksSchema } from '@/helpers/school-validation';
import type { DbErrorContext } from '@/types/supabase';

export const EXAM_SUBJECT_COLUMNS = 'id, examId, classId, academicYearId, subjectId, examDate, maxMarks, passMarks, createdAt, updatedAt';

export const EXAM_SUBJECT_ERRORS: DbErrorContext = {
  notFoundMessage: 'Exam subject not found.',
  constraints: {
    examSubjectsKey: { message: 'This subject is already configured for that exam and class.' },
    examSubjectsExamFkey: { message: 'Exam not found.', field: 'examId' },
    examSubjectsClassFkey: { message: "The class is not in the exam's academic year.", field: 'classId' },
    examSubjects_subjectId_fkey: { message: 'Subject not found.', field: 'subjectId' },
    examSubjectsMaxMarksPositive: { message: 'maxMarks must be greater than 0.', field: 'maxMarks' },
    examSubjectsPassMarksInRange: { message: 'passMarks must be between 0 and maxMarks.', field: 'passMarks' },
  },
};

export const MAX_MARKS_SCHEMA = marksSchema.refine((value) => value > 0, 'maxMarks must be greater than 0.');
export const PASS_MARKS_SCHEMA = marksSchema.nullable().optional();
