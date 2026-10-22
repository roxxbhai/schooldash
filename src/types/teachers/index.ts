import type { Tables } from '@/types/database';

export type Teacher = Pick<
  Tables<'teachers'>,
  'id' | 'userId' | 'employeeCode' | 'qualification' | 'dateOfJoining' | 'createdAt' | 'updatedAt'
> & { user: Pick<Tables<'users'>, 'fullName' | 'email' | 'phone' | 'isActive' | 'passwordSetAt'> };

/** A TEACHER'S ID AND ACCOUNT STATUS. */
export interface TeacherStatus {
  id: string;
  user: { isActive: boolean } | null;
}
