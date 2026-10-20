import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';

interface FormFieldProps {
  id: string;
  label: string;
  description?: React.ReactNode;
  error?: string;
  isRequired?: boolean;
  /** RIGHT-ALIGNED NEXT TO THE LABEL, E.G. A "FORGOT?" LINK. */
  labelAside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/**
 * LABEL + CONTROL + HINT OR ERROR. GIVE THE CONTROL `fieldControlProps(id, error, hasDescription)`
 * FROM @/helpers/forms SO ITS ID AND aria-describedby MATCH THE IDS USED HERE.
 */
export function FormField({ id, label, description, error, isRequired = false, labelAside, className, children }: FormFieldProps) {
  return (
    <Field data-invalid={error ? true : undefined} className={className}>
      <div className='flex items-baseline justify-between gap-3'>
        <FieldLabel htmlFor={id}>
          {label}
          {isRequired && (
            <span aria-hidden className='text-destructive'>
              *
            </span>
          )}
        </FieldLabel>
        {labelAside}
      </div>
      {children}
      {description && !error && <FieldDescription id={`${id}-description`}>{description}</FieldDescription>}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
  );
}
