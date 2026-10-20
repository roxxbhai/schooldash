'use client';

import { useState } from 'react';
import { FormDialog } from '@/components/form-dialog';
import { FormField } from '@/components/form-field';
import { OptionSelect } from '@/components/option-select';
import { Input } from '@/components/ui/input';
import { EMPTY_EXAM_FORM, EXAM_FORM_SCHEMA, type ExamForm } from '@/constants/admin-exams';
import { createExam, updateExam } from '@/functions/admin-exams';
import { examDatesOutsideYear } from '@/helpers/admin-exams';
import { formatDate } from '@/helpers/format';
import { fieldControlProps, withoutKey, zodFieldErrors } from '@/helpers/forms';
import { academicYearOptions } from '@/helpers/reference-labels';
import { useMutation } from '@/hooks/use-mutation';
import { useReferenceData } from '@/hooks/use-reference-data';
import type { Exam } from '@/types/exams';

interface ExamFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** THE EXAM BEING EDITED, OR NULL TO CREATE ONE. */
  exam: Exam | null;
  /** THE YEAR A NEW EXAM STARTS IN. */
  defaultYearId: string | null;
  onSaved: (exam: Exam) => void;
}

/**
 * CREATE OR EDIT AN EXAM. THE FORM STARTS FROM ITS PROPS, SO THE PARENT GIVES IT
 * A NEW `key` EACH TIME IT OPENS. THE YEAR IS FIXED ONCE THE EXAM EXISTS.
 */
export function ExamFormDialog({ isOpen, onOpenChange, exam, defaultYearId, onSaved }: ExamFormDialogProps) {
  const [form, setForm] = useState<ExamForm>(
    exam
      ? { academicYearId: exam.academicYearId, name: exam.name, startDate: exam.startDate ?? '', endDate: exam.endDate ?? '' }
      : { ...EMPTY_EXAM_FORM, academicYearId: defaultYearId ?? '' },
  );

  const { academicYears, academicYearById } = useReferenceData();

  const save = useMutation((values: ExamForm) => (exam ? updateExam(exam.id, values) : createExam(values)), {
    successMessage: (saved) => (exam ? `Saved ${saved.name}.` : `Created ${saved.name}.`),
    onSuccess: onSaved,
  });

  const year = academicYearById.get(form.academicYearId);

  function setField<K extends keyof ExamForm>(field: K, value: ExamForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    save.setFieldErrors((errors) => withoutKey(errors, field));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = EXAM_FORM_SCHEMA.safeParse(form);
    const errors = { ...examDatesOutsideYear(form, year), ...(parsed.success ? {} : zodFieldErrors(parsed.error)) };
    if (!parsed.success || Object.keys(errors).length > 0) {
      save.setFieldErrors(errors);
      return;
    }
    void save.run(parsed.data);
  }

  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={exam ? `Edit ${exam.name}` : 'New exam'}
      description={exam ? undefined : 'Add the papers for each class once the exam is created.'}
      submitLabel={exam ? 'Save changes' : 'Create exam'}
      isSubmitting={save.isPending}
      formError={save.formError}
      onSubmit={handleSubmit}
    >
      <FormField
        id='academicYearId'
        label='Academic year'
        description={exam ? "An exam's year can't change, because its papers belong to that year's classes." : undefined}
        error={save.fieldErrors.academicYearId}
        isRequired
      >
        <OptionSelect
          {...fieldControlProps('academicYearId', save.fieldErrors.academicYearId, Boolean(exam))}
          value={form.academicYearId || null}
          onValueChange={(value) => setField('academicYearId', value ?? '')}
          options={academicYearOptions(academicYears)}
          placeholder='Choose a year'
          isDisabled={Boolean(exam)}
        />
      </FormField>
      <FormField id='name' label='Name' description='For example Term 1 or Half-yearly.' error={save.fieldErrors.name} isRequired>
        <Input
          {...fieldControlProps('name', save.fieldErrors.name, true)}
          value={form.name}
          onChange={(event) => setField('name', event.target.value)}
          autoComplete='off'
        />
      </FormField>
      <div className='grid gap-4 sm:grid-cols-2'>
        <FormField
          id='startDate'
          label='First day'
          description={year ? `Optional. Within ${formatDate(year.startDate)} – ${formatDate(year.endDate)}.` : 'Optional.'}
          error={save.fieldErrors.startDate}
        >
          <Input
            {...fieldControlProps('startDate', save.fieldErrors.startDate, true)}
            type='date'
            min={year?.startDate}
            max={year?.endDate}
            value={form.startDate}
            onChange={(event) => setField('startDate', event.target.value)}
            className='font-mono'
          />
        </FormField>
        <FormField id='endDate' label='Last day' description='Optional.' error={save.fieldErrors.endDate}>
          <Input
            {...fieldControlProps('endDate', save.fieldErrors.endDate, true)}
            type='date'
            min={form.startDate || year?.startDate}
            max={year?.endDate}
            value={form.endDate}
            onChange={(event) => setField('endDate', event.target.value)}
            className='font-mono'
          />
        </FormField>
      </div>
    </FormDialog>
  );
}
