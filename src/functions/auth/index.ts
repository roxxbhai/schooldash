import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { apiRequest } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { AccountSetupInput, AccountSetupOutcome } from '@/types/account-setup';
import type { ApiResult } from '@/types/api-client';
import type { PasswordCredentials, SessionProfile, StudentCredentials, TeacherCredentials } from '@/types/auth';

/**
 * BROWSER-SIDE AUTHENTICATION, ONE CALL PER ROLE'S SIGN-IN. THE SESSION LIVES
 * ONLY IN THE HTTP-ONLY SUPABASE COOKIES SET BY THE SERVER; NOTHING IS STORED
 * IN THE BROWSER BY THIS CODE.
 */

export async function signInAdmin(credentials: PasswordCredentials): Promise<ApiResult<SessionProfile>> {
  try {
    return await apiRequest<SessionProfile>(API_PATHS.auth.adminLogin, { method: 'POST', body: credentials, isSessionRequired: false });
  } catch {
    return networkFailure();
  }
}

/** A NEW ADMINISTRATOR CHOOSES THEIR PASSWORD WITH THE SETUP CODE ANOTHER ADMIN GAVE THEM. */
export async function completeAdminAccountSetup(input: AccountSetupInput): Promise<ApiResult<AccountSetupOutcome>> {
  try {
    return await apiRequest<AccountSetupOutcome>(API_PATHS.auth.adminSetup, { method: 'POST', body: input, isSessionRequired: false });
  } catch {
    return networkFailure();
  }
}

export async function signInTeacher(credentials: TeacherCredentials): Promise<ApiResult<SessionProfile>> {
  try {
    return await apiRequest<SessionProfile>(API_PATHS.auth.teacherLogin, { method: 'POST', body: credentials, isSessionRequired: false });
  } catch {
    return networkFailure();
  }
}

/** A TEACHER'S ONE-TIME SIGN-UP WITH THE PHONE NUMBER THE SCHOOL REGISTERED. */
export async function signUpTeacher(credentials: TeacherCredentials): Promise<ApiResult<AccountSetupOutcome>> {
  try {
    return await apiRequest<AccountSetupOutcome>(API_PATHS.auth.teacherSignUp, { method: 'POST', body: credentials, isSessionRequired: false });
  } catch {
    return networkFailure();
  }
}

export async function signInStudent(credentials: StudentCredentials): Promise<ApiResult<SessionProfile>> {
  try {
    return await apiRequest<SessionProfile>(API_PATHS.auth.studentLogin, { method: 'POST', body: credentials, isSessionRequired: false });
  } catch {
    return networkFailure();
  }
}

export async function signOut(): Promise<ApiResult<{ signedOut: boolean }>> {
  try {
    return await apiRequest<{ signedOut: boolean }>(API_PATHS.auth.logout, { method: 'POST', isSessionRequired: false });
  } catch {
    return networkFailure();
  }
}
