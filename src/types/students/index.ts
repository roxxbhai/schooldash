import type { Tables } from '@/types/database';

export type Student = Omit<Tables<'students'>, 'role'> & {
  user: Pick<Tables<'users'>, 'fullName' | 'email' | 'phone' | 'isActive'>;
};

/** A STUDENT'S ID AND ACCOUNT STATUS. */
export interface StudentStatus {
  id: string;
  user: { isActive: boolean } | null;
}
