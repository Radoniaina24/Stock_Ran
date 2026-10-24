import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, id, ...props }, ref) => (
    <label
      htmlFor={id}
      className={cn(
        'inline-flex cursor-pointer select-none items-center gap-2 text-sm text-foreground',
        className,
      )}
    >
      <input
        ref={ref}
        id={id}
        type="checkbox"
        className="size-4 cursor-pointer rounded border-input accent-[var(--color-primary)]"
        {...props}
      />
      {label ? <span>{label}</span> : null}
    </label>
  ),
)
Checkbox.displayName = 'Checkbox'
