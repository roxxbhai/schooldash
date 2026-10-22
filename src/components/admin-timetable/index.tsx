'use client';

import { CalendarClockIcon, PlusIcon, RefreshCwIcon, Trash2Icon, UserRoundIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { FormAlert } from '@/components/form-alert';
import { FormDialog } from '@/components/form-dialog';
import { FormField } from '@/components/form-field';
import { OptionSelect } from '@/components/option-select';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TimetableSkeleton, TimetableWeek } from '@/components/timetable-week';
import { EMPTY_TIMETABLE_FORM, TIMETABLE_FORM_SCHEMA, TIMETABLE_VIEWS, type TimetableForm, type TimetableValues, type TimetableView } from '@/constants/admin-timetable';
import { ROUTES } from '@/constants/routes';
import {
  createTimetableEntry,
  deleteTimetableEntry,
  loadEligibleTeacherIds,
  loadTimetable,
  updateTimetableEntry,
} from '@/functions/admin-timetable';
import { refreshReferenceData } from '@/functions/reference-data';
import { periodTimeRange, suggestNextPeriod } from '@/helpers/admin-timetable';
import { cn } from '@/helpers/cn';
import { WEEKDAYS, formatTime, weekdayLabel } from '@/helpers/format';
import { fieldControlProps, withoutKey, zodFieldErrors } from '@/helpers/forms';
import { academicYearOptions, classLabel, classOptions, subjectLabel, subjectOptions, teacherLabel, teacherOptions } from '@/helpers/reference-labels';
import { useAsyncResult } from '@/hooks/use-async-result';
import { useMutation } from '@/hooks/use-mutation';
import { useReferenceData } from '@/hooks/use-reference-data';
import type { TimetableEntry } from '@/types/timetable';

const DAY_OPTIONS = WEEKDAYS.map((day) => ({ value: String(day.value), label: day.label }));

/**
 * THE WEEKLY TIMETABLE, BY CLASS OR BY TEACHER: VIEW, ADD, EDIT AND REMOVE
 * PERIODS. THE SERVER REJECTS OVERLAPPING PERIODS (409) AND TEACHERS WHO AREN'T
 * ASSIGNED TO THE CLASS AND SUBJECT (422); BOTH MESSAGES ARE SHOWN IN THE FORM.
 */
export function AdminTimetable() {
  const [view, setView] = useState<TimetableView>(TIMETABLE_VIEWS.byClass);
  const [yearChoice, setYearChoice] = useState<string | null>(null);
  const [classChoice, setClassChoice] = useState<string | null>(null);
  const [teacherChoice, setTeacherChoice] = useState<string | null>(null);
  const [editing, setEditing] = useState<TimetableEntry | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<TimetableForm>(EMPTY_TIMETABLE_FORM);
  const [deleting, setDeleting] = useState<TimetableEntry | null>(null);

  const reference = useReferenceData();
  const { academicYears, classes, subjects, teachers, classById, subjectById, teacherById, currentAcademicYear, isReady } = reference;

  // THE CLASS FILTER FOLLOWS THE YEAR: WITHOUT AN EXPLICIT CHOICE (OR WHEN IT BELONGS TO ANOTHER YEAR), THE FIRST CLASS IS SHOWN.
  const selectedYearId = yearChoice ?? currentAcademicYear?.id ?? null;
  const yearClassOptions = classOptions(classes, selectedYearId);
  const selectedClassId = yearClassOptions.some((option) => option.value === classChoice) ? classChoice : (yearClassOptions[0]?.value ?? null);
  const isClassView = view === TIMETABLE_VIEWS.byClass;
  const timetableQuery = isClassView
    ? selectedClassId && { classId: selectedClassId }
    : teacherChoice && { teacherId: teacherChoice, academicYearId: selectedYearId };

  const timetable = useAsyncResult(isReady && timetableQuery ? `timetable|${JSON.stringify(timetableQuery)}` : null, () =>
    loadTimetable(timetableQuery || {}),
  );
  const eligible = useAsyncResult(isFormOpen && form.classId && form.subjectId ? `eligible|${form.classId}|${form.subjectId}` : null, () =>
    loadEligibleTeacherIds(form.classId, form.subjectId),
  );

  const save = useMutation((values: TimetableValues) => (editing ? updateTimetableEntry(editing.id, values) : createTimetableEntry(values)), {
    successMessage: (entry) =>
      `${editing ? 'Saved' : 'Added'} ${subjectLabel(subjectById.get(entry.subjectId))} on ${weekdayLabel(entry.dayOfWeek)}, ${periodTimeRange(entry)}.`,
    onSuccess: () => {
      setIsFormOpen(false);
      timetable.reload();
    },
  });

  const remove = useMutation((entry: TimetableEntry) => deleteTimetableEntry(entry.id), {
    successMessage: (entry) => `Removed ${subjectLabel(subjectById.get(entry.subjectId))} on ${weekdayLabel(entry.dayOfWeek)}, ${periodTimeRange(entry)}.`,
    onSuccess: () => {
      setDeleting(null);
      timetable.reload();
    },
  });

  const entries = timetable.data ?? [];
  const selectedClass = selectedClassId ? classById.get(selectedClassId) : undefined;
  const formYearId = editing?.academicYearId ?? selectedYearId;
  const eligibleIds = eligible.isLoading ? [] : (eligible.data ?? []);
  const eligibleTeachers = teachers.filter((teacher) => eligibleIds.includes(teacher.id));
  const isTeacherPickable = Boolean(form.classId && form.subjectId) && !eligible.isLoading && !eligible.errorMessage;
  const isWithoutEligibleTeacher = isTeacherPickable && eligibleTeachers.length === 0;
  const isAddPeriodAvailable = isReady && classes.length > 0 && subjects.length > 0;

  function teacherHint() {
    if (!form.classId || !form.subjectId) return 'Choose the class and subject first. Only teachers assigned to both are listed.';
    if (eligible.isLoading) return 'Loading the teachers assigned to this class and subject…';
    if (eligible.errorMessage) return `Couldn't load the assigned teachers: ${eligible.errorMessage}`;
    if (isWithoutEligibleTeacher) {
      return (
        <>
          No teacher is assigned to this subject in this class. Save it as an unstaffed period, or{' '}
          <Link href={ROUTES.admin.teacherAssignments} className='font-medium text-primary underline underline-offset-2'>
            assign a teacher
          </Link>{' '}
          first.
        </>
      );
    }
    return 'Only teachers assigned to this class and subject are listed.';
  }

  function handleYearChange(value: string | null) {
    setYearChoice(value);
    setClassChoice(null);
  }

  function openCreate() {
    setEditing(null);
    const classId = isClassView ? (selectedClassId ?? '') : '';
    setForm({ ...EMPTY_TIMETABLE_FORM, classId, ...suggestedTimes(classId, EMPTY_TIMETABLE_FORM.dayOfWeek) });
    save.reset();
    setIsFormOpen(true);
  }

  function openEdit(entry: TimetableEntry) {
    setEditing(entry);
    setForm({
      classId: entry.classId,
      dayOfWeek: String(entry.dayOfWeek),
      startTime: formatTime(entry.startTime),
      endTime: formatTime(entry.endTime),
      subjectId: entry.subjectId,
      teacherId: entry.teacherId,
      room: entry.room ?? '',
    });
    save.reset();
    setIsFormOpen(true);
  }

  /** ONLY THE CLASS SHOWN ON THE PAGE HAS ITS PERIODS LOADED, SO ONLY IT GETS SUGGESTED TIMES. */
  function suggestedTimes(classId: string, dayOfWeek: string) {
    if (!isClassView || !classId || classId !== selectedClassId || !dayOfWeek) return { startTime: '', endTime: '' };
    return suggestNextPeriod(entries, Number(dayOfWeek));
  }

  /** ON CREATE, SUGGESTED (OR EMPTY) TIMES FOLLOW THE CLASS AND DAY; TYPED TIMES ARE KEPT. */
  function setSlotField(field: 'classId' | 'dayOfWeek', value: string) {
    const previous = suggestedTimes(form.classId, form.dayOfWeek);
    const isSuggested = !editing && form.startTime === previous.startTime && form.endTime === previous.endTime;
    setField(field, value);
    if (!isSuggested) return;
    const slot = { classId: form.classId, dayOfWeek: form.dayOfWeek, [field]: value };
    setForm((current) => ({ ...current, ...suggestedTimes(slot.classId, slot.dayOfWeek) }));
  }

  function setField<K extends keyof TimetableForm>(field: K, value: TimetableForm[K]) {
    // A TEACHER IS ASSIGNED PER CLASS AND SUBJECT, SO CHANGING EITHER CLEARS THE TEACHER.
    const isStaffingChange = field === 'classId' || field === 'subjectId';
    setForm((current) => ({ ...current, [field]: value, ...(isStaffingChange ? { teacherId: null } : {}) }));
    save.setFieldErrors((errors) => withoutKey(isStaffingChange ? withoutKey(errors, 'teacherId') : errors, field));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = TIMETABLE_FORM_SCHEMA.safeParse(form);
    if (!parsed.success) {
      save.setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }
    void save.run(parsed.data);
  }

  function startDelete() {
    if (!editing) return;
    setDeleting(editing);
    remove.reset();
    setIsFormOpen(false);
  }

  function closeDelete(isOpen: boolean) {
    if (isOpen) return;
    setDeleting(null);
    remove.reset();
  }

  function confirmDelete() {
    if (deleting) void remove.run(deleting);
  }

  function renderPeriod(entry: TimetableEntry) {
    const subject = subjectLabel(subjectById.get(entry.subjectId));
    const teacher = entry.teacherId ? teacherLabel(teacherById.get(entry.teacherId)) : null;
    const schoolClass = classLabel(classById.get(entry.classId));
    return (
      <button
        type='button'
        onClick={() => openEdit(entry)}
        aria-label={`Edit ${subject}, ${isClassView ? '' : `class ${schoolClass}, `}${weekdayLabel(entry.dayOfWeek)} ${periodTimeRange(entry)}`}
        className='flex w-full flex-col gap-0.5 border border-l-2 border-l-primary bg-card px-2.5 py-2 text-left transition-colors outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring/50'
      >
        <span className='tabular-nums text-xs text-muted-foreground'>{periodTimeRange(entry)}</span>
        <span className='line-clamp-2 text-sm font-medium text-foreground'>{subject}</span>
        {!isClassView && <span className='text-xs text-foreground'>Class {schoolClass}</span>}
        {isClassView && <span className={cn('truncate text-xs', teacher ? 'text-muted-foreground' : 'text-warning')}>{teacher ?? 'No teacher'}</span>}
        {entry.room && <span className='truncate tabular-nums text-xs text-muted-foreground'>Room {entry.room}</span>}
      </button>
    );
  }

  function renderWeek() {
    if (!isReady || timetable.isInitialLoading) return <TimetableSkeleton />;
    if (isClassView && !selectedClassId) {
      return (
        <EmptyState
          className='border bg-card'
          icon={CalendarClockIcon}
          title={academicYears.length === 0 ? 'Create an academic year first' : 'No classes in this year'}
          description='A timetable belongs to a class. Add the classes for this year first.'
          action={
            <Button asChild variant='outline'>
              <Link href={academicYears.length === 0 ? ROUTES.admin.academicYears : ROUTES.admin.classes}>
                {academicYears.length === 0 ? 'Go to academic years' : 'Go to classes'}
              </Link>
            </Button>
          }
        />
      );
    }
    if (!isClassView && !teacherChoice) {
      return (
        <EmptyState
          className='border bg-card'
          icon={UserRoundIcon}
          title={teachers.length === 0 ? 'No teachers yet' : 'Choose a teacher'}
          description={teachers.length === 0 ? 'Add teachers to see their weekly periods.' : 'Pick a teacher above to see their week across every class they teach.'}
        />
      );
    }
    if (timetable.errorMessage) {
      return (
        <FormAlert tone='error' title="Couldn't load the timetable">
          <span>{timetable.errorMessage}</span>
          <Button variant='outline' size='sm' className='mt-2 flex' onClick={timetable.reload}>
            <RefreshCwIcon aria-hidden />
            Try again
          </Button>
        </FormAlert>
      );
    }
    if (entries.length === 0) {
      return (
        <EmptyState
          className='border bg-card'
          icon={CalendarClockIcon}
          title={isClassView ? `No periods for ${classLabel(selectedClass)} yet` : 'No periods for this teacher'}
          description={
            isClassView
              ? 'Add the periods of a normal week. Each one repeats every week of the academic year.'
              : 'Periods are added per class. Assign this teacher to a period from a class timetable or with Add period.'
          }
          action={isAddPeriodAvailable ? <Button onClick={openCreate}>Add period</Button> : undefined}
        />
      );
    }
    return (
      <div className={cn(timetable.isLoading && 'opacity-60 transition-opacity')} aria-busy={timetable.isLoading}>
        <TimetableWeek entries={entries} renderPeriod={renderPeriod} />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title='Timetable'
        description='The weekly periods of each class. Times are school-local, and each period repeats every week.'
        actions={
          <Button onClick={openCreate} disabled={!isAddPeriodAvailable}>
            <PlusIcon aria-hidden />
            Add period
          </Button>
        }
      />

      {reference.errorMessage && (
        <FormAlert tone='error' title="Couldn't load classes, subjects and teachers" className='mb-4'>
          <span>{reference.errorMessage}</span>
          <Button variant='outline' size='sm' className='mt-2 flex' onClick={() => void refreshReferenceData()}>
            <RefreshCwIcon aria-hidden />
            Try again
          </Button>
        </FormAlert>
      )}

      <Tabs value={view} onValueChange={(value) => setView(value as TimetableView)} className='gap-4'>
        <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
          <TabsList aria-label='Timetable view'>
            <TabsTrigger value={TIMETABLE_VIEWS.byClass} className='px-3'>
              By class
            </TabsTrigger>
            <TabsTrigger value={TIMETABLE_VIEWS.byTeacher} className='px-3'>
              By teacher
            </TabsTrigger>
          </TabsList>
          <div className='flex flex-col gap-2 sm:flex-row'>
            <OptionSelect
              aria-label='Academic year'
              value={selectedYearId}
              onValueChange={handleYearChange}
              options={academicYearOptions(academicYears)}
              placeholder='Academic year'
              isDisabled={!isReady || academicYears.length === 0}
              className='sm:w-48'
            />
            {isClassView ? (
              <OptionSelect
                aria-label='Class'
                value={selectedClassId}
                onValueChange={setClassChoice}
                options={yearClassOptions}
                placeholder='Choose a class'
                isDisabled={!isReady || yearClassOptions.length === 0}
                className='sm:w-48'
              />
            ) : (
              <OptionSelect
                aria-label='Teacher'
                value={teacherChoice}
                onValueChange={setTeacherChoice}
                options={teacherOptions(teachers, teacherChoice)}
                placeholder='Choose a teacher'
                isDisabled={!isReady || teachers.length === 0}
                className='sm:w-64'
              />
            )}
          </div>
        </div>
        <TabsContent value={TIMETABLE_VIEWS.byClass}>{isClassView && renderWeek()}</TabsContent>
        <TabsContent value={TIMETABLE_VIEWS.byTeacher}>{!isClassView && renderWeek()}</TabsContent>
      </Tabs>

      <FormDialog
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editing ? 'Edit period' : 'Add period'}
        description={editing ? undefined : 'The period repeats every week. A class or teacher can’t have two periods at the same time.'}
        submitLabel={editing ? 'Save changes' : 'Add period'}
        isSubmitting={save.isPending}
        formError={save.formError}
        onSubmit={handleSubmit}
      >
        <div className='grid gap-4 sm:grid-cols-2'>
          <FormField id='classId' label='Class' error={save.fieldErrors.classId} isRequired>
            <OptionSelect
              {...fieldControlProps('classId', save.fieldErrors.classId)}
              value={form.classId || null}
              onValueChange={(value) => setSlotField('classId', value ?? '')}
              options={classOptions(classes, formYearId)}
              placeholder='Choose a class'
            />
          </FormField>
          <FormField id='dayOfWeek' label='Day' error={save.fieldErrors.dayOfWeek} isRequired>
            <OptionSelect
              {...fieldControlProps('dayOfWeek', save.fieldErrors.dayOfWeek)}
              value={form.dayOfWeek || null}
              onValueChange={(value) => setSlotField('dayOfWeek', value ?? '')}
              options={DAY_OPTIONS}
              placeholder='Choose a day'
            />
          </FormField>
        </div>
        <div className='grid gap-4 sm:grid-cols-2'>
          <FormField id='startTime' label='Starts' error={save.fieldErrors.startTime} isRequired>
            <Input
              {...fieldControlProps('startTime', save.fieldErrors.startTime)}
              type='time'
              value={form.startTime}
              onChange={(event) => setField('startTime', event.target.value)}
              className='tabular-nums'
            />
          </FormField>
          <FormField id='endTime' label='Ends' error={save.fieldErrors.endTime} isRequired>
            <Input
              {...fieldControlProps('endTime', save.fieldErrors.endTime)}
              type='time'
              value={form.endTime}
              onChange={(event) => setField('endTime', event.target.value)}
              className='tabular-nums'
            />
          </FormField>
        </div>
        <FormField id='subjectId' label='Subject' error={save.fieldErrors.subjectId} isRequired>
          <OptionSelect
            {...fieldControlProps('subjectId', save.fieldErrors.subjectId)}
            value={form.subjectId || null}
            onValueChange={(value) => setField('subjectId', value ?? '')}
            options={subjectOptions(subjects)}
            placeholder='Choose a subject'
          />
        </FormField>
        <FormField id='teacherId' label='Teacher' description={teacherHint()} error={save.fieldErrors.teacherId}>
          <OptionSelect
            {...fieldControlProps('teacherId', save.fieldErrors.teacherId, true)}
            value={form.teacherId}
            onValueChange={(value) => setField('teacherId', value)}
            options={teacherOptions(eligibleTeachers, form.teacherId)}
            placeholder={eligible.isLoading ? 'Loading teachers…' : 'No teacher (unstaffed)'}
            emptyLabel='No teacher (unstaffed)'
            isDisabled={!isTeacherPickable}
          />
        </FormField>
        <FormField id='room' label='Room' description='Optional. A label only; rooms aren’t checked for clashes.' error={save.fieldErrors.room}>
          <Input
            {...fieldControlProps('room', save.fieldErrors.room, true)}
            value={form.room}
            onChange={(event) => setField('room', event.target.value)}
            className='tabular-nums'
            autoComplete='off'
          />
        </FormField>
        {editing && (
          <div className='flex flex-wrap items-center justify-between gap-3 border-t pt-4'>
            <p className='text-sm text-muted-foreground'>Remove this period from every week.</p>
            <Button type='button' variant='outline' className='text-destructive hover:text-destructive' onClick={startDelete} disabled={save.isPending}>
              <Trash2Icon aria-hidden />
              Delete period
            </Button>
          </div>
        )}
      </FormDialog>

      <ConfirmDialog
        isOpen={deleting !== null}
        onOpenChange={closeDelete}
        title='Delete this period?'
        description={
          deleting ? (
            <>
              {subjectLabel(subjectById.get(deleting.subjectId))} for class {classLabel(classById.get(deleting.classId))} on {weekdayLabel(deleting.dayOfWeek)},{' '}
              <span className='tabular-nums'>{periodTimeRange(deleting)}</span>, will be removed from the weekly timetable.
            </>
          ) : (
            ''
          )
        }
        confirmLabel='Delete period'
        tone='destructive'
        isPending={remove.isPending}
        errorMessage={remove.formError}
        onConfirm={confirmDelete}
      />
    </>
  );
}
