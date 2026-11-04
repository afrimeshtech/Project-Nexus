import { NextResponse } from 'next/server'
import { getSql } from '@/db/client'
import { currentOrganisation } from '@/lib/auth'
import { can } from '@/lib/org-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Orders paid at the signed-in member's store, for the dashboard's new-order
 * bell (components/shell/OrderAlerts).
 *
 * Paid, not placed: an order waiting on payment may never be paid (the
 * reservation sweeper cancels it after its window), so it is not yet work for
 * the counter. `confirmed_at` is set by completeOrderPayment, which every
 * payment path goes through - wallet, card and the Paystack webhook.
 *
 * Read from orders rather than notifications: the "Order paid" notification
 * goes to the owner only, and the bell should ring for whoever is minding the
 * dashboard - any member who can handle orders.
 *
 * `after` is the cursor this route returned last time: the latest
 * confirmed_at it has reported, as Postgres text so no precision is lost.
 * Every response covers LOOKBACK before the cursor too. confirmed_at is
 * now(), the time the payment's transaction *started*, so a payment that
 * started first can commit after a later one and land behind a cursor that
 * has already moved past it; with a strict `> after` it would never ring. The
 * overlap means an order can be reported more than once, so the client rings
 * only for numbers it has not seen.
 *
 * Without a cursor nothing is new: the first call sets the mark and returns
 * the overlap's orders, which the client records as already seen, so opening
 * the dashboard doesn't ring for orders that were already there.
 */
const LOOKBACK = '1 minute'

export async function GET(request: Request) {
  const org = await currentOrganisation()
  if (!org || !can(org.member_role, 'orders')) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  }

  const raw = new URL(request.url).searchParams.get('after')
  const after = raw && !Number.isNaN(Date.parse(raw)) ? raw : null

  const sql = await getSql()
  const mark = after
    ? after
    : (await sql.one<{ cursor: string }>(
        `SELECT COALESCE(MAX(confirmed_at), now())::text AS cursor
           FROM orders WHERE seller_org_id = $1`,
        [org.id],
      ))!.cursor

  // Aliased away from `confirmed_at` so ORDER BY sorts the timestamp, not its text.
  const orders = await sql.query<{ order_number: string; paid_text: string }>(
    `SELECT order_number, confirmed_at::text AS paid_text FROM orders
      WHERE seller_org_id = $1
        AND confirmed_at > $2::timestamptz - $3::interval
      ORDER BY confirmed_at DESC LIMIT 50`,
    [org.id, mark, LOOKBACK],
  )

  // The cursor only moves forward, and only to a time this response reported.
  const cursor = (
    await sql.one<{ cursor: string }>(
      `SELECT GREATEST($1::timestamptz, $2::timestamptz)::text AS cursor`,
      [mark, orders[0]?.paid_text ?? mark],
    )
  )!.cursor

  return NextResponse.json(
    { cursor, orderNumbers: orders.map((o) => o.order_number) },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
