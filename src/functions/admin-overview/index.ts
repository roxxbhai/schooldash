import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { countRecords, fetchAllPages } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { OverviewMetrics } from '@/types/admin-overview';
import type { ApiResult, QueryParams } from '@/types/api-client';
import type { Exam } from '@/types/exams';

interface OverviewScope {
  /** TODAY IN SCHOOL TIME, "YYYY-MM-DD". */
  today: string;
  /** ISO WEEKDAY, 1 = MONDAY. */
  dayOfWeek: number;
  currentAcademicYearId: string | null;
}

/** A COUNT, OR NULL IF THAT ONE REQUEST FAILED. */
async function count(path: string, query: QueryParams): Promise<number | null> {
  const result = await countRecords(path, query);
  return result.success ? result.data : null;
}

/**
 * THE DASHBOARD FIGURES: ABOUT A DOZEN SMALL COUNT REQUESTS IN PARALLEL, NO
 * LIST DOWNLOADS (THE CURRENT YEAR'S EXAMS ARE THE ONLY LIST, AND IT IS SHORT).
 * ONE FAILED COUNT SHOWS AS "—" WITHOUT HIDING THE OTHERS.
 */
export async function loadOverviewMetrics(scope: OverviewScope): Promise<ApiResult<OverviewMetrics>> {
  try {
    const day = { date: scope.today };
    const yearId = scope.currentAcademicYearId;

    const [
      activeStudents,
      activeTeachers,
      publishedNotices,
      draftNotices,
      studentsMarked,
      studentsPresent,
      studentsLate,
      studentsAbsent,
      studentsOnLeave,
      teachersMarked,
      teachersPresent,
      teachersAbsent,
      periodsToday,
      exams,
    ] = await Promise.all([
      count(API_PATHS.students, { isActive: true }),
      count(API_PATHS.teachers, { isActive: true }),
      count(API_PATHS.notices, { status: 'published' }),
      count(API_PATHS.notices, { status: 'draft' }),
      count(API_PATHS.studentAttendance, day),
      count(API_PATHS.studentAttendance, { ...day, status: 'present' }),
      count(API_PATHS.studentAttendance, { ...day, status: 'late' }),
      count(API_PATHS.studentAttendance, { ...day, status: 'absent' }),
      count(API_PATHS.studentAttendance, { ...day, status: 'leave' }),
      count(API_PATHS.teacherAttendance, day),
      count(API_PATHS.teacherAttendance, { ...day, status: 'present' }),
      count(API_PATHS.teacherAttendance, { ...day, status: 'absent' }),
      yearId ? count(API_PATHS.timetableEntries, { academicYearId: yearId, dayOfWeek: scope.dayOfWeek }) : Promise.resolve(null),
      yearId ? fetchAllPages<Exam>(API_PATHS.exams, { academicYearId: yearId }) : Promise.resolve(null),
    ]);

    return {
      success: true,
      message: 'Operation successful',
      data: {
        activeStudents,
        activeTeachers,
        publishedNotices,
        draftNotices,
        studentAttendance: { marked: studentsMarked, present: studentsPresent, late: studentsLate, absent: studentsAbsent, leave: studentsOnLeave },
        teacherAttendance: { marked: teachersMarked, present: teachersPresent, absent: teachersAbsent },
        periodsToday,
        exams: exams && exams.success ? exams.data : yearId ? null : [],
      },
    };
  } catch {
    return networkFailure();
  }
}
