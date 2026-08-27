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
  searchParams: Promise<{ next?: string; ref?: string; method?: string }>
}) {
  const { next, ref, method } = await searchParams
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
      /*
       * The engineering was accurate and the audience was wrong. A shopper
       * signing in does not know what an opaque token is, and a line about
       * database dumps at the moment of entering a password reads as a warning
       * rather than as reassurance. Same fact, said to the person who is
       * actually here: their session is theirs, and it can be ended.
       */
      footnote="Your sign-in is kept secure, and you can sign out from any device at any time."
    >
      <LoginForm
        next={next ?? '/'}
        referralCode={invite}
        // Anything other than the one value we recognise falls back to the
        // phone default rather than erroring — a mistyped query string
        // should still give someone a working sign-in page.
        initialMethod={method === 'password' ? 'password' : 'otp'}
      />
      <p className="mt-4 text-center text-sm text-muted">
        New to AfriMesh?{' '}
        <Link href={registerHref} className="font-medium text-accent-strong hover:underline">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  )
}
