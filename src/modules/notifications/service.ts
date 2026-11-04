import { getSql, type Sql } from '@/db/client'

/**
 * MODULE: notifications
 *
 * Event-driven, multi-channel, with retries and delivery tracking (SAD
 * "Notification Service"). Channels: in-app, push, SMS, email. WhatsApp and
 * voice are listed as future channels and slot in as another transport below.
 *
 * A notification is always persisted first and delivered second, so an outage
 * in a third-party provider can never lose a message - it stays `queued` and
 * is retried.
 */

export type NotificationChannel = 'in_app' | 'push' | 'sms' | 'email'

export interface NotificationInput {
  userId: string
  title: string
  body: string
  category?: string
  channel?: NotificationChannel
  referenceType?: string | null
  referenceId?: string | null
}

export interface Notification {
  id: string
  user_id: string
  channel: NotificationChannel
  title: string
  body: string
  category: string
  reference_type: string | null
  reference_id: string | null
  status: 'queued' | 'sent' | 'failed'
  attempts: number
  read_at: Date | null
  created_at: Date
}

// --- Transports ------------------------------------------------------------
// One interface, many providers. Adding Termii/Twilio/FCM means adding a
// transport here; nothing that emits a notification changes.

interface Transport {
  send(notification: Notification): Promise<void>
}

const consoleTransport: Transport = {
  async send(n) {
    console.log(`[notify:${n.channel}] -> ${n.user_id} | ${n.title} — ${n.body}`)
  },
}

function transportFor(_channel: NotificationChannel): Transport {
  switch (process.env.NOTIFICATION_TRANSPORT ?? 'console') {
    // case 'termii': return termiiTransport
    // case 'smtp':   return smtpTransport
    default:
      return consoleTransport
  }
}

// --- API -------------------------------------------------------------------

export async function queueNotification(
  input: NotificationInput,
  tx?: Sql,
): Promise<Notification | null> {
  const sql = tx ?? (await getSql())
  const row = await sql.one<Notification>(
    `INSERT INTO notifications (user_id, channel, title, body, category, reference_type, reference_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      input.userId,
      input.channel ?? 'in_app',
      input.title,
      input.body,
      input.category ?? 'general',
      input.referenceType ?? null,
      input.referenceId ?? null,
    ],
  )
  if (!row) return null

  // In-app messages are readable the moment they are stored; other channels
  // need an outbound send. Failures are recorded, not thrown - a notification
  // must never roll back the commerce operation that triggered it.
  try {
    await transportFor(row.channel).send(row)
    await sql.query(
      `UPDATE notifications SET status = 'sent', sent_at = now(), attempts = attempts + 1 WHERE id = $1`,
      [row.id],
    )
    return { ...row, status: 'sent' }
  } catch (err) {
    console.error('[notify] delivery failed', err)
    await sql.query(
      `UPDATE notifications SET status = 'failed', attempts = attempts + 1 WHERE id = $1`,
      [row.id],
    )
    return { ...row, status: 'failed' }
  }
}

/** Retry anything still queued or failed. Called by a scheduled job. */
export async function retryPending(limit = 50): Promise<number> {
  const sql = await getSql()
  const rows = await sql.query<Notification>(
    `SELECT * FROM notifications
      WHERE status IN ('queued','failed') AND attempts < 5
      ORDER BY created_at ASC LIMIT $1`,
    [limit],
  )
  let sent = 0
  for (const row of rows) {
    try {
      await transportFor(row.channel).send(row)
      await sql.query(
        `UPDATE notifications SET status='sent', sent_at=now(), attempts=attempts+1 WHERE id=$1`,
        [row.id],
      )
      sent++
    } catch {
      await sql.query(`UPDATE notifications SET attempts = attempts + 1 WHERE id = $1`, [row.id])
    }
  }
  return sent
}

export async function listNotifications(userId: string, limit = 30): Promise<Notification[]> {
  const sql = await getSql()
  return sql.query<Notification>(
    `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  )
}

export async function unreadCount(userId: string): Promise<number> {
  const sql = await getSql()
  const row = await sql.one<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  )
  return row?.count ?? 0
}

/**
 * The user has opened the thing these notifications point at (an order, a
 * support conversation), so they have been acted on. Before this only "Mark
 * all read" cleared anything, and the bell kept counting an order the buyer
 * had already opened from it.
 */
export async function markReadForReference(
  userId: string,
  referenceType: string,
  referenceId: string,
): Promise<void> {
  const sql = await getSql()
  await sql.query(
    `UPDATE notifications SET read_at = now()
      WHERE user_id = $1 AND reference_type = $2 AND reference_id = $3 AND read_at IS NULL`,
    [userId, referenceType, referenceId],
  )
}

/** Mark specific notifications read - scoped to the user, so ids can't reach anyone else's. */
export async function markRead(userId: string, ids: string[]): Promise<void> {
  if (!ids.length) return
  const sql = await getSql()
  await sql.query(
    `UPDATE notifications SET read_at = now()
      WHERE user_id = $1 AND id = ANY($2::uuid[]) AND read_at IS NULL`,
    [userId, ids],
  )
}

export async function markAllRead(userId: string): Promise<void> {
  const sql = await getSql()
  await sql.query(
    `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  )
}
