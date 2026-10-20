import { StatusBadge } from '@/components/status-badge';

/** WHETHER A TEACHER OR STUDENT ACCOUNT CAN SIGN IN. */
export function AccountStatusBadge({ isActive }: { isActive: boolean }) {
  return <StatusBadge tone={isActive ? 'success' : 'neutral'}>{isActive ? 'Active' : 'Inactive'}</StatusBadge>;
}
