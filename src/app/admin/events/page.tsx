import Link from 'next/link'
import { AdminShell } from '@/components/shell/AdminShell'
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui'
import { requireRole, ADMIN_ROLES } from '@/lib/auth'
import { eventCounts, recentEvents } from '@/modules/events/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Event log' }

/**
 * The immutable audit trail.
 *
 * "Comprehensive event logging from day one to support future analytics, AI,
 * and graph-based intelligence" (PRD, CTO Technical Note). This table is also
 * the seam where Apache Kafka is introduced when throughput demands it —
 * publishers and subscribers do not change.
 */
export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  const params = await searchParams
  await requireRole(ADMIN_ROLES, '/admin/events')

  const [events, counts] = await Promise.all([recentEvents(80, params.type), eventCounts(24 * 30)])

  return (
    <AdminShell active="/admin/events">
      <div className="space-y-7">
        <PageHeader
          breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Events' }]}
          title="Event log"
          subtitle="Append-only. Every meaningful state change in the platform, in order."
        />

        <Card>
          <div className="flex flex-wrap gap-1.5">
            <Link
              href="/admin/events"
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                !params.type
                  ? 'bg-accent-500 text-accent-ink'
                  : 'border border-line bg-surface text-muted'
              }`}
            >
              All events
            </Link>
            {counts.slice(0, 18).map((c) => (
              <Link
                key={c.event_type}
                href={`/admin/events?type=${encodeURIComponent(c.event_type)}`}
                className={`rounded-full px-3 py-1 font-technical text-xs font-medium ${
                  params.type === c.event_type
                    ? 'bg-surface-deep text-white'
                    : 'border border-line bg-surface text-muted'
                }`}
              >
                {c.event_type} · {c.count}
              </Link>
            ))}
          </div>
        </Card>

        {events.length ? (
          <Card className="p-0">
            <div className="scroll-x">
              <table className="w-full min-w-[46rem] text-sm">
                <caption className="sr-only">Recent domain events</caption>
                <thead>
                  <tr className="border-b border-line-soft text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium">#</th>
                    <th className="px-3 py-3 font-medium">Event</th>
                    <th className="px-3 py-3 font-medium">Aggregate</th>
                    <th className="px-3 py-3 font-medium">Payload</th>
                    <th className="px-4 py-3 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id} className="border-b border-line-soft last:border-0">
                      <td className="px-4 py-2.5 font-technical text-xs text-muted">{event.id}</td>
                      <td className="px-3 py-2.5">
                        <Badge tone="neutral">{event.event_type}</Badge>
                      </td>
                      <td className="px-3 py-2.5 font-technical text-xs text-muted">
                        {event.aggregate_type}
                        <span className="block">{String(event.aggregate_id).slice(0, 8)}…</span>
                      </td>
                      <td className="max-w-sm px-3 py-2.5">
                        <code className="block truncate font-technical text-xs text-muted">
                          {JSON.stringify(event.payload)}
                        </code>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-technical text-xs text-muted">
                        {new Date(event.occurred_at).toLocaleString('en-NG')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <EmptyState icon="list" title="No events of that type yet" />
        )}
      </div>
    </AdminShell>
  )
}
