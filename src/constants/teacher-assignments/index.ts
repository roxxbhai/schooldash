import type { DbErrorContext } from '@/types/supabase';

export const ASSIGNMENT_COLUMNS = 'id, teacherId, classId, subjectId, createdAt, updatedAt';

export const ASSIGNMENT_ERRORS: DbErrorContext = {
  notFoundMessage: 'Teacher assignment not found.',
  constraints: {
    teacherAssignmentsKey: { message: 'This teacher is already assigned to that class and subject.' },
    teacherAssignments_teacherId_fkey: { message: 'Teacher not found.', field: 'teacherId' },
    teacherAssignments_classId_fkey: { message: 'Class not found.', field: 'classId' },
    teacherAssignments_subjectId_fkey: { message: 'Subject not found.', field: 'subjectId' },
    timetableEntriesAssignmentFkey: { message: 'This assignment is used by timetable entries and cannot be removed.' },
  },
};
