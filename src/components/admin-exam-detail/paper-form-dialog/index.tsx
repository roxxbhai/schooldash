'use client';

import { useState } from 'react';
import { FormDialog } from '@/components/form-dialog';
import { FormField } from '@/components/form-field';
import { OptionSelect } from '@/components/option-select';
import { Input } from '@/components/ui/input';
import { EMPTY_PAPER_FORM, PAPER_FORM_SCHEMA, type PaperForm } from '@/constants/admin-exam-detail';
import { createPaper, updatePaper } from '@/functions/admin-exam-detail';
import { paperChanges } from '@/helpers/admin-exam-detail';
import { paperDateWindow } from '@/helpers/admin-exams';
import { formatDate } from '@/helpers/format';
import { fieldControlProps, withoutKey, zodFieldErrors } from '@/helpers/forms';
import { marksToText } from '@/helpers/marks';
import { classLabel, classOptions, subjectLabel, subjectOptions } from '@/helpers/reference-labels';
import { useMutation } from '@/hooks/use-mutation';
import { useReferenceData } from '@/hooks/use-reference-data';
import type { ExamSubject } from '@/types/exam-subjects';
import type { Exam } from '@/types/exams';

interface PaperFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  exam: Exam;
  /** THE PAPER BEING EDITED, OR NULL TO ADD ONE. */
  paper: ExamSubject | null;
  /** THE CLASS A NEW PAPER STARTS WITH (THE PAGE'S CLASS FILTER). */
  defaultClassId: string | null;
  onSaved: () => void;
}

/**
 * ADD OR EDIT ONE PAPER (A SUBJECT OF THE EXAM FOR ONE CLASS). THE FORM STARTS
 * FROM ITS PROPS, SO THE PARENT GIVES IT A NEW `key` EACH TIME IT OPENS. CLASS
 * AND SUBJECT ARE FIXED ONCE THE PAPER EXISTS, SO ITS MARKS ARE NEVER RELABELLED.
 */
export function PaperFormDialog({ isOpen, onOpenChange, exam, paper, defaultClassId, onSaved }: PaperFormDialogProps) {
  const [form, setForm] = useState<PaperForm>(
    paper
      ? {
          classId: paper.classId,
          subjectId: paper.subjectId,
          maxMarks: marksToText(paper.maxMarks),
          passMarks: marksToText(paper.passMarks),
          examDate: paper.examDate ?? '',
        }
      : // A ONE-DAY EXAM HAS ONLY ONE POSSIBLE PAPER DATE.
        { ...EMPTY_PAPER_FORM, classId: defaultClassId ?? '', examDate: exam.startDate && exam.startDate === exam.endDate ? exam.startDate : '' },
  );

  const { classes, subjects, classById, subjectById, academicYearById } = useReferenceData();

  const save = useMutation((values: PaperForm) => (paper ? updatePaper(paper, values) : createPaper(exam.id, values)), {
    successMessage: (saved) =>
      `${paper ? 'Saved' : 'Added'} ${subjectLabel(subjectById.get(saved.subjectId))} for ${classLabel(classById.get(saved.classId))}.`,
    onSuccess: onSaved,
  });

  const dateWindow = paperDateWindow(exam, academicYearById.get(exam.academicYearId));
  const dateHint = dateWindow.min && dateWindow.max ? `Optional. Within ${formatDate(dateWindow.min)} – ${formatDate(dateWindow.max)}.` : 'Optional.';

  function setField<K extends keyof PaperForm>(field: K, value: PaperForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    save.setFieldErrors((errors) => withoutKey(errors, field));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = PAPER_FORM_SCHEMA.safeParse(form);
    if (!parsed.success) {
      save.setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }
    const isDateOutside = Boolean(form.examDate && dateWindow.min && dateWindow.max && (form.examDate < dateWindow.min || form.examDate > dateWindow.max));
    if (isDateOutside) {
      save.setFieldErrors({ examDate: `Choose a date within ${dateWindow.label}.` });
      return;
    }
    // NOTHING CHANGED: THE API WOULD REJECT AN EMPTY PATCH, SO JUST CLOSE.
    if (paper && Object.keys(paperChanges(paper, parsed.data)).length === 0) {
      onOpenChange(false);
      return;
    }
    void save.run(parsed.data);
  }

  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={paper ? `Edit ${subjectLabel(subjectById.get(paper.subjectId))} – ${classLabel(classById.get(paper.classId))}` : 'Add paper'}
      description={paper ? "Class and subject can't change once a paper exists." : `A subject of ${exam.name} for one class.`}
      submitLabel={paper ? 'Save changes' : 'Add paper'}
      isSubmitting={save.isPending}
      formError={save.formError}
      onSubmit={handleSubmit}
    >
      <div className='grid gap-4 sm:grid-cols-2'>
        <FormField id='classId' label='Class' error={save.fieldErrors.classId} isRequired>
          <OptionSelect
            {...fieldControlProps('classId', save.fieldErrors.classId)}
            value={form.classId || null}
            onValueChange={(value) => setField('classId', value ?? '')}
            options={classOptions(classes, exam.academicYearId)}
            placeholder='Choose a class'
            isDisabled={Boolean(paper)}
          />
        </FormField>
        <FormField id='subjectId' label='Subject' error={save.fieldErrors.subjectId} isRequired>
          <OptionSelect
            {...fieldControlProps('subjectId', save.fieldErrors.subjectId)}
            value={form.subjectId || null}
            onValueChange={(value) => setField('subjectId', value ?? '')}
            options={subjectOptions(subjects)}
            placeholder='Choose a subject'
            isDisabled={Boolean(paper)}
          />
        </FormField>
      </div>
      <div className='grid gap-4 sm:grid-cols-2'>
        <FormField
          id='maxMarks'
          label='Max marks'
          description={paper ? "Can't go below a mark already entered." : '100 by default.'}
          error={save.fieldErrors.maxMarks}
          isRequired
        >
          <Input
            {...fieldControlProps('maxMarks', save.fieldErrors.maxMarks, true)}
            inputMode='decimal'
            value={form.maxMarks}
            onChange={(event) => setField('maxMarks', event.target.value)}
            className='tabular-nums'
            autoComplete='off'
          />
        </FormField>
        <FormField id='passMarks' label='Pass marks' description='Optional. Shown on report cards as configured.' error={save.fieldErrors.passMarks}>
          <Input
            {...fieldControlProps('passMarks', save.fieldErrors.passMarks, true)}
            inputMode='decimal'
            value={form.passMarks}
            onChange={(event) => setField('passMarks', event.target.value)}
            className='tabular-nums'
            autoComplete='off'
          />
        </FormField>
      </div>
      <FormField id='examDate' label='Exam date' description={dateHint} error={save.fieldErrors.examDate}>
        <Input
          {...fieldControlProps('examDate', save.fieldErrors.examDate, true)}
          type='date'
          min={dateWindow.min}
          max={dateWindow.max}
          value={form.examDate}
          onChange={(event) => setField('examDate', event.target.value)}
          className='tabular-nums'
        />
      </FormField>
    </FormDialog>
  );
}
