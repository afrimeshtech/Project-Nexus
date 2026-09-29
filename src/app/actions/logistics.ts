'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import {
  acceptJob,
  completeDelivery,
  declineJob,
  markPickedUp,
  DeliveryError,
} from '@/modules/logistics/service'

import { parseForm, z, uuid, requiredText } from '@/lib/forms'

export interface DeliveryActionState {
  error?: string
  notice?: string
}

const jobSchema = z.object({ deliveryId: uuid('delivery') })

const completeSchema = z.object({
  deliveryId: uuid('delivery'),
  proofNote: requiredText('Proof of delivery', 200),
})

async function requireRider() {
  const user = await currentUser()
  if (!user) redirect('/login?next=/rider')
  if (user.role !== 'delivery_partner') redirect('/forbidden')
  return user
}

function handle(err: unknown): DeliveryActionState {
  if (err instanceof DeliveryError) return { error: err.message }
  console.error('[logistics] action failed', err)
  return { error: 'We could not update that delivery.' }
}

export async function acceptJobAction(
  _prev: DeliveryActionState,
  formData: FormData,
): Promise<DeliveryActionState> {
  const rider = await requireRider()
  const parsed = parseForm(jobSchema, formData)
  if (!parsed.ok) return { error: parsed.error }

  try {
    await acceptJob(parsed.data.deliveryId, rider.id)
  } catch (err) {
    return handle(err)
  }
  revalidatePath('/rider')
  return { notice: 'Delivery accepted. Head to the pickup point.' }
}

export async function pickUpAction(
  _prev: DeliveryActionState,
  formData: FormData,
): Promise<DeliveryActionState> {
  const rider = await requireRider()
  const parsed = parseForm(jobSchema, formData)
  if (!parsed.ok) return { error: parsed.error }

  try {
    await markPickedUp(parsed.data.deliveryId, rider.id)
  } catch (err) {
    return handle(err)
  }
  revalidatePath('/rider')
  return { notice: 'Marked as collected.' }
}

/** Hand an assigned job back to the open board, before pickup. */
export async function declineJobAction(
  _prev: DeliveryActionState,
  formData: FormData,
): Promise<DeliveryActionState> {
  const rider = await requireRider()
  const parsed = parseForm(jobSchema, formData)
  if (!parsed.ok) return { error: parsed.error }

  try {
    await declineJob(parsed.data.deliveryId, rider.id)
  } catch (err) {
    return handle(err)
  }
  revalidatePath('/rider')
  return { notice: 'Handed back. The shop has been told.' }
}

export async function completeDeliveryAction(
  _prev: DeliveryActionState,
  formData: FormData,
): Promise<DeliveryActionState> {
  const rider = await requireRider()
  const parsed = parseForm(completeSchema, formData)
  if (!parsed.ok) {
    return { error: 'Record who received the order — that is the proof of delivery.' }
  }

  try {
    await completeDelivery(parsed.data.deliveryId, rider.id, parsed.data.proofNote)
  } catch (err) {
    return handle(err)
  }
  revalidatePath('/rider')
  revalidatePath('/rider/earnings')
  return { notice: 'Delivered. Your fee is in your wallet.' }
}
