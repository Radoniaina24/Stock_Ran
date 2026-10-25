import { PaymentMethodIcon } from './status-badges'
import { cn } from '../../lib/utils'
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from '../../types/database'

export function PaymentMethodPicker({
  value,
  onChange,
  name,
  invalid = false,
}: {
  value: PaymentMethod
  onChange: (method: PaymentMethod) => void
  name: string
  invalid?: boolean
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Moyen de paiement"
      aria-invalid={invalid || undefined}
      className="grid grid-cols-2 gap-2 sm:grid-cols-5"
    >
      {PAYMENT_METHODS.map((method) => {
        const checked = value === method
        return (
          <label
            key={method}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors sm:flex-col sm:gap-1.5 sm:py-3 sm:text-center',
              'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40',
              checked
                ? 'border-primary bg-primary-soft font-medium text-primary'
                : 'border-border text-foreground hover:bg-muted/60',
            )}
          >
            <input
              type="radio"
              name={name}
              value={method}
              checked={checked}
              onChange={() => onChange(method)}
              className="sr-only"
            />
            <PaymentMethodIcon method={method} className="size-8" />
            <span className="leading-tight">{PAYMENT_METHOD_LABELS[method]}</span>
          </label>
        )
      })}
    </div>
  )
}
