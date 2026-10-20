import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { apiRequest, createRecord, runRecordAction, updateRecord } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import { toAudienceInputs } from '@/helpers/admin-notices';
import type { NewNoticeForm, NoticeContentForm } from '@/constants/admin-notices';
import type { AdminNotice, AudienceSelection } from '@/types/admin-notices';
import type { ApiResult } from '@/types/api-client';

/** ONE NOTICE, OR `null` WHEN IT DOESN'T EXIST (A 404, OR AN ID THAT ISN'T A VALID ID AT ALL). */
export async function loadNotice(id: string, signal?: AbortSignal): Promise<ApiResult<AdminNotice | null>> {
  try {
    const result = await apiRequest<AdminNotice>(`${API_PATHS.notices}/${encodeURIComponent(id)}`, { signal });
    // A MALFORMED ID IS REJECTED AS A 400 VALIDATION ERROR ON THE PATH; FOR A PERSON IT MEANS THE SAME AS NOT FOUND.
    const isMissing = !result.success && (result.data.code === 'NOT_FOUND' || (result.data.status === 400 && result.data.code === 'VALIDATION_ERROR'));
    if (isMissing) {
      return { success: true, message: 'Operation successful', data: null };
    }
    return result;
  } catch {
    return networkFailure();
  }
}

/** CREATES A DRAFT WITH ITS AUDIENCES IN ONE REQUEST. AN EMPTY CATEGORY IS LEFT OUT. */
export async function createNotice(form: NewNoticeForm): Promise<ApiResult<AdminNotice>> {
  try {
    const { title, body, category, audiences } = form;
    return await createRecord<AdminNotice>(API_PATHS.notices, {
      title,
      body,
      ...(category ? { category } : {}),
      audiences: toAudienceInputs(audiences),
    });
  } catch {
    return networkFailure();
  }
}

/** DRAFTS ONLY. AN EMPTY CATEGORY CLEARS IT. */
export async function updateNoticeContent(id: string, form: NoticeContentForm): Promise<ApiResult<AdminNotice>> {
  try {
    const { title, body, category } = form;
    return await updateRecord<AdminNotice>(API_PATHS.notices, id, { title, body, category: category || null });
  } catch {
    return networkFailure();
  }
}

/** DRAFTS ONLY. REPLACES THE WHOLE AUDIENCE SET. */
export async function setNoticeAudiences(id: string, selection: AudienceSelection): Promise<ApiResult<AdminNotice>> {
  try {
    return await runRecordAction<AdminNotice>(API_PATHS.notices, id, 'audiences', { audiences: toAudienceInputs(selection) }, 'PUT');
  } catch {
    return networkFailure();
  }
}

/** DRAFT → PUBLISHED. NEEDS AT LEAST ONE AUDIENCE. */
export async function publishNotice(id: string): Promise<ApiResult<AdminNotice>> {
  try {
    return await runRecordAction<AdminNotice>(API_PATHS.notices, id, 'publish');
  } catch {
    return networkFailure();
  }
}

/** DRAFT OR PUBLISHED → ARCHIVED. FINAL. */
export async function archiveNotice(id: string): Promise<ApiResult<AdminNotice>> {
  try {
    return await runRecordAction<AdminNotice>(API_PATHS.notices, id, 'archive');
  } catch {
    return networkFailure();
  }
}
