'use server'

import { currentUser } from '@/lib/auth'
import { submitContactMessage } from '@/modules/support/service'
import { parseForm, requiredText, email, z } from '@/lib/forms'

export interface ContactFormState {
  error?: string
  notice?: string
}

const contactSchema = z.object({
  name: requiredText('Your name', 100),
  email,
  message: requiredText('Your message', 2000),
  source: z.enum(['consumer', 'partner', 'showcase']).catch('consumer'),
})

export async function submitContactAction(
  _prev: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const parsed = parseForm(contactSchema, formData)
  if (!parsed.ok) return { error: parsed.error }

  const user = await currentUser()

  try {
    await submitContactMessage({
      userId: user?.id ?? null,
      name: parsed.data.name,
      email: parsed.data.email,
      message: parsed.data.message,
      source: parsed.data.source,
    })
  } catch (err) {
    console.error('[contact] failed to store message', err)
    return { error: 'We could not send that. Please try again in a moment.' }
  }

  return { notice: "Message sent. We'll get back to you soon." }
}
