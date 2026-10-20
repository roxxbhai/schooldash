import type { PaperForm } from '@/constants/admin-exam-detail';
import type { ExamSubject } from '@/types/exam-subjects';

/** THE FIELDS OF `form` THAT DIFFER FROM THE SAVED PAPER. */
export function paperChanges(paper: ExamSubject, form: PaperForm): Record<string, number | string | null> {
  const maxMarks = Number(form.maxMarks);
  const passMarks = form.passMarks ? Number(form.passMarks) : null;
  const examDate = form.examDate || null;
  const savedPassMarks = paper.passMarks === null ? null : Number(paper.passMarks);
  return {
    ...(maxMarks === Number(paper.maxMarks) ? {} : { maxMarks }),
    ...(passMarks === savedPassMarks ? {} : { passMarks }),
    ...(examDate === paper.examDate ? {} : { examDate }),
  };
}
