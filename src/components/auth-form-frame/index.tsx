import { SchoolWordmark } from '@/components/school-wordmark';
import { SCHOOL } from '@/constants/school';

interface AuthFormFrameProps {
  eyebrow: string;
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/** THE FORM SIDE OF EVERY AUTHENTICATION SCREEN: HEADER, HEADING, FORM AND A QUIET FOOTER. */
export function AuthFormFrame({ eyebrow, title, description, children, footer }: AuthFormFrameProps) {
  return (
    <div className='flex flex-1 flex-col px-5 py-8 sm:px-10 lg:px-14 lg:py-10'>
      <header className='hidden items-center justify-between lg:flex'>
        <SchoolWordmark size='sm' />
        <span className='font-mono text-2xs tracking-[0.14em] text-muted-foreground uppercase'>{SCHOOL.portalName}</span>
      </header>

      <div className='mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-6 lg:py-12'>
        <p className='font-mono text-2xs tracking-[0.14em] text-muted-foreground uppercase'>{eyebrow}</p>
        <h1 className='mt-2 text-4xl font-semibold tracking-tight text-foreground'>{title}</h1>
        <div className='mt-2 text-base text-muted-foreground'>{description}</div>
        <div className='mt-8'>{children}</div>
      </div>

      {footer && <footer className='mx-auto w-full max-w-sm border-t pt-5 text-sm text-muted-foreground'>{footer}</footer>}
    </div>
  );
}
