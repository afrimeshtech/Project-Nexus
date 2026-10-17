import Link from 'next/link'
import { Badge, Card, EmptyState } from '@/components/ui'
import type { SupportMessage, SupportSide, SupportThreadSummary } from '@/modules/support/service'

const when = (d: Date) =>
  new Date(d).toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })

/**
 * A list of support conversations. `perspective` decides who "the other
 * side" is: a member sees AfriMesh's replies as new, the console sees the
 * member's messages as new.
 */
export function SupportThreadList({
  threads,
  hrefFor,
  perspective,
  emptyBody,
}: {
  threads: SupportThreadSummary[]
  hrefFor: (id: string) => string
  perspective: SupportSide
  emptyBody: string
}) {
  if (!threads.length) {
    return <EmptyState icon="mail" title="No conversations yet" body={emptyBody} />
  }
  return (
    <ul className="space-y-2">
      {threads.map((t) => (
        <li key={t.id}>
          <Link href={hrefFor(t.id)} className="block">
            <Card className="flex items-start gap-3 hover:border-line">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium text-ink">{t.subject}</p>
                  {t.unread > 0 && <Badge tone="brand">{t.unread} new</Badge>}
                  {t.status === 'closed' && <Badge tone="neutral">Closed</Badge>}
                </div>
                {perspective === 'admin' && (
                  <p className="mt-0.5 text-xs text-muted">
                    {t.source === 'partner' ? 'Retailer' : 'Shopper'} · {t.member_name}
                    {t.organisation_name ? ` · ${t.organisation_name}` : ''}
                  </p>
                )}
                {t.last_body && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted">
                    {t.last_side === 'admin'
                      ? 'AfriMesh: '
                      : perspective === 'admin'
                        ? ''
                        : 'You: '}
                    {t.last_body}
                  </p>
                )}
              </div>
              <span className="shrink-0 font-technical text-xs text-muted">
                {when(t.last_message_at)}
              </span>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** The conversation itself: the viewer's own messages on the right. */
export function SupportConversation({
  messages,
  viewerSide,
}: {
  messages: SupportMessage[]
  viewerSide: SupportSide
}) {
  return (
    <ol className="space-y-3">
      {messages.map((m) => {
        const mine = m.sender_side === viewerSide
        return (
          <li key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-brand px-3.5 py-2.5 text-sm ${
                mine ? 'bg-brand-deep text-white' : 'border border-line bg-surface text-ink'
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <p className={`mt-1 text-[11px] ${mine ? 'text-white/70' : 'text-muted'}`}>
                {m.sender_side === 'admin'
                  ? viewerSide === 'admin'
                    ? `${m.sender_name ?? 'Support'} (AfriMesh)`
                    : 'AfriMesh support'
                  : (m.sender_name ?? 'Member')}{' '}
                · {when(m.created_at)}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
