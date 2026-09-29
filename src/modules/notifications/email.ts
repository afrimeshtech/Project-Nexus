/**
 * Transactional email, through Resend.
 *
 * Only the messages that cannot wait for the in-app inbox go out this way -
 * today, the one-time codes that verify an email address. Everything else
 * stays in-app until there is a reason to put it in someone's inbox.
 *
 * EMAIL_TRANSPORT=resend turns it on and needs RESEND_API_KEY and EMAIL_FROM
 * (an address on a domain verified in the Resend dashboard). Anything else is
 * "console": nothing is sent, and in development the code is shown on screen
 * instead - the identity module refuses that in production.
 */

const RESEND_API = 'https://api.resend.com'

export function emailTransport(): 'resend' | 'console' {
  return process.env.EMAIL_TRANSPORT === 'resend' ? 'resend' : 'console'
}

export async function sendEmail(message: {
  to: string
  subject: string
  text: string
  html: string
}): Promise<void> {
  const key = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!key || !from) {
    throw new Error('EMAIL_TRANSPORT=resend needs RESEND_API_KEY and EMAIL_FROM')
  }

  const response = await fetch(`${RESEND_API}/emails`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
    signal: AbortSignal.timeout(Number(process.env.EMAIL_TIMEOUT_MS ?? 10_000)),
  })
  if (!response.ok) {
    throw new Error(`Resend rejected the email: ${response.status} ${await response.text()}`)
  }
}

const PURPOSE_LINE: Record<string, string> = {
  login: 'to sign in to AfriMesh',
  register: 'to confirm your email and finish creating your AfriMesh account',
  reset: 'to reset your AfriMesh password',
}

export async function sendOtpEmail(
  to: string,
  code: string,
  purpose: string,
  ttlMinutes: number,
): Promise<void> {
  const why = PURPOSE_LINE[purpose] ?? 'to continue on AfriMesh'
  await sendEmail({
    to,
    subject: `${code} is your AfriMesh code`,
    text: `Your AfriMesh code is ${code}.\n\nEnter it ${why}. It expires in ${ttlMinutes} minutes.\n\nIf you did not ask for this code, you can ignore this email.`,
    // Email clients ignore stylesheets, so DESIGN.md's tokens are inlined as
    // their literal values: ink, muted, body 16px, the 1.5rem step, label.
    html: `<div style="font-family:Inter,Arial,sans-serif;font-size:16px;color:#203a2d;line-height:1.65">
  <p>Your AfriMesh code is</p>
  <p style="font-size:24px;font-weight:bold;letter-spacing:6px;margin:8px 0 16px">${code}</p>
  <p>Enter it ${why}. It expires in ${ttlMinutes} minutes.</p>
  <p style="color:#636e6a;font-size:14px">If you did not ask for this code, you can ignore this email.</p>
</div>`,
  })
}
