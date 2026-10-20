import { ArrowLeftIcon } from 'lucide-react';
import Link from 'next/link';

interface BackLinkProps {
  href: string;
  label: string;
}

/** "← Teachers" ABOVE A DETAIL PAGE, BACK TO ITS LIST. */
export function BackLink({ href, label }: BackLinkProps) {
  return (
    <Link href={href} className='mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground'>
      <ArrowLeftIcon aria-hidden className='size-4' />
      {label}
    </Link>
  );
}
