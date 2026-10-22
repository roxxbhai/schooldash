import { BackLink } from '@/components/back-link';

interface AuthFormFrameProps {
  /** A LINK ABOVE THE HEADING, E.G. BACK TO THE CHOICE OF SIGN-INS. */
  back?: { href: string; label: string };
  eyebrow?: string;
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/** THE FORM SIDE OF EVERY AUTHENTICATION SCREEN: HEADING, FORM AND A QUIET FOOTER. */
export function AuthFormFrame({ back, eyebrow, title, description, children, footer }: AuthFormFrameProps) {
  return (
    <div className='flex flex-1 flex-col px-5 py-8 sm:px-10 lg:px-14 lg:py-10'>
      <div className='mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-6 lg:py-12'>
        {back && (
          <div>
            <BackLink href={back.href} label={back.label} />
          </div>
        )}
        {eyebrow && <p className='mb-2 font-mono text-2xs tracking-[0.14em] text-muted-foreground uppercase'>{eyebrow}</p>}
        <h1 className='text-4xl font-semibold tracking-tight text-foreground'>{title}</h1>
        <div className='mt-2 text-base text-muted-foreground'>{description}</div>
        <div className='mt-8'>{children}</div>
      </div>

      {footer && <footer className='mx-auto w-full max-w-sm border-t pt-5 text-sm text-muted-foreground'>{footer}</footer>}
    </div>
  );
}
