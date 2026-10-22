/** POST /api/users/{id}/reset-sign-up. */
export interface TeacherSignUpReset {
  userId: string;
  revokedSessions: number;
}
