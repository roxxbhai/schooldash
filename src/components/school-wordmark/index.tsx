import { SCHOOL } from '@/constants/school';
import { cn } from '@/helpers/cn';

interface SchoolWordmarkProps {
  /** `inverse` FOR NAVY OR PHOTO BACKGROUNDS. */
  tone?: 'default' | 'inverse';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * TYPOGRAPHIC SCHOOL MARK, USED UNTIL AN OFFICIAL CREST IS SUPPLIED: A GOLD
 * RULE, THE SCHOOL NAME IN GEIST SANS, AND THE SCHOOL TYPE AND TOWN IN SMALL
 * MONO CAPITALS.
 */
export function SchoolWordmark({ tone = 'default', size = 'md', className }: SchoolWordmarkProps) {
  const isInverse = tone === 'inverse';

  return (
    <div className={cn('flex items-stretch gap-3', className)}>
      <span aria-hidden className={cn('w-1 shrink-0 bg-brand-gold', size === 'lg' ? 'w-1.5' : 'w-1')} />
      <div className='flex flex-col justify-center'>
        <span
          className={cn(
            'font-semibold tracking-tight',
            size === 'sm' && 'text-base leading-5',
            size === 'md' && 'text-lg leading-6',
            size === 'lg' && 'text-3xl leading-9',
            isInverse ? 'text-white' : 'text-foreground',
          )}
        >
          {SCHOOL.name}
        </span>
        <span
          className={cn(
            'font-mono whitespace-nowrap uppercase',
            size === 'lg' ? 'mt-1 text-xs tracking-[0.14em]' : 'text-2xs tracking-[0.08em]',
            isInverse ? 'text-white/75' : 'text-muted-foreground',
          )}
        >
          {SCHOOL.shortType} · {SCHOOL.location.split(',')[0]}
        </span>
      </div>
    </div>
  );
}
