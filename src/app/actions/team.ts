'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { currentUser, organisationFor } from '@/lib/auth'
import { addSalesRep, removeTeamMember, TeamError } from '@/modules/organisations/service'

import { parseForm, z, uuid, requiredText, phone } from '@/lib/forms'

export interface TeamActionState {
  error?: string
  notice?: string
}

const addSchema = z.object({
  fullName: requiredText('Their name', 120),
  phone,
})

const removeSchema = z.object({ userId: uuid('team member') })

/** The owner adds a sales rep by phone. The rep signs in with that number. */
export async function addSalesRepAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const user = await currentUser()
  if (!user) redirect('/login?next=/partner/team')

  const org = await organisationFor('team')
  if (!org) return { error: 'Only the business owner can manage the team' }

  const parsed = parseForm(addSchema, formData)
  if (!parsed.ok) return { error: parsed.error }

  try {
    const member = await addSalesRep(org.id, parsed.data, user.id)
    revalidatePath('/partner/team')
    return {
      notice: `${member.full_name} is on your team. They sign in with ${member.phone ?? 'their phone number'}.`,
    }
  } catch (err) {
    if (err instanceof TeamError) return { error: err.message }
    console.error('[team] add failed', err)
    return { error: 'We could not add that person.' }
  }
}

export async function removeTeamMemberAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const user = await currentUser()
  if (!user) redirect('/login?next=/partner/team')

  const org = await organisationFor('team')
  if (!org) return { error: 'Only the business owner can manage the team' }

  const parsed = parseForm(removeSchema, formData)
  if (!parsed.ok) return { error: parsed.error }

  try {
    await removeTeamMember(org.id, parsed.data.userId, user.id)
  } catch (err) {
    if (err instanceof TeamError) return { error: err.message }
    console.error('[team] remove failed', err)
    return { error: 'We could not remove that person.' }
  }
  revalidatePath('/partner/team')
  return { notice: 'Removed. They no longer have access to the business.' }
}
