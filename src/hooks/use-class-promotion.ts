'use client';

import { useState } from 'react';
import { loadPromotionOptions } from '@/functions/class-promotion';
import { firstMoveByStudent, promotionStanding } from '@/helpers/class-promotion';
import { useAsyncResult } from '@/hooks/use-async-result';
import type { PromotionClass, PromotionRosterRow, PromotionStanding } from '@/types/class-promotion';

interface Selection {
  classId: string;
  studentIds: ReadonlySet<string>;
  /** THE LAST STUDENT CLICKED, FOR SHIFT-CLICK RANGES. */
  anchorId: string | null;
}

interface PromotionDialogState {
  /** A NEW KEY PER OPENING, SO THE DIALOG STARTS FROM FRESH DEFAULTS. */
  key: number;
  studentIds: string[];
}

/**
 * SELECTION AND PROMOTION STATE FOR ONE CLASS ROSTER (ADMIN ENROLLMENTS AND THE CLASS
 * TEACHER'S CLASS PAGE). `rows` IS THE WHOLE ROSTER; `visibleRows` IS WHAT THE TABLE
 * SHOWS (E.G. AFTER A SEARCH) AND DECIDES WHAT "SELECT ALL" AND SHIFT-CLICK COVER.
 * NOTHING LOADS UNLESS `isEnabled` (ONLY ADMINS AND THE CLASS TEACHER MAY PROMOTE).
 */
export function useClassPromotion({
  classId,
  rows,
  visibleRows = rows,
  isEnabled,
}: {
  classId: string | null;
  rows: readonly PromotionRosterRow[] | null;
  visibleRows?: readonly PromotionRosterRow[] | null;
  isEnabled: boolean;
}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [dialog, setDialog] = useState<PromotionDialogState | null>(null);

  const options = useAsyncResult(isEnabled && classId ? `promotion|${classId}` : null, (signal) => loadPromotionOptions(classId ?? '', signal));

  const moves = firstMoveByStudent(options.data?.moves ?? []);
  const laterClassById = new Map<string, PromotionClass>((options.data?.classes ?? []).map((schoolClass) => [schoolClass.id, schoolClass]));
  const standingById = new Map<string, PromotionStanding>((rows ?? []).map((row) => [row.enrollment.studentId, promotionStanding(row, moves)]));
  // UNTIL THE OPTIONS ARE LOADED NOBODY IS KNOWN TO BE ELIGIBLE (A STUDENT MAY ALREADY HAVE MOVED).
  const isReady = isEnabled && options.data !== null && !options.isLoading;
  const eligibleIds = isReady ? (rows ?? []).filter((row) => standingById.get(row.enrollment.studentId)?.kind === 'eligible').map((row) => row.enrollment.studentId) : [];
  const eligibleSet = new Set(eligibleIds);
  const visibleEligibleIds = (visibleRows ?? []).map((row) => row.enrollment.studentId).filter((studentId) => eligibleSet.has(studentId));

  // A SELECTION BELONGS TO ITS CLASS, AND ONLY STUDENTS WHO CAN STILL MOVE COUNT.
  const currentSelection = selection && selection.classId === classId ? selection : null;
  const selectedIds = eligibleIds.filter((studentId) => currentSelection?.studentIds.has(studentId));
  const selectedSet = new Set(selectedIds);
  const isEveryVisibleSelected = visibleEligibleIds.length > 0 && visibleEligibleIds.every((studentId) => selectedSet.has(studentId));
  const isSomeVisibleSelected = visibleEligibleIds.some((studentId) => selectedSet.has(studentId));

  function standingOf(studentId: string): PromotionStanding | null {
    return standingById.get(studentId) ?? null;
  }

  function isSelected(studentId: string): boolean {
    return selectedSet.has(studentId);
  }

  function select(studentIds: ReadonlySet<string>, anchorId: string | null) {
    if (!classId) return;
    setSelection({ classId, studentIds, anchorId });
  }

  /** SHIFT-CLICK SETS EVERY STUDENT BETWEEN THE LAST CLICKED ONE AND THIS ONE TO THIS ONE'S NEW STATE. */
  function toggleStudent(studentId: string, isRange: boolean) {
    if (!eligibleSet.has(studentId)) return;
    const next = new Set(selectedSet);
    const isSelecting = !selectedSet.has(studentId);
    const anchorIndex = currentSelection?.anchorId ? visibleEligibleIds.indexOf(currentSelection.anchorId) : -1;
    const index = visibleEligibleIds.indexOf(studentId);
    const range = isRange && anchorIndex !== -1 && index !== -1 ? visibleEligibleIds.slice(Math.min(anchorIndex, index), Math.max(anchorIndex, index) + 1) : [studentId];
    for (const id of range) {
      if (isSelecting) next.add(id);
      else next.delete(id);
    }
    select(next, studentId);
  }

  function toggleAllVisible() {
    const next = new Set(selectedSet);
    for (const studentId of visibleEligibleIds) {
      if (isEveryVisibleSelected) next.delete(studentId);
      else next.add(studentId);
    }
    select(next, null);
  }

  function clearSelection() {
    setSelection(null);
  }

  function openDialog(studentIds: string[]) {
    if (studentIds.length === 0) return;
    setDialog((current) => ({ key: (current?.key ?? 0) + 1, studentIds }));
  }

  function openForClass() {
    openDialog(eligibleIds);
  }

  function openForSelection() {
    openDialog(selectedIds);
  }

  function closeDialog() {
    setDialog((current) => (current ? { ...current, studentIds: [] } : null));
  }

  /** AFTER STUDENTS MOVED: THE SELECTION IS DONE WITH AND THE "NEXT YEAR" COLUMN IS RELOADED. */
  function finish() {
    setSelection(null);
    closeDialog();
    options.reload();
  }

  return {
    isEnabled,
    isReady,
    options: options.data,
    optionsError: options.errorMessage,
    reloadOptions: options.reload,
    laterClassById,
    standingOf,
    eligibleIds,
    selectedIds,
    isSelected,
    isEveryVisibleSelected,
    isSomeVisibleSelected,
    hasVisibleEligible: visibleEligibleIds.length > 0,
    toggleStudent,
    toggleAllVisible,
    clearSelection,
    dialog: dialog && dialog.studentIds.length > 0 ? dialog : null,
    dialogKey: dialog?.key ?? 0,
    openForClass,
    openForSelection,
    closeDialog,
    finish,
  };
}

export type ClassPromotion = ReturnType<typeof useClassPromotion>;
