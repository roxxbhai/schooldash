'use client';

import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { FormAlert } from '@/components/form-alert';
import { FormDialog } from '@/components/form-dialog';
import { FormField } from '@/components/form-field';
import { OptionSelect } from '@/components/option-select';
import { Input } from '@/components/ui/input';
import { GRADUATE_TARGET, NEW_CLASS_TARGET } from '@/constants/class-promotion';
import { ROUTES } from '@/constants/routes';
import { createPromotionClass, graduateStudents, promoteStudents } from '@/functions/class-promotion';
import { refreshReferenceData } from '@/functions/reference-data';
import { defaultPromotionTarget, nextGrade, rollNumberIssues, skippedSummary, yearsAfter } from '@/helpers/class-promotion';
import { pluralize } from '@/helpers/format';
import { fieldControlProps, withoutKey } from '@/helpers/forms';
import { academicYearOptions, classLabel } from '@/helpers/reference-labels';
import { useMutation } from '@/hooks/use-mutation';
import { useReferenceData } from '@/hooks/use-reference-data';
import type { ApiResult } from '@/types/api-client';
import type { GraduationResult, PromotionClass, PromotionResult, PromotionRosterRow, PromotionTarget } from '@/types/class-promotion';
import type { ClassPromotion } from '@/hooks/use-class-promotion';
import type { SchoolClass } from '@/types/classes';

interface ClassPromotionDialogProps {
  promotion: ClassPromotion;
  sourceClass: SchoolClass;
  /** THE WHOLE ROSTER; THE DIALOG SHOWS THE STUDENTS IT WAS OPENED WITH. */
  rows: readonly PromotionRosterRow[];
  /** ADMINS CAN CREATE THE NEXT CLASS FROM HERE WHEN IT DOESN'T EXIST YET. */
  canCreateClass: boolean;
  /** AFTER STUDENTS MOVED OR GRADUATED (E.G. RELOAD THE ROSTER). */
  onFinished?: () => void;
  /** OFFERED IN THE SUCCESS MESSAGE: SHOW THE CLASS THE STUDENTS MOVED INTO. */
  onViewClass?: (schoolClass: PromotionClass) => void;
}

type Outcome = { kind: 'graduated'; result: GraduationResult } | { kind: 'promoted'; result: PromotionResult; targetClass: PromotionClass };

/** THE TARGET LIST'S VALUE FOR A TARGET. */
function choiceFor(target: PromotionTarget | null): string | null {
  switch (target?.kind) {
    case 'graduate':
      return GRADUATE_TARGET;
    case 'newClass':
      return NEW_CLASS_TARGET;
    case 'class':
      return target.classId;
    default:
      return null;
  }
}

/** "2 – A" BEFORE "10 – A". */
function compareClasses(first: PromotionClass, second: PromotionClass): number {
  return classLabel(first).localeCompare(classLabel(second), 'en', { numeric: true });
}

/**
 * PROMOTES THE STUDENTS IT WAS OPENED WITH, IN ONE STEP. EVERYTHING STARTS FILLED IN:
 * THE NEXT ACADEMIC YEAR, THE NEXT CLASS WITH THE SAME SECTION (OFFERED FOR CREATION
 * TO ADMINS WHEN MISSING) AND EACH STUDENT'S CURRENT ROLL NUMBER, WHICH CAN BE CHANGED.
 * CLASS 12 GRADUATES BY DEFAULT; A HELD-BACK STUDENT CAN BE SENT TO A CLASS INSTEAD.
 */
export function ClassPromotionDialog({ promotion, sourceClass, rows, canCreateClass, onFinished, onViewClass }: ClassPromotionDialogProps) {
  const { academicYears, academicYearById } = useReferenceData();
  const sourceYear = academicYearById.get(sourceClass.academicYearId);
  const targetYears = yearsAfter(academicYears, sourceYear);
  const laterClasses = promotion.options?.classes ?? [];

  // THE STUDENTS ARE FIXED WHEN THE DIALOG OPENS (A NEW KEY PER OPENING), SO THEY STAY LISTED WHILE IT CLOSES.
  const [students] = useState<PromotionRosterRow[]>(() => {
    const chosen = new Set(promotion.dialog?.studentIds ?? []);
    return rows.filter((row) => chosen.has(row.enrollment.studentId));
  });
  const [yearId, setYearId] = useState<string | null>(targetYears[0]?.id ?? null);
  const [targetChoice, setTargetChoice] = useState<string | null>(() =>
    choiceFor(defaultPromotionTarget({ sourceClass, academicYearId: targetYears[0]?.id ?? null, classes: laterClasses, canCreateClass })),
  );
  const [rollNumbers, setRollNumbers] = useState<Record<string, string>>(() =>
    Object.fromEntries(students.map((row) => [row.enrollment.studentId, row.enrollment.rollNumber === null ? '' : String(row.enrollment.rollNumber)])),
  );
  // A CLASS CREATED HERE BEFORE THE PROMOTION ITSELF FAILED: KEPT AS THE TARGET UNTIL THE OPTIONS RELOAD.
  const [createdClasses, setCreatedClasses] = useState<PromotionClass[]>([]);

  const isFinalClass = nextGrade(sourceClass.name) === null;
  const allClasses = [...laterClasses, ...createdClasses.filter((created) => !laterClasses.some((schoolClass) => schoolClass.id === created.id))];
  const yearClasses = allClasses.filter((schoolClass) => schoolClass.academicYearId === yearId).sort(compareClasses);
  const suggestion = defaultPromotionTarget({ sourceClass, academicYearId: yearId, classes: allClasses, canCreateClass });
  const suggestedNewClass = suggestion?.kind === 'newClass' ? suggestion : null;
  const missingClassName = nextGrade(sourceClass.name) ? `${nextGrade(sourceClass.name)} – ${sourceClass.section}` : null;
  const isMissingForTeacher = !canCreateClass && !isFinalClass && yearId !== null && suggestion === null;

  const target: PromotionTarget | null =
    targetChoice === GRADUATE_TARGET
      ? { kind: 'graduate' }
      : targetChoice === NEW_CLASS_TARGET
        ? suggestedNewClass
        : targetChoice && yearClasses.some((schoolClass) => schoolClass.id === targetChoice)
          ? { kind: 'class', classId: targetChoice }
          : null;
  const isGraduating = target?.kind === 'graduate';
  const targetYear = yearId ? academicYearById.get(yearId) : undefined;

  const targetOptions = [
    ...(isFinalClass ? [{ value: GRADUATE_TARGET, label: 'Graduate (they leave the school)' }] : []),
    ...(suggestedNewClass ? [{ value: NEW_CLASS_TARGET, label: `${suggestedNewClass.name} – ${suggestedNewClass.section} (create this class)` }] : []),
    ...yearClasses.map((schoolClass) => ({ value: schoolClass.id, label: classLabel(schoolClass) })),
  ];

  const takenRollNumbers = new Set(
    target?.kind === 'class' ? (promotion.options?.takenRollNumbers ?? []).filter((taken) => taken.classId === target.classId).map((taken) => taken.rollNumber) : [],
  );
  const rollIssues = isGraduating
    ? {}
    : rollNumberIssues(
        students.map((row) => ({ studentId: row.enrollment.studentId, rollNumber: rollNumbers[row.enrollment.studentId] ?? '' })),
        takenRollNumbers,
      );
  const hasRollIssues = Object.keys(rollIssues).length > 0;

  function rollNumberValue(studentId: string): number | null {
    const value = (rollNumbers[studentId] ?? '').trim();
    return value === '' ? null : Number(value);
  }

  async function submit(plan: PromotionTarget): Promise<ApiResult<Outcome>> {
    if (plan.kind === 'graduate') {
      const graduated = await graduateStudents(
        sourceClass.id,
        students.map((row) => row.enrollment.studentId),
      );
      return graduated.success ? { ...graduated, data: { kind: 'graduated', result: graduated.data } } : graduated;
    }

    let targetClass = plan.kind === 'class' ? allClasses.find((schoolClass) => schoolClass.id === plan.classId) : undefined;
    if (plan.kind === 'newClass') {
      const created = await createPromotionClass(plan.academicYearId, plan.name, plan.section);
      if (!created.success) return created;
      targetClass = { id: created.data.id, academicYearId: created.data.academicYearId, name: created.data.name, section: created.data.section };
      // FROM HERE ON THE CLASS EXISTS: A RETRY PROMOTES INTO IT INSTEAD OF CREATING IT AGAIN.
      setCreatedClasses((current) => [...current, targetClass as PromotionClass]);
      setTargetChoice(targetClass.id);
      void refreshReferenceData();
      promotion.reloadOptions();
    }
    if (!targetClass) return { success: false, message: 'Choose the class to move them to.', data: { status: 422, code: 'VALIDATION_ERROR', details: [] } };

    const promoted = await promoteStudents(
      sourceClass.id,
      targetClass.id,
      students.map((row) => ({ studentId: row.enrollment.studentId, rollNumber: rollNumberValue(row.enrollment.studentId) })),
    );
    return promoted.success ? { ...promoted, data: { kind: 'promoted', result: promoted.data, targetClass } } : promoted;
  }

  const run = useMutation(submit, {
    onSuccess: (outcome) => {
      announce(outcome);
      promotion.finish();
      onFinished?.();
    },
  });

  // SERVER ISSUES ON ONE STUDENT'S ROLL NUMBER ARRIVE AS "students.<index>.rollNumber", IN THE ORDER SENT.
  const serverRollIssues = Object.fromEntries(
    students.flatMap((row, index) => {
      const message = run.fieldErrors[`students.${index}.rollNumber`];
      return message ? [[row.enrollment.studentId, message]] : [];
    }),
  );
  const listError = Object.entries(run.fieldErrors).find(([path]) => path !== 'targetClassId' && !/^students\.\d+\.rollNumber$/.test(path))?.[1];

  function announce(outcome: Outcome) {
    const skipped = skippedSummary(outcome.result.skipped);
    if (outcome.kind === 'graduated') {
      const count = outcome.result.graduated.length;
      if (count === 0) {
        toast.warning('No students were marked as graduated.', { description: skipped ?? undefined });
        return;
      }
      toast.success(`Marked ${pluralize(count, 'student')} as graduated.`, {
        description: ['Their accounts are now inactive; their records are kept.', skipped].filter(Boolean).join(' '),
      });
      return;
    }

    const count = outcome.result.promoted.length;
    const label = classLabel(outcome.targetClass);
    if (count === 0) {
      toast.warning('No students were moved.', { description: skipped ?? undefined });
      return;
    }
    toast.success(`Moved ${pluralize(count, 'student')} to ${label}, ${academicYearById.get(outcome.targetClass.academicYearId)?.name ?? 'next year'}.`, {
      description: skipped ?? undefined,
      action: onViewClass ? { label: `View ${label}`, onClick: () => onViewClass(outcome.targetClass) } : undefined,
    });
  }

  function handleYearChange(value: string | null) {
    setYearId(value);
    run.setFieldErrors((errors) => withoutKey(errors, 'targetClassId'));
    // A FINAL CLASS KEEPS "GRADUATE"; ANY OTHER CHOICE STARTS AGAIN FROM THE NEXT CLASS IN THAT YEAR.
    if (targetChoice === GRADUATE_TARGET) return;
    setTargetChoice(isFinalClass ? null : choiceFor(defaultPromotionTarget({ sourceClass, academicYearId: value, classes: allClasses, canCreateClass })));
  }

  function handleTargetChange(value: string | null) {
    setTargetChoice(value);
    run.setFieldErrors((errors) => withoutKey(errors, 'targetClassId'));
  }

  function handleRollNumberChange(studentId: string, index: number, value: string) {
    setRollNumbers((current) => ({ ...current, [studentId]: value }));
    run.setFieldErrors((errors) => withoutKey(errors, `students.${index}.rollNumber`));
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) promotion.closeDialog();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target || hasRollIssues) return;
    void run.run(target);
  }

  function targetHint(): string | undefined {
    if (target?.kind === 'newClass') return `${target.name} – ${target.section} doesn't exist in ${targetYear?.name ?? 'that year'} yet. It will be created first.`;
    if (isMissingForTeacher && missingClassName) {
      return `${missingClassName} doesn't exist in ${targetYear?.name ?? 'that year'} yet. Ask the school office to create it, or choose another class.`;
    }
    if (isGraduating) return 'They are marked as graduated and their accounts are deactivated, so they can no longer sign in. Their records are kept.';
    return undefined;
  }

  const count = students.length;
  const hasNoLaterYear = targetYears.length === 0;

  return (
    <FormDialog
      isOpen={promotion.dialog !== null}
      onOpenChange={handleOpenChange}
      title={`${isGraduating ? 'Graduate' : 'Promote'} ${pluralize(count, 'student')}`}
      description={`From ${classLabel(sourceClass)}, ${sourceYear?.name ?? 'this year'}.${isGraduating ? '' : ' Their record in this class stays as history.'}`}
      submitLabel={`${isGraduating ? 'Graduate' : 'Promote'} ${pluralize(count, 'student')}`}
      isSubmitting={run.isPending}
      isSubmitDisabled={!target || hasRollIssues}
      formError={run.formError}
      onSubmit={handleSubmit}
      size='lg'
    >
      {hasNoLaterYear && !isGraduating && (
        <FormAlert tone='info' title={`There's no academic year after ${sourceYear?.name ?? 'this one'} yet`}>
          {canCreateClass ? (
            <>
              Create it on the{' '}
              <Link href={ROUTES.admin.academicYears} className='font-medium text-foreground underline underline-offset-3'>
                Academic years
              </Link>{' '}
              page, then promote this class.
            </>
          ) : (
            'Ask the school office to create it, then promote this class.'
          )}
        </FormAlert>
      )}

      {listError && (
        <FormAlert tone='error' title="Couldn't promote">
          {listError}
        </FormAlert>
      )}

      <div className='grid gap-4 sm:grid-cols-2'>
        {!isGraduating && (
          <FormField id='promotion-year' label='Academic year'>
            <OptionSelect
              {...fieldControlProps('promotion-year', undefined)}
              value={yearId}
              onValueChange={handleYearChange}
              options={academicYearOptions(targetYears)}
              placeholder={hasNoLaterYear ? 'No later year yet' : 'Choose a year'}
              isDisabled={hasNoLaterYear || run.isPending}
            />
          </FormField>
        )}
        <FormField
          id='promotion-target'
          label={isFinalClass ? 'Graduate or move to' : 'Move to'}
          description={targetHint()}
          error={run.fieldErrors.targetClassId}
          className={isGraduating ? 'sm:col-span-2' : undefined}
        >
          <OptionSelect
            {...fieldControlProps('promotion-target', run.fieldErrors.targetClassId, Boolean(targetHint()))}
            value={targetChoice}
            onValueChange={handleTargetChange}
            options={targetOptions}
            placeholder={targetOptions.length === 0 ? 'No classes in that year' : 'Choose a class'}
            isDisabled={targetOptions.length === 0 || run.isPending}
          />
        </FormField>
      </div>

      <div className='flex flex-col gap-2'>
        <div className='flex items-baseline justify-between gap-3'>
          <p className='text-sm font-medium text-foreground'>Students</p>
          {!isGraduating && <p className='text-xs text-muted-foreground'>Roll numbers are kept. Change any before promoting.</p>}
        </div>
        <ul aria-label='Students to move' className='scrollbar-subtle max-h-80 divide-y overflow-y-auto border'>
          {students.map((row, index) => {
            const studentId = row.enrollment.studentId;
            const issue = rollIssues[studentId] ?? serverRollIssues[studentId];
            const inputId = `promotion-roll-${studentId}`;
            return (
              <li key={studentId} className='flex flex-col gap-1 px-3 py-2'>
                <div className='flex items-center gap-3'>
                  {!isGraduating && (
                    <Input
                      id={inputId}
                      aria-label={`Roll number of ${row.student?.user.fullName ?? 'this student'}`}
                      aria-invalid={issue ? true : undefined}
                      aria-describedby={issue ? `${inputId}-error` : undefined}
                      value={rollNumbers[studentId] ?? ''}
                      onChange={(event) => handleRollNumberChange(studentId, index, event.target.value)}
                      disabled={run.isPending}
                      inputMode='numeric'
                      placeholder='—'
                      autoComplete='off'
                      className='h-8 w-16 shrink-0 text-center tabular-nums'
                    />
                  )}
                  <span className='min-w-0 flex-1 truncate text-sm font-medium text-foreground'>{row.student?.user.fullName ?? 'Unknown student'}</span>
                  <span className='shrink-0 text-xs text-muted-foreground tabular-nums'>{row.student?.admissionNumber}</span>
                </div>
                {issue && (
                  <p id={`${inputId}-error`} className='text-xs text-destructive'>
                    {issue}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </FormDialog>
  );
}
