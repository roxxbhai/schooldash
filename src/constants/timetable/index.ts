import { z } from 'zod';
import type { DbErrorContext } from '@/types/supabase';

export const TIMETABLE_COLUMNS = 'id, academicYearId, classId, subjectId, teacherId, dayOfWeek, startTime, endTime, room, createdAt, updatedAt';

export const TIMETABLE_ERRORS: DbErrorContext = {
  notFoundMessage: 'Timetable entry not found.',
  constraints: {
    timetableEntriesClassNoOverlap: { message: 'The class already has a period that overlaps this time.' },
    timetableEntriesClassSlotKey: { message: 'The class already has a period that overlaps this time.' },
    timetableEntriesTeacherNoOverlap: { message: 'The teacher already has a period that overlaps this time.' },
    timetableEntriesAssignmentFkey: { message: 'The teacher is not assigned to teach this subject in this class.', field: 'teacherId' },
    timetableEntries_classId_fkey: { message: 'Class not found.', field: 'classId' },
    timetableEntries_subjectId_fkey: { message: 'Subject not found.', field: 'subjectId' },
    timetableEntries_teacherId_fkey: { message: 'Teacher not found.', field: 'teacherId' },
    timetableEntriesTimeRange: { message: 'endTime must be after startTime.', field: 'endTime' },
    timetableEntriesDayOfWeekRange: { message: 'dayOfWeek must be between 1 and 7.', field: 'dayOfWeek' },
  },
};

/** "HH:MM" OR "HH:MM:SS", 24-HOUR, SCHOOL-LOCAL WALL-CLOCK TIME; NORMALISED TO "HH:MM:SS". */
export const TIME_SCHEMA = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Use 24-hour "HH:MM" or "HH:MM:SS".')
  .transform((value) => (value.length === 5 ? `${value}:00` : value));

/** ISO 8601: 1 = MONDAY … 7 = SUNDAY. */
export const DAY_OF_WEEK_SCHEMA = z.number().int().min(1).max(7);
