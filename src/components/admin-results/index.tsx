'use client';

import { FileTextIcon, Loader2Icon, RefreshCwIcon, SaveIcon, UsersIcon } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { FormAlert } from '@/components/form-alert';
import { FormField } from '@/components/form-field';
import { OptionSelect } from '@/components/option-select';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { StatusBadge } from '@/components/status-badge';
import { ButtonLabel } from '@/components/button-label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MARKS_MESSAGES, MARKS_PORTAL_COPY, MAX_BULK_MARKS } from '@/constants/admin-results';
import { API_PATHS } from '@/constants/api-client';
import { loadExamPapers } from '@/functions/admin-exam-detail';
import { loadYearExams } from '@/functions/admin-exams';
import { loadMarksSheet, saveMarks } from '@/functions/admin-results';
import { examDatesLabel } from '@/helpers/admin-exams';
import { draftIssue, isDraftChanged, marksToSave, newerResult, savedDraft } from '@/helpers/admin-results';
import { formatMarks, pluralize } from '@/helpers/format';
import { withoutKey } from '@/helpers/forms';
import { academicYearOptions, classLabel, sortClasses, subjectLabel } from '@/helpers/reference-labels';
import { useApiQuery } from '@/hooks/use-api-query';
import { useAsyncResult } from '@/hooks/use-async-result';
import { useMutation } from '@/hooks/use-mutation';
import { useReferenceData } from '@/hooks/use-reference-data';
import type { MarkDraft, MarksSaveOutcome, MarksSheetRow } from '@/types/admin-results';
import type { ExamSubject } from '@/types/exam-subjects';
import type { Result } from '@/types/results';

/** THE CHOSEN YEAR → EXAM → CLASS → PAPER. EACH STEP RESETS THE ONES AFTER IT. */
interface Selection {
  yearId: string | null;
  examId: string | null;
  classId: string | null;
  paperId: string | null;
}

/** EDITS AND SAVE RESULTS FOR ONE PAPER. A DIFFERENT PAPER STARTS FROM A CLEAN SHEET (NO EFFECT NEEDED). */
interface SheetState {
  paperId: string | null;
  drafts: Record<string, MarkDraft>;
  serverErrors: Record<string, string>;
  saved: Record<string, Result>;
  formError: string | null;
}

interface SheetLine {
  row: MarksSheetRow;
  draft: MarkDraft;
  isChanged: boolean;
  issue: string | null;
  error: string | null;
}

const EMPTY_SHEET: SheetState = { paperId: null, drafts: {}, serverErrors: {}, saved: {}, formError: null };

interface AdminResultsProps {
  /** WHOSE PORTAL THIS IS: ONLY THE EMPTY-STATE WORDING DIFFERS. */
  role?: 'ADMIN' | 'TEACHER';
  /** THE PAPERS THIS PERSON MAY ENTER MARKS FOR (A TEACHER: THEIR CLASS + SUBJECT ASSIGNMENTS). THE API ENFORCES THE SAME RULE. */
  canEnterPaper?: (paper: ExamSubject) => boolean;
}

/**
 * MARKS ENTRY FOR ONE PAPER (A SUBJECT OF AN EXAM FOR ONE CLASS). NEW MARKS ARE
 * SAVED TOGETHER IN ONE REQUEST; CORRECTIONS ONE BY ONE, ONLY FROM THE VERSION
 * LOADED. THERE IS NO ABSENT STATE: A BLANK FIELD IS "NOT ENTERED", AND 0 IS A MARK.
 * SHARED BY THE ADMIN AND TEACHER PORTALS; TEACHERS SEE ONLY THE PAPERS THEY TEACH.
 */
export function AdminResults({ role = 'ADMIN', canEnterPaper }: AdminResultsProps = {}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [sheetState, setSheetState] = useState<SheetState>(EMPTY_SHEET);

  const searchParams = useSearchParams();
  const preselectedPaperId = searchParams.get('examSubjectId');
  const { academicYears, classById, subjectById, academicYearById, currentAcademicYear, isReady } = useReferenceData();
  const preselected = useApiQuery<ExamSubject>(
    preselectedPaperId && selection === null ? `${API_PATHS.examSubjects}/${encodeURIComponent(preselectedPaperId)}` : null,
  );

  const isPreselecting = selection === null && preselectedPaperId !== null && preselected.isLoading;
  const preselectedPaper = selection === null && preselected.data && (canEnterPaper?.(preselected.data) ?? true) ? preselected.data : null;
  const current: Selection =
    selection ??
    (preselectedPaper
      ? { yearId: preselectedPaper.academicYearId, examId: preselectedPaper.examId, classId: preselectedPaper.classId, paperId: preselectedPaper.id }
      : { yearId: isPreselecting ? null : (currentAcademicYear?.id ?? null), examId: null, classId: null, paperId: null });

  const examsQuery = useAsyncResult(current.yearId ? `year-exams|${current.yearId}` : null, () => loadYearExams(current.yearId ?? ''));
  const papersQuery = useAsyncResult(current.examId ? `exam-papers|${current.examId}` : null, () => loadExamPapers(current.examId ?? ''));
  const paper = papersQuery.data?.find((candidate) => candidate.id === current.paperId) ?? (preselectedPaper?.id === current.paperId ? preselectedPaper : null);
  const sheetQuery = useAsyncResult(paper ? `marks-sheet|${paper.id}` : null, () => loadMarksSheet({ id: paper?.id ?? '', classId: paper?.classId ?? '' }));

  const save = useMutation(saveMarks, { onSuccess: handleSaveOutcome });

  const sheet = sheetState.paperId === current.paperId ? sheetState : { ...EMPTY_SHEET, paperId: current.paperId };
  const maxMarks = paper ? Number(paper.maxMarks) : 0;
  // A LIST STILL SHOWING FROM THE PREVIOUS CHOICE WHILE THE NEXT ONE LOADS IS IGNORED.
  const exams = (examsQuery.data ?? []).filter((candidate) => candidate.academicYearId === current.yearId);
  const exam = exams.find((candidate) => candidate.id === current.examId) ?? null;
  const papers = (papersQuery.data ?? []).filter((candidate) => candidate.examId === current.examId && (canEnterPaper?.(candidate) ?? true));
  const copy = MARKS_PORTAL_COPY[role];
  const classIdsWithPapers = new Set(papers.map((candidate) => candidate.classId));
  const classChoices = sortClasses([...classIdsWithPapers].flatMap((classId) => classById.get(classId) ?? []));
  const paperChoices = papers
    .filter((candidate) => candidate.classId === current.classId)
    .map((candidate) => {
      const subject = subjectById.get(candidate.subjectId);
      return { value: candidate.id, label: subject ? `${subject.name} (${subject.code})` : subjectLabel(subject) };
    })
    .sort((first, second) => first.label.localeCompare(second.label));
  const lines: SheetLine[] | null =
    sheetQuery.data && sheetQuery.data.paperId === paper?.id
      ? sheetQuery.data.rows.map((sheetRow) => {
          const studentId = sheetRow.enrollment.studentId;
          const result = newerResult(sheetRow.result, sheet.saved[studentId]);
          const row = { ...sheetRow, result };
          const typed = sheet.drafts[studentId];
          const draft = typed ?? savedDraft(result);
          const isChanged = isDraftChanged(draft, result);
          const issue = typed ? draftIssue(draft, result, maxMarks) : null;
          return { row, draft, isChanged, issue, error: issue ?? sheet.serverErrors[studentId] ?? null };
        })
      : null;
  const changedCount = lines?.filter((line) => line.isChanged).length ?? 0;
  const enteredCount = lines?.filter((line) => line.row.result).length ?? 0;
  const isSaving = save.isPending;
  const paperTitle = paper ? `${subjectLabel(subjectById.get(paper.subjectId))} · ${classLabel(classById.get(paper.classId))}` : '';

  const columns: DataTableColumn<SheetLine>[] = [
    {
      key: 'roll',
      header: 'Roll',
      className: 'w-16',
      cell: ({ row }) => <span className='text-sm tabular-nums'>{row.enrollment.rollNumber ?? '—'}</span>,
    },
    {
      key: 'student',
      header: 'Student',
      cell: ({ row }) => (
        <div className='min-w-40'>
          <p className='font-medium text-foreground'>{row.student?.user.fullName ?? 'Unknown student'}</p>
          <p className='tabular-nums text-xs text-muted-foreground'>
            {row.student?.admissionNumber ?? '—'}
            {row.student && !row.student.user.isActive && <span className='ml-2 font-sans'>{MARKS_MESSAGES.inactive}</span>}
          </p>
        </div>
      ),
    },
    {
      key: 'marks',
      header: `Marks (out of ${formatMarks(maxMarks)})`,
      cell: (line) => {
        const studentId = line.row.enrollment.studentId;
        const name = line.row.student?.user.fullName ?? 'unknown student';
        return (
          <div className='flex min-w-28 flex-col gap-1'>
            <Input
              id={`marks-${studentId}`}
              inputMode='decimal'
              autoComplete='off'
              aria-label={`Marks for ${name}, out of ${formatMarks(maxMarks)}`}
              aria-invalid={line.error ? true : undefined}
              aria-describedby={line.error ? `row-${studentId}-error` : undefined}
              value={line.draft.marks}
              onChange={(event) => updateDraft(line.row, 'marks', event.target.value)}
              disabled={isSaving || isRowLocked(line.row)}
              className='w-24 text-right tabular-nums'
            />
            {line.error && (
              <p id={`row-${studentId}-error`} className='max-w-64 text-xs text-destructive'>
                {line.error}
              </p>
            )}
          </div>
        );
      },
    },
    {
      key: 'remarks',
      header: 'Remarks',
      cell: (line) => (
        <Input
          aria-label={`Remarks for ${line.row.student?.user.fullName ?? 'unknown student'}`}
          autoComplete='off'
          value={line.draft.remarks}
          onChange={(event) => updateDraft(line.row, 'remarks', event.target.value)}
          disabled={isSaving || isRowLocked(line.row)}
          className='min-w-48'
        />
      ),
    },
    { key: 'state', header: 'State', cell: (line) => rowBadge(line) },
  ];

  function isRowLocked(row: MarksSheetRow) {
    // THE API REJECTS MARKS FOR DEACTIVATED STUDENTS.
    return row.student !== null && !row.student.user.isActive;
  }

  function rowBadge(line: SheetLine) {
    if (line.error) return <StatusBadge tone='danger'>Error</StatusBadge>;
    if (line.isChanged) return <StatusBadge tone='warning'>Changed</StatusBadge>;
    if (line.row.result) return <StatusBadge tone='success'>Saved</StatusBadge>;
    return <StatusBadge tone='neutral'>Not entered</StatusBadge>;
  }

  function updateDraft(row: MarksSheetRow, field: keyof MarkDraft, value: string) {
    const studentId = row.enrollment.studentId;
    setSheetState((state) => {
      const base = state.paperId === current.paperId ? state : { ...EMPTY_SHEET, paperId: current.paperId };
      const draft = base.drafts[studentId] ?? savedDraft(newerResult(row.result, base.saved[studentId]));
      return { ...base, drafts: { ...base.drafts, [studentId]: { ...draft, [field]: value } }, serverErrors: withoutKey(base.serverErrors, studentId) };
    });
  }

  function handleSaveOutcome(outcome: MarksSaveOutcome) {
    const settledIds = new Set([...outcome.saved.map((result) => result.studentId), ...outcome.conflictedStudentIds]);
    setSheetState((state) => {
      const base = state.paperId === current.paperId ? state : { ...EMPTY_SHEET, paperId: current.paperId };
      const drafts = Object.fromEntries(Object.entries(base.drafts).filter(([studentId]) => !settledIds.has(studentId)));
      const saved = { ...base.saved, ...Object.fromEntries(outcome.saved.map((result) => [result.studentId, result])) };
      return { ...base, drafts, saved, serverErrors: outcome.rowErrors, formError: outcome.formError };
    });
    if (outcome.saved.length > 0) toast.success(`Saved marks for ${pluralize(outcome.saved.length, 'student')}.`);
    sheetQuery.reload();
  }

  function setSheetError(message: string) {
    setSheetState({ ...sheet, formError: message });
  }

  function handleSave() {
    if (!paper || !lines) return;
    const invalid = lines.filter((line) => line.isChanged && line.issue);
    if (invalid.length > 0) {
      setSheetError(`Fix ${pluralize(invalid.length, 'row')} marked Error before saving. Nothing was saved.`);
      document.getElementById(`marks-${invalid[0].row.enrollment.studentId}`)?.focus();
      return;
    }
    const { newMarks, corrections } = marksToSave(lines);
    if (newMarks.length === 0 && corrections.length === 0) {
      setSheetError('There are no changes to save.');
      return;
    }
    if (newMarks.length > MAX_BULK_MARKS) {
      setSheetError(`At most ${MAX_BULK_MARKS} new marks can be saved at once. Save part of the class first.`);
      return;
    }
    setSheetState({ ...sheet, formError: null });
    void save.run({ examSubjectId: paper.id, newMarks, corrections });
  }

  function reloadSheet() {
    setSheetState({ ...EMPTY_SHEET, paperId: current.paperId });
    sheetQuery.reload();
  }

  function renderSheet() {
    if (!current.examId)
      return <EmptyState icon={FileTextIcon} title='Choose an exam' description='Then choose the class and the subject paper to enter marks for.' />;
    if (papersQuery.errorMessage)
      return (
        <FormAlert tone='error' title="Couldn't load the papers">
          {papersQuery.errorMessage}
        </FormAlert>
      );
    if (papersQuery.data && !papersQuery.isLoading && papers.length === 0) {
      return <EmptyState icon={FileTextIcon} title='No papers in this exam yet' description={copy.noPapers} />;
    }
    if (!paper) return <EmptyState icon={FileTextIcon} title='Choose a class and paper' description={copy.choosePaper} />;
    return (
      <Panel
        title={paperTitle}
        description={
          <span className='flex flex-wrap gap-x-4 gap-y-1'>
            <span>
              Max marks <span className='text-foreground tabular-nums'>{formatMarks(paper.maxMarks)}</span>
            </span>
            <span>
              Pass marks <span className='text-foreground tabular-nums'>{formatMarks(paper.passMarks)}</span>
            </span>
            {lines && (
              <span className='tabular-nums'>
                {enteredCount} of {pluralize(lines.length, 'student')} entered
              </span>
            )}
          </span>
        }
        actions={
          <>
            <Button variant='outline' onClick={reloadSheet} disabled={isSaving || sheetQuery.isLoading}>
              <RefreshCwIcon aria-hidden />
              Reload
            </Button>
            <Button onClick={handleSave} disabled={isSaving || changedCount === 0}>
              <ButtonLabel stateKey={isSaving ? 'pending' : 'idle'}>
                {isSaving ? <Loader2Icon className='animate-spin' aria-hidden /> : <SaveIcon aria-hidden />}
                {changedCount > 0 ? `Save ${pluralize(changedCount, 'change')}` : 'Save'}
              </ButtonLabel>
            </Button>
          </>
        }
        bodyClassName='flex flex-col gap-4 p-0'
      >
        {(save.formError ?? sheet.formError) && (
          <FormAlert tone='error' title='Not saved' className='mx-5 mt-5'>
            {save.formError ?? sheet.formError}
          </FormAlert>
        )}
        <p className='px-5 pt-4 text-sm text-muted-foreground'>
          Leave a field blank if the mark isn&apos;t known yet; 0 is saved as a mark. A saved mark can be corrected but not cleared.
        </p>
        <div aria-busy={isSaving} className='border-t'>
          <DataTable
            label={`Marks for ${paperTitle}`}
            columns={columns}
            rows={lines}
            getRowKey={(line) => line.row.enrollment.id}
            isLoading={sheetQuery.isLoading}
            errorMessage={sheetQuery.errorMessage}
            onRetry={sheetQuery.reload}
            empty={<EmptyState icon={UsersIcon} title='No students in this class' description={copy.noStudents} />}
          />
        </div>
      </Panel>
    );
  }

  return (
    <>
      <PageHeader title='Marks entry' description='Choose an exam, a class and a subject paper, then enter each student’s marks.' />

      {selection === null && preselected.errorMessage && (
        <FormAlert tone='error' title="Couldn't open that paper" className='mb-4'>
          {preselected.errorMessage} Choose the paper below instead.
        </FormAlert>
      )}

      <div className='mb-6 grid gap-4 rounded-xl bg-card shadow-xs p-5 sm:grid-cols-2 xl:grid-cols-4'>
        <FormField id='marks-year' label='Academic year'>
          <OptionSelect
            id='marks-year'
            value={current.yearId}
            onValueChange={(value) => setSelection({ yearId: value, examId: null, classId: null, paperId: null })}
            options={academicYearOptions(academicYears)}
            placeholder='Choose a year'
            isDisabled={!isReady || isSaving || isPreselecting}
          />
        </FormField>
        <FormField id='marks-exam' label='Exam' error={examsQuery.errorMessage ?? undefined}>
          <OptionSelect
            id='marks-exam'
            value={current.examId}
            onValueChange={(value) => setSelection({ ...current, examId: value, classId: null, paperId: null })}
            options={exams.map((candidate) => ({ value: candidate.id, label: candidate.name }))}
            placeholder={examsQuery.isLoading ? 'Loading exams…' : exams.length === 0 && examsQuery.data ? 'No exams in this year' : 'Choose an exam'}
            isDisabled={!current.yearId || isSaving || exams.length === 0}
          />
        </FormField>
        <FormField id='marks-class' label='Class'>
          <OptionSelect
            id='marks-class'
            value={current.classId}
            onValueChange={(value) => setSelection({ ...current, classId: value, paperId: null })}
            options={classChoices.map((schoolClass) => ({ value: schoolClass.id, label: classLabel(schoolClass) }))}
            placeholder={papersQuery.isLoading ? 'Loading classes…' : 'Choose a class'}
            isDisabled={!current.examId || isSaving || classChoices.length === 0}
          />
        </FormField>
        <FormField id='marks-paper' label='Subject paper'>
          <OptionSelect
            id='marks-paper'
            value={current.paperId}
            onValueChange={(value) => setSelection({ ...current, paperId: value })}
            options={paperChoices}
            placeholder='Choose a subject'
            isDisabled={!current.classId || isSaving || paperChoices.length === 0}
          />
        </FormField>
        {exam && (
          <p className='text-sm text-muted-foreground sm:col-span-2 xl:col-span-4'>
            {exam.name}
            {current.yearId && ` · ${academicYearById.get(current.yearId)?.name ?? ''}`}
            {examDatesLabel(exam) && <span className='tabular-nums'> · {examDatesLabel(exam)}</span>}
          </p>
        )}
      </div>

      {renderSheet()}
    </>
  );
}
