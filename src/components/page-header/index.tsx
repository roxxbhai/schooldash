interface PageHeaderProps {
  title: string;
  description?: React.ReactNode;
  /** PRIMARY ACTIONS, RIGHT-ALIGNED ON WIDE SCREENS. */
  actions?: React.ReactNode;
}

/** THE TITLE BLOCK AT THE TOP OF EVERY ADMIN PAGE. THE ONLY <h1> ON THE PAGE. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className='mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
      <div className='min-w-0'>
        <h1 className='text-3xl font-semibold tracking-tight text-foreground'>{title}</h1>
        {description && <div className='mt-1.5 max-w-2xl text-base text-muted-foreground'>{description}</div>}
      </div>
      {actions && <div className='flex shrink-0 flex-wrap items-center gap-2'>{actions}</div>}
    </div>
  );
}
