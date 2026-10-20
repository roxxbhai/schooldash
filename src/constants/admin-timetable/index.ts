import { z } from 'zod';

/** THE TWO WAYS TO LOOK AT THE WEEK. */
export const TIMETABLE_VIEWS = { byClass: 'class', byTeacher: 'teacher' } as const;

export type TimetableView = (typeof TIMETABLE_VIEWS)[keyof typeof TIMETABLE_VIEWS];

/** MONDAY TO SATURDAY ARE ALWAYS SHOWN; SUNDAY ONLY WHEN A PERIOD FALLS ON IT. */
export const SUNDAY = 7;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const TIMETABLE_FORM_SCHEMA = z
  .object({
    classId: z.string().min(1, { error: 'Choose the class.' }),
    dayOfWeek: z
      .string()
      .min(1, { error: 'Choose the day.' })
      .transform((value) => Number(value)),
    startTime: z.string().regex(TIME_PATTERN, { error: 'Enter the start time.' }),
    endTime: z.string().regex(TIME_PATTERN, { error: 'Enter the end time.' }),
    subjectId: z.string().min(1, { error: 'Choose the subject.' }),
    teacherId: z.string().nullable(),
    room: z
      .string()
      .trim()
      .max(50, { error: 'Use at most 50 characters.' })
      .transform((value) => (value === '' ? null : value)),
  })
  .refine((period) => !TIME_PATTERN.test(period.startTime) || !TIME_PATTERN.test(period.endTime) || period.endTime > period.startTime, {
    path: ['endTime'],
    error: 'The period must end after it starts.',
  });

export type TimetableForm = z.input<typeof TIMETABLE_FORM_SCHEMA>;
export type TimetableValues = z.output<typeof TIMETABLE_FORM_SCHEMA>;

export const EMPTY_TIMETABLE_FORM: TimetableForm = {
  classId: '',
  dayOfWeek: '1',
  startTime: '',
  endTime: '',
  subjectId: '',
  teacherId: null,
  room: '',
};
