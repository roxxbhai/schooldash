import { cn } from '@/helpers/cn';

export interface ProfileField {
  label: string;
  value: string | null | undefined;
  /** CODES, DATES, EMAILS AND PHONE NUMBERS ARE SET IN GEIST MONO. */
  isMono?: boolean;
  /** SPANS BOTH COLUMNS (E.G. AN ADDRESS). */
  isWide?: boolean;
}

/** A PERSON'S RECORDED DETAILS AS A LABEL/VALUE LIST. A MISSING VALUE SAYS SO INSTEAD OF SHOWING A BLANK. */
export function ProfileFields({ fields }: { fields: readonly ProfileField[] }) {
  return (
    <dl className='grid gap-x-6 gap-y-4 sm:grid-cols-2'>
      {fields.map((field) => (
        <div key={field.label} className={cn('min-w-0', field.isWide && 'sm:col-span-2')}>
          <dt className='text-xs font-medium text-muted-foreground'>{field.label}</dt>
          <dd className={cn('mt-0.5 text-sm break-words whitespace-pre-line text-foreground', field.isMono && field.value && 'font-mono')}>
            {field.value || <span className='text-muted-foreground'>Not recorded</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
