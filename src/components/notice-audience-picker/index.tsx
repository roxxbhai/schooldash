'use client';

import { useState } from 'react';
import { OptionSelect } from '@/components/option-select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldError } from '@/components/ui/field';
import { AUDIENCE_ROLES, MAX_NOTICE_AUDIENCES } from '@/constants/admin-notices';
import { pluralize } from '@/helpers/format';
import { academicYearOptions, classLabel, sortClasses } from '@/helpers/reference-labels';
import { useReferenceData } from '@/hooks/use-reference-data';
import type { AudienceSelection } from '@/types/admin-notices';
import type { AppRole } from '@/types/auth';

interface NoticeAudiencePickerProps {
  id: string;
  value: AudienceSelection;
  onChange: (value: AudienceSelection) => void;
  error?: string;
  isDisabled?: boolean;
}

/**
 * WHO A NOTICE IS ADDRESSED TO: WHOLE ROLES AND/OR INDIVIDUAL CLASSES. THE NOTICE
 * REACHES THE UNION OF EVERYTHING CHOSEN. CLASSES ARE LISTED ONE ACADEMIC YEAR AT
 * A TIME (THE CURRENT ONE FIRST); CHOICES IN OTHER YEARS ARE KEPT.
 */
export function NoticeAudiencePicker({ id, value, onChange, error, isDisabled = false }: NoticeAudiencePickerProps) {
  const [yearChoice, setYearChoice] = useState<string | null>(null);

  const { academicYears, classes, classById, currentAcademicYear } = useReferenceData();

  const selectedYearId = yearChoice ?? currentAcademicYear?.id ?? academicYears[0]?.id ?? null;
  const yearClasses = sortClasses(classes.filter((schoolClass) => schoolClass.academicYearId === selectedYearId));
  const selectedClassIds = new Set(value.classIds);
  const otherYearClassCount = value.classIds.filter((classId) => classById.get(classId)?.academicYearId !== selectedYearId).length;
  const total = value.roles.length + value.classIds.length;
  const isEveryYearClassChosen = yearClasses.length > 0 && yearClasses.every((schoolClass) => selectedClassIds.has(schoolClass.id));

  function toggleRole(role: AppRole, isChecked: boolean) {
    const roles = isChecked ? [...value.roles, role] : value.roles.filter((current) => current !== role);
    onChange({ ...value, roles });
  }

  function toggleClass(classId: string, isChecked: boolean) {
    const classIds = isChecked ? [...value.classIds, classId] : value.classIds.filter((current) => current !== classId);
    onChange({ ...value, classIds });
  }

  function toggleYearClasses() {
    const yearClassIds = new Set(yearClasses.map((schoolClass) => schoolClass.id));
    const kept = value.classIds.filter((classId) => !yearClassIds.has(classId));
    onChange({ ...value, classIds: isEveryYearClassChosen ? kept : [...kept, ...yearClassIds] });
  }

  return (
    <fieldset
      id={id}
      className='flex flex-col gap-4 border p-4'
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : `${id}-summary`}
      disabled={isDisabled}
    >
      <legend className='px-1 text-sm font-medium text-foreground'>Audience</legend>

      <div className='flex flex-col gap-2'>
        <p className='text-xs font-medium text-muted-foreground'>Everyone with a role</p>
        <div className='grid gap-2 sm:grid-cols-3'>
          {AUDIENCE_ROLES.map((option) => (
            <label key={option.role} htmlFor={`${id}-role-${option.role}`} className='flex cursor-pointer items-start gap-2.5 border bg-card p-3 hover:bg-surface-muted'>
              <Checkbox
                id={`${id}-role-${option.role}`}
                checked={value.roles.includes(option.role)}
                onCheckedChange={(checked) => toggleRole(option.role, checked === true)}
                disabled={isDisabled}
                className='mt-0.5'
              />
              <span className='min-w-0'>
                <span className='block text-sm font-medium text-foreground'>{option.label}</span>
                <span className='block text-xs text-muted-foreground'>{option.description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className='flex flex-col gap-2'>
        <div className='flex flex-wrap items-end justify-between gap-2'>
          <div>
            <p className='text-xs font-medium text-muted-foreground'>Individual classes</p>
            <p className='text-xs text-muted-foreground'>Reaches the class&apos;s students and the teachers who teach it.</p>
          </div>
          <div className='flex items-center gap-2'>
            <OptionSelect
              aria-label='Academic year of the classes'
              value={selectedYearId}
              onValueChange={setYearChoice}
              options={academicYearOptions(academicYears)}
              placeholder='Academic year'
              isDisabled={isDisabled || academicYears.length === 0}
              className='w-48'
            />
            <Button type='button' variant='outline' size='sm' onClick={toggleYearClasses} disabled={isDisabled || yearClasses.length === 0}>
              {isEveryYearClassChosen ? 'Clear year' : 'Select all'}
            </Button>
          </div>
        </div>
        {yearClasses.length === 0 ? (
          <p className='border border-dashed px-3 py-4 text-center text-sm text-muted-foreground'>No classes in this academic year.</p>
        ) : (
          <div className='grid max-h-56 grid-cols-2 gap-1 overflow-y-auto border bg-card p-2 sm:grid-cols-4'>
            {yearClasses.map((schoolClass) => (
              <label
                key={schoolClass.id}
                htmlFor={`${id}-class-${schoolClass.id}`}
                className='flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm hover:bg-surface-muted'
              >
                <Checkbox
                  id={`${id}-class-${schoolClass.id}`}
                  checked={selectedClassIds.has(schoolClass.id)}
                  onCheckedChange={(checked) => toggleClass(schoolClass.id, checked === true)}
                  disabled={isDisabled}
                />
                {classLabel(schoolClass)}
              </label>
            ))}
          </div>
        )}
      </div>

      <p id={`${id}-summary`} className='text-xs text-muted-foreground' aria-live='polite'>
        {total === 0 ? 'No audience chosen yet. A notice needs at least one before it can be published.' : `${pluralize(total, 'audience')} chosen`}
        {otherYearClassCount > 0 && `, including ${pluralize(otherYearClassCount, 'class', 'classes')} in other years`}
        {total > 0 && ` (at most ${MAX_NOTICE_AUDIENCES}).`}
      </p>
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </fieldset>
  );
}
