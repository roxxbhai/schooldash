import { ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

/** A SMALL "GO TO THE FULL PAGE" LINK IN A PANEL'S TITLE ROW. */
export function PanelLink({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild variant='ghost' size='sm'>
      <Link href={href}>
        {label}
        <ArrowRightIcon aria-hidden />
      </Link>
    </Button>
  );
}
