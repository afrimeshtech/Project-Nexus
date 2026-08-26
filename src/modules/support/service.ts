import { getSql } from '@/db/client'

/**
 * MODULE: support
 *
 * "Contact us" submissions. No real email/SMS provider exists yet — same
 * position as notifications and payments elsewhere in this codebase — so the
 * message is genuinely stored (a real support team could query
 * `contact_messages` today) and the delivery side is simulated by logging
 * what a real transport would have sent, not by pretending to send it.
 */

export interface ContactMessageInput {
  userId: string | null
  name: string
  email: string
  message: string
  source: 'consumer' | 'partner' | 'showcase'
}

export async function submitContactMessage(input: ContactMessageInput): Promise<void> {
  const sql = await getSql()
  await sql.query(
    `INSERT INTO contact_messages (user_id, name, email, message, source)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.userId, input.name, input.email, input.message, input.source],
  )

  // Simulated transport, exactly as `requestOtpAction` logs the code it
  // cannot actually SMS: a real deployment wires this to an inbox or a
  // ticketing webhook, not a console.
  console.log(`[support] new contact message from ${input.name} <${input.email}> (${input.source})`)
}
