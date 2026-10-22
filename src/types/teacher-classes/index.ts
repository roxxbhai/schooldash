import type { TeacherAssignment } from '@/types/teacher-assignments';

/** THE TEACHER'S ASSIGNMENTS AND, PER CLASS, HOW MANY STUDENTS ARE ENROLLED (NULL IF THAT COUNT FAILED). */
export interface TeacherClassesData {
  assignments: TeacherAssignment[];
  studentCounts: Record<string, number | null>;
}
