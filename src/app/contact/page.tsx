import { redirect } from 'next/navigation'
import { ConsumerShell } from '@/components/shell/ConsumerShell'
import { ContactForm } from '@/components/support/ContactForm'
import { NewSupportThreadForm } from '@/components/support/SupportForms'
import { SupportThreadList } from '@/components/support/SupportViews'
import { Card, PageHeader, SectionHeading } from '@/components/ui'
import { currentOrganisation, currentUser } from '@/lib/auth'
import { supportThreadsForUser } from '@/modules/support/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Contact us' }

const SOURCES = ['consumer', 'partner', 'showcase'] as const
type Source = (typeof SOURCES)[number]

/**
 * Contact us.
 *
 * Signed in, it is a two-way inbox with AfriMesh: the shopper's conversations,
 * each answered from the console, and a box to start a new one. Signed out
 * there is no account to reply to, so it is the email form it always was.
 * A retailer arriving from their dashboard is sent to the dashboard's own
 * support page, so the conversation stays inside the shell they work in.
 */
export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>
}) {
  const { from } = await searchParams
  const source: Source = SOURCES.includes(from as Source) ? (from as Source) : 'consumer'
  const user = await currentUser()

  if (user && source === 'partner' && (await currentOrganisation())) {
    redirect('/partner/support')
  }

  if (!user) {
    return (
      <ConsumerShell search={false}>
        <div className="mx-auto max-w-lg space-y-6">
          <PageHeader
            breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Contact us' }]}
            title="Contact us"
            subtitle="Question about an order, a shop, or selling on AfriMesh? Send us a message and we will reply by email - or sign in to chat with us here."
          />
          <Card>
            <ContactForm source={source} />
          </Card>
        </div>
      </ConsumerShell>
    )
  }

  const threads = await supportThreadsForUser(user.id, 'consumer')

  return (
    <ConsumerShell search={false}>
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader
          breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Contact us' }]}
          title="Contact us"
          subtitle="Write to the AfriMesh team. We reply here, and you get a notification when we do."
        />
        <Card>
          <SectionHeading title="New message" />
          <NewSupportThreadForm source="consumer" />
        </Card>
        <section className="space-y-3">
          <SectionHeading title="Your conversations" />
          <SupportThreadList
            threads={threads}
            hrefFor={(id) => `/contact/${id}`}
            perspective="member"
            emptyBody="Anything you send us appears here, with our replies."
          />
        </section>
      </div>
    </ConsumerShell>
  )
}
