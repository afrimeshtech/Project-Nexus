'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { ADMIN_ROLES, currentOrganisation, currentUser } from '@/lib/auth'
import { parseForm, requiredText, uuid, z } from '@/lib/forms'
import {
  openSupportThread,
  replySupport,
  setSupportStatus,
  supportThreadFor,
  SupportError,
} from '@/modules/support/service'

export interface SupportActionState {
  error?: string
}

const startSchema = z.object({
  subject: requiredText('A subject', 120),
  body: requiredText('Your message', 2000),
  source: z.enum(['consumer', 'partner']).catch('consumer'),
})

const replySchema = z.object({
  threadId: uuid('conversation'),
  body: requiredText('Your reply', 2000),
})

const statusSchema = z.object({
  threadId: uuid('conversation'),
  status: z.enum(['open', 'closed']),
})

/** Where a member reads a thread: the storefront, or the retailer dashboard. */
const memberThreadPath = (source: 'consumer' | 'partner', id: string) =>
  source === 'partner' ? `/partner/support/${id}` : `/contact/${id}`

export async function startSupportThreadAction(
  _prev: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  const user = await currentUser()
  if (!user) redirect('/login?next=/contact')

  const parsed = parseForm(startSchema, formData)
  if (!parsed.ok) return { error: parsed.error }

  // A retailer's thread records the business it is about; a shopper's has none.
  const org = parsed.data.source === 'partner' ? await currentOrganisation() : null
  const source = org ? 'partner' : 'consumer'

  let threadId: string
  try {
    const thread = await openSupportThread({
      userId: user.id,
      organisationId: org?.id ?? null,
      source,
      subject: parsed.data.subject,
      body: parsed.data.body,
    })
    threadId = thread.id
  } catch (err) {
    if (err instanceof SupportError) return { error: err.message }
    console.error('[support] could not open thread', err)
    return { error: 'We could not send that. Please try again in a moment.' }
  }
  revalidatePath('/admin/support')
  redirect(memberThreadPath(source, threadId))
}

export async function replySupportAction(
  _prev: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  const user = await currentUser()
  if (!user) redirect('/login?next=/contact')
  const parsed = parseForm(replySchema, formData)
  if (!parsed.ok) return { error: parsed.error }

  const thread = await supportThreadFor(parsed.data.threadId, { userId: user.id, isAdmin: false })
  if (!thread) return { error: 'That conversation was not found.' }
  try {
    await replySupport({ thread, senderUserId: user.id, side: 'member', body: parsed.data.body })
  } catch (err) {
    if (err instanceof SupportError) return { error: err.message }
    throw err
  }
  revalidatePath(memberThreadPath(thread.source, thread.id))
  revalidatePath('/admin/support')
  return {}
}

async function requireSupportAdmin() {
  const user = await currentUser()
  if (!user) redirect('/login?next=/admin/support')
  if (!ADMIN_ROLES.includes(user.role)) redirect('/forbidden')
  // Auditors read the console; they do not speak for AfriMesh.
  if (user.role === 'auditor') throw new Error('Auditors have read-only access')
  return user
}

export async function adminReplySupportAction(
  _prev: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  const admin = await requireSupportAdmin()
  const parsed = parseForm(replySchema, formData)
  if (!parsed.ok) return { error: parsed.error }

  const thread = await supportThreadFor(parsed.data.threadId, { userId: admin.id, isAdmin: true })
  if (!thread) return { error: 'That conversation was not found.' }
  try {
    await replySupport({ thread, senderUserId: admin.id, side: 'admin', body: parsed.data.body })
  } catch (err) {
    if (err instanceof SupportError) return { error: err.message }
    throw err
  }
  revalidatePath(`/admin/support/${thread.id}`)
  revalidatePath('/admin/support')
  return {}
}

export async function setSupportStatusAction(formData: FormData) {
  await requireSupportAdmin()
  const parsed = parseForm(statusSchema, formData)
  if (!parsed.ok) return
  await setSupportStatus(parsed.data.threadId, parsed.data.status)
  revalidatePath(`/admin/support/${parsed.data.threadId}`)
  revalidatePath('/admin/support')
}
