import { getSql, withTx, type Sql } from '@/db/client'
import { queueNotification } from '@/modules/notifications/service'

/**
 * MODULE: support
 *
 * Two ways to reach AfriMesh.
 *
 * A signed-in shopper or retailer opens a support thread: a two-way
 * conversation an administrator answers from the console, with a
 * notification each way so neither side has to keep checking.
 *
 * A signed-out visitor has no account to reply to, so they leave a message
 * and an email in `contact_messages`; the console lists those for a reply by
 * email. No email provider is wired yet, so that send is still logged rather
 * than pretended.
 */

// ---------------------------------------------------------------------------
// Signed-out visitors
// ---------------------------------------------------------------------------

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
  console.log(`[support] new contact message from ${input.name} <${input.email}> (${input.source})`)
}

export interface VisitorMessage {
  id: string
  name: string
  email: string
  message: string
  source: string
  created_at: Date
}

export async function recentVisitorMessages(limit = 20): Promise<VisitorMessage[]> {
  const sql = await getSql()
  return sql.query<VisitorMessage>(
    `SELECT id, name, email, message, source, created_at
       FROM contact_messages ORDER BY created_at DESC LIMIT $1`,
    [limit],
  )
}

// ---------------------------------------------------------------------------
// Support threads
// ---------------------------------------------------------------------------

export type SupportSource = 'consumer' | 'partner'
export type SupportSide = 'member' | 'admin'

export class SupportError extends Error {}

export interface SupportThread {
  id: string
  user_id: string
  organisation_id: string | null
  source: SupportSource
  subject: string
  status: 'open' | 'closed'
  last_message_at: Date
  created_at: Date
}

export interface SupportThreadSummary extends SupportThread {
  member_name: string
  organisation_name: string | null
  last_body: string | null
  last_side: SupportSide | null
  /** Unread messages from the other side, for whoever is asking. */
  unread: number
}

export interface SupportMessage {
  id: string
  thread_id: string
  sender_side: SupportSide
  sender_name: string | null
  body: string
  read_at: Date | null
  created_at: Date
}

const MAX_BODY = 2000

function cleanBody(body: string) {
  const text = body.trim()
  if (!text) throw new SupportError('Write a message first')
  if (text.length > MAX_BODY) throw new SupportError('That message is too long')
  return text
}

/** Administrators who can answer, for "a member wrote" notifications. */
async function supportStaff(sql: Sql): Promise<string[]> {
  const rows = await sql.query<{ id: string }>(
    `SELECT id FROM users WHERE role IN ('super_admin', 'platform_admin') AND status = 'active'`,
  )
  return rows.map((r) => r.id)
}

/** Open a thread with its first message, and tell the support team. */
export async function openSupportThread(input: {
  userId: string
  organisationId: string | null
  source: SupportSource
  subject: string
  body: string
}): Promise<SupportThread> {
  const subject = input.subject.trim().slice(0, 120)
  if (!subject) throw new SupportError('Add a short subject')
  const body = cleanBody(input.body)

  return withTx(async (tx) => {
    const thread = await tx.one<SupportThread>(
      `INSERT INTO support_threads (user_id, organisation_id, source, subject)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [input.userId, input.organisationId, input.source, subject],
    )
    if (!thread) throw new SupportError('Could not start that conversation')
    await tx.query(
      `INSERT INTO support_messages (thread_id, sender_user_id, sender_side, body)
       VALUES ($1, $2, 'member', $3)`,
      [thread.id, input.userId, body],
    )
    for (const staffId of await supportStaff(tx)) {
      await queueNotification(
        {
          userId: staffId,
          title:
            input.source === 'partner'
              ? 'New message from a retailer'
              : 'New message from a shopper',
          body: subject,
          category: 'support',
          referenceType: 'support_admin',
          referenceId: thread.id,
        },
        tx,
      )
    }
    return thread
  })
}

/**
 * The thread, if this viewer may see it. A member sees only their own; an
 * administrator sees every thread.
 */
export async function supportThreadFor(
  threadId: string,
  viewer: { userId: string; isAdmin: boolean },
): Promise<SupportThread | null> {
  const sql = await getSql()
  const thread = await sql.one<SupportThread>(`SELECT * FROM support_threads WHERE id = $1`, [
    threadId,
  ])
  if (!thread) return null
  if (!viewer.isAdmin && thread.user_id !== viewer.userId) return null
  return thread
}

/** The messages, oldest first, marking the other side's as read. */
export async function readSupportThread(
  thread: SupportThread,
  readerSide: SupportSide,
): Promise<SupportMessage[]> {
  const sql = await getSql()
  await sql.query(
    `UPDATE support_messages SET read_at = now()
      WHERE thread_id = $1 AND sender_side <> $2 AND read_at IS NULL`,
    [thread.id, readerSide],
  )
  return sql.query<SupportMessage>(
    `SELECT m.id, m.thread_id, m.sender_side, u.full_name AS sender_name, m.body, m.read_at,
            m.created_at
       FROM support_messages m LEFT JOIN users u ON u.id = m.sender_user_id
      WHERE m.thread_id = $1
      ORDER BY m.created_at`,
    [thread.id],
  )
}

/** Reply on a thread. A reply reopens a closed thread. */
export async function replySupport(input: {
  thread: SupportThread
  senderUserId: string
  side: SupportSide
  body: string
}): Promise<void> {
  const body = cleanBody(input.body)
  await withTx(async (tx) => {
    await tx.query(
      `INSERT INTO support_messages (thread_id, sender_user_id, sender_side, body)
       VALUES ($1, $2, $3, $4)`,
      [input.thread.id, input.senderUserId, input.side, body],
    )
    await tx.query(
      `UPDATE support_threads SET last_message_at = now(), status = 'open' WHERE id = $1`,
      [input.thread.id],
    )

    if (input.side === 'admin') {
      await queueNotification(
        {
          userId: input.thread.user_id,
          title: 'AfriMesh support replied',
          body: input.thread.subject,
          category: 'support',
          referenceType: input.thread.source === 'partner' ? 'support_partner' : 'support',
          referenceId: input.thread.id,
        },
        tx,
      )
    } else {
      for (const staffId of await supportStaff(tx)) {
        await queueNotification(
          {
            userId: staffId,
            title: 'New reply on a support conversation',
            body: input.thread.subject,
            category: 'support',
            referenceType: 'support_admin',
            referenceId: input.thread.id,
          },
          tx,
        )
      }
    }
  })
}

export async function setSupportStatus(threadId: string, status: 'open' | 'closed') {
  const sql = await getSql()
  await sql.query(`UPDATE support_threads SET status = $2 WHERE id = $1`, [threadId, status])
}

const SUMMARY = (unreadFrom: SupportSide) => `
  SELECT t.*, u.full_name AS member_name, o.name AS organisation_name,
         (SELECT body FROM support_messages m WHERE m.thread_id = t.id
           ORDER BY m.created_at DESC LIMIT 1) AS last_body,
         (SELECT sender_side FROM support_messages m WHERE m.thread_id = t.id
           ORDER BY m.created_at DESC LIMIT 1) AS last_side,
         (SELECT COUNT(*)::int FROM support_messages m
           WHERE m.thread_id = t.id AND m.sender_side = '${unreadFrom}' AND m.read_at IS NULL) AS unread
    FROM support_threads t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN organisations o ON o.id = t.organisation_id`

/** A member's own threads, newest activity first. */
export async function supportThreadsForUser(
  userId: string,
  source?: SupportSource,
): Promise<SupportThreadSummary[]> {
  const sql = await getSql()
  return sql.query<SupportThreadSummary>(
    `${SUMMARY('admin')} WHERE t.user_id = $1 AND ($2::text IS NULL OR t.source = $2)
      ORDER BY t.last_message_at DESC LIMIT 50`,
    [userId, source ?? null],
  )
}

/** The console's inbox: open threads first, then by latest activity. */
export async function supportThreadsForAdmin(
  status: 'open' | 'closed' | 'all' = 'open',
): Promise<SupportThreadSummary[]> {
  const sql = await getSql()
  return sql.query<SupportThreadSummary>(
    `${SUMMARY('member')} WHERE ($1 = 'all' OR t.status = $1)
      ORDER BY t.last_message_at DESC LIMIT 100`,
    [status],
  )
}

/** Unread replies from support, across a member's threads - for badges. */
export async function unreadSupportForUser(userId: string): Promise<number> {
  const sql = await getSql()
  const row = await sql.one<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM support_messages m
       JOIN support_threads t ON t.id = m.thread_id
      WHERE t.user_id = $1 AND m.sender_side = 'admin' AND m.read_at IS NULL`,
    [userId],
  )
  return row?.n ?? 0
}

/** Member messages no administrator has read yet - the console's badge. */
export async function unreadSupportForAdmin(): Promise<number> {
  const sql = await getSql()
  const row = await sql.one<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM support_messages
      WHERE sender_side = 'member' AND read_at IS NULL`,
  )
  return row?.n ?? 0
}
