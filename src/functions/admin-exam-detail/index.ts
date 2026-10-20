import 'client-only';
import { API_PATHS } from '@/constants/api-client';
import { createRecord, fetchAllPages, updateRecord } from '@/functions/api-client';
import { paperChanges } from '@/helpers/admin-exam-detail';
import { networkFailure } from '@/helpers/api-client';
import type { PaperForm } from '@/constants/admin-exam-detail';
import type { ApiResult } from '@/types/api-client';
import type { ExamSubject } from '@/types/exam-subjects';

/** EVERY PAPER OF ONE EXAM (ALL CLASSES). BOUNDED BY CLASSES × SUBJECTS. */
export async function loadExamPapers(examId: string): Promise<ApiResult<ExamSubject[]>> {
  try {
    return await fetchAllPages<ExamSubject>(API_PATHS.examSubjects, { examId });
  } catch {
    return networkFailure();
  }
}

/** MARKS GO AS JSON NUMBERS. BLANK PASS MARKS AND EXAM DATE ARE LEFT OUT (OPTIONAL ON CREATE). */
export async function createPaper(examId: string, form: PaperForm): Promise<ApiResult<ExamSubject>> {
  try {
    const { classId, subjectId, maxMarks, passMarks, examDate } = form;
    return await createRecord<ExamSubject>(API_PATHS.examSubjects, {
      examId,
      classId,
      subjectId,
      maxMarks: Number(maxMarks),
      ...(passMarks ? { passMarks: Number(passMarks) } : {}),
      ...(examDate ? { examDate } : {}),
    });
  } catch {
    return networkFailure();
  }
}

/**
 * SENDS ONLY WHAT CHANGED (EXAM, CLASS AND SUBJECT ARE FIXED), SO AN UNTOUCHED
 * DATE ISN'T RE-CHECKED AGAINST EXAM DATES EDITED SINCE. BLANK CLEARS TO NULL.
 * THE CALLER SKIPS THE REQUEST WHEN NOTHING CHANGED (THE API REJECTS AN EMPTY PATCH).
 */
export async function updatePaper(paper: ExamSubject, form: PaperForm): Promise<ApiResult<ExamSubject>> {
  try {
    return await updateRecord<ExamSubject>(API_PATHS.examSubjects, paper.id, paperChanges(paper, form));
  } catch {
    return networkFailure();
  }
}
