import 'client-only';
import { API_PATHS, NETWORK_ERROR_MESSAGE } from '@/constants/api-client';
import { fetchAllPages } from '@/functions/api-client';
import { networkFailure } from '@/helpers/api-client';
import type { AcademicYear } from '@/types/academic-years';
import type { ApiResult } from '@/types/api-client';
import type { SchoolClass } from '@/types/classes';
import type { ReferenceData } from '@/types/reference-data';
import type { Subject } from '@/types/subjects';
import type { Teacher } from '@/types/teachers';
import { referenceDataStore } from '@/zustand/reference-data';

/** LOADS THE FOUR REFERENCE LISTS IN PARALLEL. ANY FAILURE FAILS THE WHOLE LOAD, SO A PAGE NEVER SHOWS HALF-RESOLVED NAMES. */
async function loadReferenceData(): Promise<ApiResult<ReferenceData>> {
  try {
    const [academicYears, classes, subjects, teachers] = await Promise.all([
      fetchAllPages<AcademicYear>(API_PATHS.academicYears),
      fetchAllPages<SchoolClass>(API_PATHS.classes),
      fetchAllPages<Subject>(API_PATHS.subjects),
      fetchAllPages<Teacher>(API_PATHS.teachers),
    ]);
    if (!academicYears.success) return academicYears;
    if (!classes.success) return classes;
    if (!subjects.success) return subjects;
    if (!teachers.success) return teachers;
    return {
      success: true,
      message: 'Operation successful',
      data: { academicYears: academicYears.data, classes: classes.data, subjects: subjects.data, teachers: teachers.data },
    };
  } catch {
    return networkFailure();
  }
}

/** SET WHEN A REFRESH IS ASKED FOR DURING A LOAD, SO A CHANGE SAVED MID-LOAD IS NEVER MISSED. */
let isRefreshQueued = false;

/**
 * (RE)LOADS THE LISTS INTO THE REFERENCE STORE. SAFE TO CALL FROM MANY
 * COMPONENTS AT ONCE: CALLS DURING A LOAD COLLAPSE INTO ONE MORE LOAD AFTER IT.
 * CALL IT AFTER CREATING OR CHANGING AN ACADEMIC YEAR, CLASS, SUBJECT OR TEACHER.
 */
export async function refreshReferenceData(): Promise<ApiResult<null>> {
  const store = referenceDataStore.getState();
  try {
    if (store.status === 'loading' || store.status === 'refreshing') {
      isRefreshQueued = true;
      return { success: true, message: 'Operation successful', data: null };
    }
    const hasLoadedBefore = store.status === 'ready';
    store.setStatus(hasLoadedBefore ? 'refreshing' : 'loading');
    let result = await loadReferenceData();
    while (isRefreshQueued) {
      isRefreshQueued = false;
      result = await loadReferenceData();
    }
    if (!result.success) {
      // A FAILED BACKGROUND REFRESH KEEPS THE LISTS ALREADY SHOWN; ONLY A FAILED FIRST LOAD IS AN ERROR STATE.
      store.setErrorMessage(hasLoadedBefore ? null : result.message);
      store.setStatus(hasLoadedBefore ? 'ready' : 'error');
      return result;
    }
    store.setReferenceData(result.data);
    store.setErrorMessage(null);
    store.setStatus('ready');
    return { success: true, message: 'Operation successful', data: null };
  } catch {
    store.setErrorMessage(NETWORK_ERROR_MESSAGE);
    store.setStatus('error');
    return networkFailure();
  }
}
