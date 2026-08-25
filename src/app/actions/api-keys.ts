'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { currentUser, currentOrganisation } from '@/lib/auth'
import { issueKey, revokeKey, API_SCOPES, type ApiScope } from '@/modules/api/service'

import { parseForm, z, requiredText, uuid } from '@/lib/forms'

export interface ApiKeyActionState {
  error?: string
  notice?: string
  /** The full secret, returned exactly once and never stored in plaintext. */
  secret?: string
}

const issueSchema = z.object({
  name: requiredText('A name for this key', 80),
})

const revokeSchema = z.object({ keyId: uuid('key') })

/**
 * Mint an API key for the caller's own business.
 *
 * The organisation comes from the session, never from the form — the same rule
 * every other action in this app follows, and the one that matters most here:
 * a form-supplied organisation id would let anyone issue a working key against
 * somebody else's business.
 */
export async function issueKeyAction(
  _prev: ApiKeyActionState,
  formData: FormData,
): Promise<ApiKeyActionState> {
  const user = await currentUser()
  if (!user) redirect('/login?next=/partner/api')

  const org = await currentOrganisation()
  if (!org) return { error: 'No business account found' }

  const parsed = parseForm(issueSchema, formData)
  if (!parsed.ok) return { error: parsed.error }

  // Scopes arrive as repeated checkbox fields, so they are read from the raw
  // FormData and then filtered against the allow-list — anything not on it is
  // dropped rather than trusted.
  const requested = formData.getAll('scopes').filter((v): v is string => typeof v === 'string')
  const scopes = requested.filter((s): s is ApiScope =>
    (API_SCOPES as readonly string[]).includes(s),
  )

  if (!scopes.length) {
    return { error: 'Choose at least one scope — a key with none can read nothing.' }
  }

  try {
    const { secret } = await issueKey({
      name: parsed.data.name,
      organisationId: org.id,
      createdByUserId: user.id,
      scopes,
    })
    revalidatePath('/partner/api')
    return {
      notice: 'Key created. Copy it now — it cannot be shown again.',
      secret,
    }
  } catch (err) {
    console.error('[api] key issue failed', err)
    return { error: 'We could not create that key. Please try again.' }
  }
}

export async function revokeKeyAction(formData: FormData) {
  const org = await currentOrganisation()
  if (!org) return

  const parsed = parseForm(revokeSchema, formData)
  if (!parsed.ok) return

  await revokeKey(parsed.data.keyId, org.id)
  revalidatePath('/partner/api')
}
