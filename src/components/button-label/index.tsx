import { cn } from '@/helpers/cn';

interface ButtonLabelProps {
  /** CHANGES WHEN THE BUTTON'S STATE DOES, E.G. 'idle' → 'pending'. */
  stateKey: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * A BUTTON'S CONTENT FOR ONE STATE ("Save" / "Saving…"). WHEN THE STATE CHANGES, THE NEW
 * CONTENT RESOLVES FROM A 2PX BLUR, SO THE SWAP READS AS ONE CHANGE RATHER THAN TWO LABELS
 * TRADING PLACES. PURE CSS (@starting-style); BROWSERS WITHOUT IT SIMPLY SWAP.
 */
export function ButtonLabel({ stateKey, className, children }: ButtonLabelProps) {
  return (
    <span
      key={stateKey}
      className={cn('inline-flex items-center gap-[inherit] transition-[opacity,filter] duration-150 ease-out starting:opacity-0 starting:blur-[2px]', className)}
    >
      {children}
    </span>
  );
}
