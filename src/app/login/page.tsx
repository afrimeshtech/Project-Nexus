import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/auth/AuthForms'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { currentUser } from '@/lib/auth'
import { normaliseCode } from '@/modules/rewards/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Sign in' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; ref?: string }>
}) {
  const { next, ref } = await searchParams
  const user = await currentUser()
  if (user) redirect(next ?? '/')

  // An invitation can land here rather than on /register, because phone + OTP
  // creates the account on first use. Normalised with the same function the
  // lookup uses, so what is shown is what will be matched.
  const invite = (normaliseCode(ref) ?? '').slice(0, 24)
  const registerHref = `/register?next=${encodeURIComponent(next ?? '/')}${
    invite ? `&ref=${encodeURIComponent(invite)}` : ''
  }`

  return (
    <AuthLayout
      title={invite ? 'You have been invited' : 'Welcome back'}
      subtitle="Sign in to shop, sell and track your orders."
      footnote="Sessions are opaque tokens stored hashed, so a database dump cannot be replayed into a live session and revocation is immediate."
    >
      <LoginForm next={next ?? '/'} referralCode={invite} />
      <p className="mt-4 text-center text-sm text-muted">
        New to AfriMesh?{' '}
        <Link href={registerHref} className="font-medium text-accent-strong hover:underline">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  )
}
