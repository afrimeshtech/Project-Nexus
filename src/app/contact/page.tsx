import { ConsumerShell } from '@/components/shell/ConsumerShell'
import { ContactForm } from '@/components/support/ContactForm'
import { Card, PageHeader } from '@/components/ui'
import { currentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Contact us' }

const SOURCES = ['consumer', 'partner', 'showcase'] as const
type Source = (typeof SOURCES)[number]

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>
}) {
  const { from } = await searchParams
  const source: Source = SOURCES.includes(from as Source) ? (from as Source) : 'consumer'
  const user = await currentUser()

  return (
    <ConsumerShell search={false}>
      <div className="mx-auto max-w-lg space-y-6">
        <PageHeader
          breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Contact us' }]}
          title="Contact us"
          subtitle="Question about an order, a shop, or selling on AfriMesh? Send us a message."
        />
        <Card>
          <ContactForm
            source={source}
            defaultName={user?.full_name ?? ''}
            defaultEmail={user?.email ?? ''}
          />
        </Card>
      </div>
    </ConsumerShell>
  )
}
