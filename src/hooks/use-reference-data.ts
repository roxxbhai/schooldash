'use client';

import { useEffect, useMemo } from 'react';
import { refreshReferenceData } from '@/functions/reference-data';
import { referenceDataStore } from '@/zustand/reference-data';

/**
 * ACADEMIC YEARS, CLASSES, SUBJECTS AND TEACHERS, PLUS LOOKUPS BY ID.
 * LOADED ONCE PER SESSION; CALL refreshReferenceData() AFTER CHANGING ONE OF THEM.
 */
export function useReferenceData() {
  const academicYears = referenceDataStore((state) => state.academicYears);
  const classes = referenceDataStore((state) => state.classes);
  const subjects = referenceDataStore((state) => state.subjects);
  const teachers = referenceDataStore((state) => state.teachers);
  const status = referenceDataStore((state) => state.status);
  const errorMessage = referenceDataStore((state) => state.errorMessage);

  const lookups = useMemo(
    () => ({
      academicYearById: new Map(academicYears.map((year) => [year.id, year])),
      classById: new Map(classes.map((schoolClass) => [schoolClass.id, schoolClass])),
      subjectById: new Map(subjects.map((subject) => [subject.id, subject])),
      teacherById: new Map(teachers.map((teacher) => [teacher.id, teacher])),
      currentAcademicYear: academicYears.find((year) => year.isCurrent) ?? null,
    }),
    [academicYears, classes, subjects, teachers],
  );

  useEffect(() => {
    if (referenceDataStore.getState().status === 'idle') void refreshReferenceData();
  }, []);

  return {
    academicYears,
    classes,
    subjects,
    teachers,
    ...lookups,
    isReady: status === 'ready' || status === 'refreshing',
    isLoading: status === 'idle' || status === 'loading',
    isRefreshing: status === 'refreshing',
    errorMessage: status === 'error' ? errorMessage : null,
  };
}
