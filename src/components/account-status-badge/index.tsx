import { StatusBadge } from '@/components/status-badge';

/** WHETHER A TEACHER OR STUDENT ACCOUNT CAN SIGN IN. A STUDENT WHO GRADUATED (AND WAS DEACTIVATED) READS "GRADUATED". */
export function AccountStatusBadge({ isActive, graduatedOn = null }: { isActive: boolean; graduatedOn?: string | null }) {
  if (!isActive && graduatedOn) return <StatusBadge tone='brand'>Graduated</StatusBadge>;
  return <StatusBadge tone={isActive ? 'success' : 'neutral'}>{isActive ? 'Active' : 'Inactive'}</StatusBadge>;
}
