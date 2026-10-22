'use client';

import { useState } from 'react';
import { OptionSelect } from '@/components/option-select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldError } from '@/components/ui/field';
import { ALL_CLASS_FILTER, AUDIENCE_ROLES, MAX_NOTICE_AUDIENCES } from '@/constants/admin-notices';
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
 * A TIME (THE CURRENT ONE FIRST) AND CAN BE NARROWED BY CLASS AND SECTION; CHOICES
 * HIDDEN BY THE FILTERS ARE KEPT.
 */
export function NoticeAudiencePicker({ id, value, onChange, error, isDisabled = false }: NoticeAudiencePickerProps) {
  const [yearChoice, setYearChoice] = useState<string | null>(null);
  const [gradeFilter, setGradeFilter] = useState(ALL_CLASS_FILTER);
  const [sectionFilter, setSectionFilter] = useState(ALL_CLASS_FILTER);

  const { academicYears, classes, currentAcademicYear } = useReferenceData();

  const selectedYearId = yearChoice ?? currentAcademicYear?.id ?? academicYears[0]?.id ?? null;
  const yearClasses = sortClasses(classes.filter((schoolClass) => schoolClass.academicYearId === selectedYearId));
  const gradeOptions = [...new Set(yearClasses.map((schoolClass) => schoolClass.name))].map((grade) => ({ value: grade, label: `Class ${grade}` }));
  const sectionOptions = [...new Set(yearClasses.map((schoolClass) => schoolClass.section))].sort().map((section) => ({ value: section, label: `Section ${section}` }));
  const shownClasses = yearClasses.filter(
    (schoolClass) =>
      (gradeFilter === ALL_CLASS_FILTER || schoolClass.name === gradeFilter) && (sectionFilter === ALL_CLASS_FILTER || schoolClass.section === sectionFilter),
  );
  const isFiltered = gradeFilter !== ALL_CLASS_FILTER || sectionFilter !== ALL_CLASS_FILTER;
  const selectedClassIds = new Set(value.classIds);
  const hiddenClassCount = value.classIds.filter((classId) => !shownClasses.some((schoolClass) => schoolClass.id === classId)).length;
  const total = value.roles.length + value.classIds.length;
  const isEveryShownClassChosen = shownClasses.length > 0 && shownClasses.every((schoolClass) => selectedClassIds.has(schoolClass.id));

  function toggleRole(role: AppRole, isChecked: boolean) {
    const roles = isChecked ? [...value.roles, role] : value.roles.filter((current) => current !== role);
    onChange({ ...value, roles });
  }

  function toggleClass(classId: string, isChecked: boolean) {
    const classIds = isChecked ? [...value.classIds, classId] : value.classIds.filter((current) => current !== classId);
    onChange({ ...value, classIds });
  }

  function toggleShownClasses() {
    const shownClassIds = new Set(shownClasses.map((schoolClass) => schoolClass.id));
    const kept = value.classIds.filter((classId) => !shownClassIds.has(classId));
    onChange({ ...value, classIds: isEveryShownClassChosen ? kept : [...kept, ...shownClassIds] });
  }

  function handleYearChange(yearId: string | null) {
    setYearChoice(yearId);
    setGradeFilter(ALL_CLASS_FILTER);
    setSectionFilter(ALL_CLASS_FILTER);
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
        <div className='grid gap-2 sm:grid-cols-2'>
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
        <div>
          <p className='text-xs font-medium text-muted-foreground'>Individual classes</p>
          <p className='text-xs text-muted-foreground'>Reaches the class&apos;s students and the teachers who teach it.</p>
        </div>
        <div className='grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]'>
          <OptionSelect
            aria-label='Academic year of the classes'
            value={selectedYearId}
            onValueChange={handleYearChange}
            options={academicYearOptions(academicYears)}
            placeholder='Academic year'
            isDisabled={isDisabled || academicYears.length === 0}
          />
          <OptionSelect
            aria-label='Class'
            value={gradeFilter === ALL_CLASS_FILTER ? null : gradeFilter}
            onValueChange={(grade) => setGradeFilter(grade ?? ALL_CLASS_FILTER)}
            options={gradeOptions}
            placeholder='All classes'
            emptyLabel='All classes'
            isDisabled={isDisabled || yearClasses.length === 0}
          />
          <OptionSelect
            aria-label='Section'
            value={sectionFilter === ALL_CLASS_FILTER ? null : sectionFilter}
            onValueChange={(section) => setSectionFilter(section ?? ALL_CLASS_FILTER)}
            options={sectionOptions}
            placeholder='All sections'
            emptyLabel='All sections'
            isDisabled={isDisabled || yearClasses.length === 0}
          />
          <Button type='button' variant='outline' onClick={toggleShownClasses} disabled={isDisabled || shownClasses.length === 0}>
            {isEveryShownClassChosen ? 'Clear' : isFiltered ? 'Select shown' : 'Select all'}
          </Button>
        </div>
        {shownClasses.length === 0 ? (
          <p className='border border-dashed px-3 py-4 text-center text-sm text-muted-foreground'>
            {yearClasses.length === 0 ? 'No classes in this academic year.' : 'No classes match this class and section.'}
          </p>
        ) : (
          <div className='scrollbar-subtle grid max-h-56 grid-cols-2 gap-1 overflow-y-auto border bg-card p-2 sm:grid-cols-4'>
            {shownClasses.map((schoolClass) => (
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
        {hiddenClassCount > 0 && `, including ${pluralize(hiddenClassCount, 'class', 'classes')} not shown by the filters above`}
        {total > 0 && ` (at most ${MAX_NOTICE_AUDIENCES}).`}
      </p>
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </fieldset>
  );
}
