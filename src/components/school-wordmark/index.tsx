import Image from 'next/image';
import { SCHOOL } from '@/constants/school';
import { cn } from '@/helpers/cn';

interface SchoolWordmarkProps {
  /** `inverse` FOR NAVY OR PHOTO BACKGROUNDS. */
  tone?: 'default' | 'inverse';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** CREST SIZE IN PIXELS FOR EACH WORDMARK SIZE. */
const CREST_SIZE = { sm: 40, md: 48, lg: 72 } as const;

/**
 * SCHOOL MARK: THE OFFICIAL CREST, THE SCHOOL NAME, AND THE SCHOOL TYPE AND
 * TOWN IN SMALL CAPITALS. THE CREST IS DECORATIVE, THE NAME BESIDE IT SAYS WHO IT IS.
 */
export function SchoolWordmark({ tone = 'default', size = 'md', className }: SchoolWordmarkProps) {
  const isInverse = tone === 'inverse';
  const crestSize = CREST_SIZE[size];

  return (
    <div className={cn('flex items-center', size === 'lg' ? 'gap-4' : 'gap-3', className)}>
      <Image src={SCHOOL.logo} alt='' width={crestSize} height={crestSize} className='shrink-0' />
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
            'tabular-nums whitespace-nowrap uppercase',
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
