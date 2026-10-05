import { Badge } from '@/components/ui'
import { orderStatusLabel, type Order, type OrderStatus } from '@/modules/orders/service'

const TONE: Record<OrderStatus, Parameters<typeof Badge>[0]['tone']> = {
  pending_payment: 'warning',
  confirmed: 'info',
  preparing: 'info',
  dispatched: 'brand',
  delivered: 'brand',
  completed: 'success',
  cancelled: 'neutral',
  refunded: 'danger',
}

export function OrderStatusBadge({
  status,
  fulfilment,
}: {
  status: OrderStatus
  fulfilment: Order['fulfilment']
}) {
  return <Badge tone={TONE[status]}>{orderStatusLabel(status, fulfilment)}</Badge>
}

/** The lifecycle, drawn. Shows the buyer exactly where their order is. */
export function OrderProgress({
  status,
  fulfilment,
}: {
  status: OrderStatus
  fulfilment: Order['fulfilment']
}) {
  const pickup = fulfilment === 'pickup'
  const steps: { key: OrderStatus; label: string }[] = [
    { key: 'confirmed', label: 'Paid' },
    { key: 'preparing', label: 'Preparing' },
    { key: 'dispatched', label: pickup ? 'Ready' : 'On the way' },
    { key: 'delivered', label: pickup ? 'Collected' : 'Delivered' },
    { key: 'completed', label: 'Completed' },
  ]

  if (status === 'cancelled' || status === 'refunded' || status === 'pending_payment') return null

  const currentIndex = steps.findIndex((s) => s.key === status)

  return (
    <ol className="flex items-center gap-1" aria-label="Order progress">
      {steps.map((step, index) => {
        const done = index <= currentIndex
        return (
          <li key={step.key} className="flex flex-1 flex-col items-center gap-1 text-center">
            <div className="flex w-full items-center">
              <span
                className={`h-1 flex-1 rounded-full ${index === 0 ? 'opacity-0' : done ? 'bg-accent-500' : 'bg-surface-muted'}`}
              />
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11.2px] font-bold ${
                  done ? 'bg-accent-500 text-accent-ink' : 'bg-surface-muted text-muted'
                }`}
              >
                {done ? '·' : index + 1}
              </span>
              <span
                className={`h-1 flex-1 rounded-full ${
                  index === steps.length - 1
                    ? 'opacity-0'
                    : index < currentIndex
                      ? 'bg-accent-500'
                      : 'bg-surface-muted'
                }`}
              />
            </div>
            <span className={`text-[11.2px] ${done ? 'font-medium text-ink' : 'text-muted'}`}>
              {step.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
