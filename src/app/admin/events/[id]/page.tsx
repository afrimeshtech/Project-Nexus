import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AdminShell } from '@/components/shell/AdminShell'
import { Badge, Card, PageHeader, SectionHeading } from '@/components/ui'
import { requireRole, ADMIN_ROLES } from '@/lib/auth'
import { describeAggregate, eventsForAggregate, getEvent } from '@/modules/events/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Event details' }

/** "order.placed" -> "Order placed": the log's types, read as a sentence. */
const readable = (type: string) => {
  // Types come both dotted ("order.placed") and run together ("StockSold").
  const text = type
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._]/g, ' ')
    .trim()
    .toLowerCase()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Fields that hold money are stored in kobo; show naira beside the raw figure. */
const MONEY_KEY = /amount|total|subtotal|fee|price|balance|value|revenue|cashback|refund/i

const formatValue = (key: string, value: unknown): string =>
  value === null || value === undefined
    ? '-'
    : typeof value === 'object'
      ? JSON.stringify(value, null, 2)
      : typeof value === 'number' && MONEY_KEY.test(key)
        ? `₦${(value / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })} (${value} kobo)`
        : String(value)

/**
 * One entry in the audit trail, in full: what happened, who did it, the
 * record it happened to (named, not just an id), every field it carried,
 * and everything else that has happened to that same record.
 */
export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireRole(ADMIN_ROLES, `/admin/events/${id}`)
  const eventId = Number(id)
  if (!Number.isSafeInteger(eventId) || eventId < 1) notFound()

  const event = await getEvent(eventId)
  if (!event) notFound()

  const [subject, related] = await Promise.all([
    describeAggregate(event.aggregate_type, event.aggregate_id),
    eventsForAggregate(event.aggregate_type, event.aggregate_id, 30),
  ])
  const fields = Object.entries(event.payload ?? {})
  const occurred = new Date(event.occurred_at)

  return (
    <AdminShell active="/admin/events">
      <div className="max-w-4xl space-y-6">
        <PageHeader
          breadcrumb={[
            { label: 'Admin', href: '/admin' },
            { label: 'Events', href: '/admin/events' },
            { label: `#${event.id}` },
          ]}
          title={readable(event.event_type)}
          subtitle={`${occurred.toLocaleString('en-NG', { dateStyle: 'full', timeStyle: 'medium' })} · event #${event.id}`}
          actions={<Badge tone="neutral">{event.event_type}</Badge>}
        />

        <div className="grid gap-4 [&>*]:min-w-0 md:grid-cols-2">
          <Card>
            <SectionHeading title="Who did it" />
            {event.actor_user_id ? (
              <dl className="space-y-1 text-sm">
                <p className="font-medium text-ink">{event.actor_name ?? 'Deleted account'}</p>
                {event.actor_role && (
                  <p className="capitalize text-muted">{event.actor_role.replace(/_/g, ' ')}</p>
                )}
                {[event.actor_phone, event.actor_email].filter(Boolean).map((v) => (
                  <p key={String(v)} className="text-muted">
                    {v}
                  </p>
                ))}
                <p className="break-all font-technical text-xs text-muted">{event.actor_user_id}</p>
              </dl>
            ) : (
              <p className="text-sm text-muted">
                The system - a scheduled job, a payment webhook or another automatic step, not a
                person.
              </p>
            )}
          </Card>

          <Card>
            <SectionHeading title="What it happened to" />
            <p className="text-xs uppercase tracking-wide text-muted">
              {event.aggregate_type.replace(/_/g, ' ')}
            </p>
            {subject ? (
              <div className="mt-1 space-y-1 text-sm">
                {subject.href ? (
                  <Link
                    href={subject.href}
                    className="font-medium text-accent-strong hover:underline"
                  >
                    {subject.label}
                  </Link>
                ) : (
                  <p className="font-medium text-ink">{subject.label}</p>
                )}
                {subject.detail && (
                  <p className="text-muted first-letter:uppercase">{subject.detail}</p>
                )}
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted">
                No longer on record, or not a record type the console names.
              </p>
            )}
            <p className="mt-2 break-all font-technical text-xs text-muted">{event.aggregate_id}</p>
          </Card>
        </div>

        <Card>
          <SectionHeading
            title="Details"
            subtitle={fields.length ? 'Every field recorded with this event' : undefined}
          />
          {fields.length ? (
            <dl className="divide-y divide-line-soft text-sm">
              {fields.map(([key, value]) => (
                <div key={key} className="grid gap-1 py-2.5 sm:grid-cols-[12rem_1fr] sm:gap-4">
                  <dt className="font-technical text-xs uppercase tracking-wide text-muted">
                    {key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ')}
                  </dt>
                  <dd className="min-w-0 whitespace-pre-wrap break-words text-ink">
                    {formatValue(key, value)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted">This event carried no extra details.</p>
          )}
          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-medium text-muted hover:text-ink">
              Raw JSON
            </summary>
            <pre className="mt-2 overflow-x-auto rounded-brand bg-surface-muted p-3 font-technical text-xs text-ink">
              {JSON.stringify(event.payload ?? {}, null, 2)}
            </pre>
          </details>
        </Card>

        <Card>
          <SectionHeading
            title="This record's history"
            subtitle={`Everything logged against this ${event.aggregate_type.replace(/_/g, ' ')}, newest first`}
          />
          <ol className="divide-y divide-line-soft">
            {related.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/admin/events/${r.id}`}
                  aria-current={r.id === event.id ? 'page' : undefined}
                  className={`flex items-center justify-between gap-3 py-2.5 text-sm ${
                    r.id === event.id ? 'font-semibold text-ink' : 'text-muted hover:text-ink'
                  }`}
                >
                  <span className="min-w-0 truncate">
                    {readable(r.event_type)}
                    {r.id === event.id && ' (this event)'}
                  </span>
                  <span className="shrink-0 font-technical text-xs">
                    {new Date(r.occurred_at).toLocaleString('en-NG')} · #{r.id}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </AdminShell>
  )
}
