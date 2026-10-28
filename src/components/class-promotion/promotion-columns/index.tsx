'use client';

import type { DataTableColumn } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { Checkbox } from '@/components/ui/checkbox';
import { formatDate } from '@/helpers/format';
import { promotionClassLabel } from '@/helpers/class-promotion';
import type { AcademicYear } from '@/types/academic-years';
import type { PromotionRosterRow } from '@/types/class-promotion';
import type { ClassPromotion } from '@/hooks/use-class-promotion';

/** THE SELECT-ALL BOX: TICKED, EMPTY, OR A MINUS WHEN ONLY SOME STUDENTS ARE SELECTED. */
function SelectAllCheckbox({ promotion }: { promotion: ClassPromotion }) {
  const checked = promotion.isEveryVisibleSelected ? true : promotion.isSomeVisibleSelected ? 'indeterminate' : false;

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    promotion.toggleAllVisible();
  }

  return (
    <Checkbox
      checked={checked}
      onClick={handleClick}
      disabled={!promotion.hasVisibleEligible}
      aria-label={promotion.isEveryVisibleSelected ? 'Clear the selection' : 'Select every student who can be promoted'}
    />
  );
}

/** ONE STUDENT'S BOX. SHIFT-CLICK SELECTS (OR CLEARS) EVERYONE SINCE THE LAST BOX CLICKED. */
function StudentCheckbox({ promotion, row }: { promotion: ClassPromotion; row: PromotionRosterRow }) {
  const studentId = row.enrollment.studentId;
  const isEligible = promotion.standingOf(studentId)?.kind === 'eligible' && promotion.isReady;

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    // THE BOX IS CONTROLLED: THE HOOK DECIDES, SO RADIX'S OWN TOGGLE IS SKIPPED.
    event.preventDefault();
    promotion.toggleStudent(studentId, event.shiftKey);
  }

  return (
    <Checkbox
      checked={promotion.isSelected(studentId)}
      onClick={handleClick}
      disabled={!isEligible}
      aria-label={`Select ${row.student?.user.fullName ?? 'this student'}`}
    />
  );
}

/** WHERE THE STUDENT IS IN A LATER YEAR: THEIR NEW CLASS, GRADUATED, OR NOT MOVED YET. */
function NextYearCell({ promotion, row, academicYearById }: { promotion: ClassPromotion; row: PromotionRosterRow; academicYearById: ReadonlyMap<string, AcademicYear> }) {
  const standing = promotion.standingOf(row.enrollment.studentId);

  switch (standing?.kind) {
    case 'moved':
      return (
        <span className='text-sm'>
          <span className='font-medium text-foreground'>{promotionClassLabel(promotion.laterClassById, standing.move.classId)}</span>
          <span className='text-muted-foreground'> · {academicYearById.get(standing.move.academicYearId)?.name ?? 'Later year'}</span>
        </span>
      );
    case 'graduated':
      return <StatusBadge tone='brand'>Graduated {formatDate(standing.graduatedOn)}</StatusBadge>;
    case 'unavailable':
      return <span className='text-sm text-muted-foreground'>{standing.reason === 'inactive' ? 'Inactive' : '—'}</span>;
    default:
      return (
        <span className='text-sm text-muted-foreground'>
          {promotion.isReady ? 'Not moved yet' : <span aria-label='Loading'>…</span>}
        </span>
      );
  }
}

/**
 * THE TWO COLUMNS A ROSTER GAINS WHEN ITS CLASS CAN BE PROMOTED: A CHECKBOX FIRST AND
 * "NEXT YEAR" (WHERE EACH STUDENT WENT). EMPTY WHEN THE VIEWER CAN'T PROMOTE.
 */
export function promotionColumns<T extends PromotionRosterRow>(
  promotion: ClassPromotion,
  academicYearById: ReadonlyMap<string, AcademicYear>,
): { selectColumn: DataTableColumn<T>[]; nextYearColumn: DataTableColumn<T>[] } {
  if (!promotion.isEnabled) return { selectColumn: [], nextYearColumn: [] };
  return {
    selectColumn: [
      {
        key: 'select',
        header: <SelectAllCheckbox promotion={promotion} />,
        className: 'w-10',
        cell: (row) => <StudentCheckbox promotion={promotion} row={row} />,
      },
    ],
    nextYearColumn: [
      {
        key: 'next-year',
        header: 'Next year',
        className: 'hidden md:table-cell',
        cell: (row) => <NextYearCell promotion={promotion} row={row} academicYearById={academicYearById} />,
      },
    ],
  };
}
