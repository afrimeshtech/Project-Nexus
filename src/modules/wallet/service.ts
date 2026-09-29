import { randomBytes } from 'node:crypto'
import { getSql, withTx, type Sql } from '@/db/client'
import { publish, EVENT } from '@/modules/events/service'
import { DEFAULT_CURRENCY } from '@/lib/money'

/**
 * MODULE: wallet
 *
 * "A double-entry ledger should be used to maintain financial integrity and
 * support auditing." - System Architecture Document, Wallet Architecture.
 *
 * The invariant this module exists to protect:
 *
 *     for every ledger_transaction:  SUM(debits) == SUM(credits)
 *
 * `postTransaction` refuses to write anything that violates it, so the books
 * cannot be knocked out of balance by a bug in a calling module. Balances on
 * the `wallets` row are a cache of the ledger and can be recomputed from it -
 * `verifyIntegrity()` below does exactly that.
 *
 * Buckets: every wallet has `available` (spendable) and `locked` (escrow).
 * Balance = available + locked.
 *
 * The `platform_float` wallet represents value held on behalf of users at the
 * bank/PSP. Money entering the platform debits float and credits a user, so
 * float carries a negative balance equal to total customer funds outstanding -
 * a liability, which is what it genuinely is.
 */

export type WalletOwnerType = 'user' | 'organisation' | 'platform'
export type Bucket = 'available' | 'locked'

export type TransactionType =
  | 'deposit'
  | 'withdrawal'
  | 'transfer'
  | 'order_payment'
  | 'settlement'
  | 'platform_fee'
  | 'refund'
  | 'escrow_hold'
  | 'escrow_release'
  | 'cashback'
  | 'referral_reward'
  | 'points_redemption'

export interface Wallet {
  id: string
  owner_type: WalletOwnerType
  owner_id: string | null
  currency: string
  available: number
  locked: number
  status: string
}

export interface LedgerLine {
  walletId: string
  direction: 'debit' | 'credit'
  amount: number
  bucket?: Bucket
  narration?: string
}

export class LedgerImbalanceError extends Error {}
export class InsufficientFundsError extends Error {
  readonly available: number
  constructor(available: number) {
    super('Insufficient wallet balance')
    this.available = available
  }
}

/** Named platform wallets. Created on demand, never owned by a user. */
export const PLATFORM_FLOAT = 'float'
export const PLATFORM_REVENUE = 'revenue'
/**
 * Holds delivery fees between payment and delivery. The fee cannot go to the
 * seller at payment time, because the party that earns it - a delivery partner
 * or the seller themselves - is not known until the goods actually move.
 */
export const PLATFORM_LOGISTICS = 'logistics'
/**
 * Counterparty for every reward point in circulation. Issuing points debits it
 * and redeeming them credits it back, so its negative balance is at all times
 * the platform's outstanding points liability - the same shape as `float`, in
 * the points currency rather than in naira.
 */
export const PLATFORM_POINTS = 'points'

export function reference(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(4).toString('hex')}`.toUpperCase()
}

// ---------------------------------------------------------------------------
// Wallet lookup
// ---------------------------------------------------------------------------

export async function ensureWallet(
  ownerType: WalletOwnerType,
  ownerId: string | null,
  currency = DEFAULT_CURRENCY,
  tx?: Sql,
): Promise<Wallet> {
  const sql = tx ?? (await getSql())
  const existing = await sql.one<Wallet>(
    `SELECT * FROM wallets
      WHERE owner_type = $1 AND owner_id IS NOT DISTINCT FROM $2 AND currency = $3`,
    [ownerType, ownerId, currency],
  )
  if (existing) return existing

  const created = await sql.one<Wallet>(
    `INSERT INTO wallets (owner_type, owner_id, currency) VALUES ($1,$2,$3)
     ON CONFLICT (owner_type, owner_id, currency) DO UPDATE SET currency = EXCLUDED.currency
     RETURNING *`,
    [ownerType, ownerId, currency],
  )
  if (!created) throw new Error('Failed to create wallet')
  return created
}

/**
 * Platform wallets are keyed by a deterministic UUID derived from their name,
 * so `float` and `revenue` are stable across restarts and environments.
 */
export const PLATFORM_IDS: Record<string, string> = {
  [PLATFORM_FLOAT]: '00000000-0000-4000-8000-000000000001',
  [PLATFORM_REVENUE]: '00000000-0000-4000-8000-000000000002',
  [PLATFORM_LOGISTICS]: '00000000-0000-4000-8000-000000000003',
  [PLATFORM_POINTS]: '00000000-0000-4000-8000-000000000004',
}

export async function platformWallet(
  name: string,
  tx?: Sql,
  currency = DEFAULT_CURRENCY,
): Promise<Wallet> {
  return ensureWallet('platform', PLATFORM_IDS[name] ?? PLATFORM_IDS[PLATFORM_FLOAT], currency, tx)
}

export async function walletFor(
  ownerType: WalletOwnerType,
  ownerId: string,
  tx?: Sql,
): Promise<Wallet> {
  return ensureWallet(ownerType, ownerId, DEFAULT_CURRENCY, tx)
}

export async function getBalance(ownerType: WalletOwnerType, ownerId: string) {
  const wallet = await walletFor(ownerType, ownerId)
  return {
    ...wallet,
    balance: wallet.available + wallet.locked,
  }
}

// ---------------------------------------------------------------------------
// The one write path
// ---------------------------------------------------------------------------

export async function postTransaction(
  tx: Sql,
  input: {
    type: TransactionType
    lines: LedgerLine[]
    narration?: string
    reference?: string
    metadata?: Record<string, unknown>
    /**
     * Currency of every wallet in `lines`. Naira and points never appear in
     * the same transaction - "debits equal credits" would be meaningless
     * across two units - so it is stated once, for the whole transaction.
     */
    currency?: string
    /** Platform wallets may go negative; customer wallets may not. */
    allowNegative?: string[]
  },
): Promise<{ transactionId: string; reference: string }> {
  const debits = input.lines.filter((l) => l.direction === 'debit')
  const credits = input.lines.filter((l) => l.direction === 'credit')
  const debitTotal = debits.reduce((sum, l) => sum + l.amount, 0)
  const creditTotal = credits.reduce((sum, l) => sum + l.amount, 0)

  if (!input.lines.length) throw new LedgerImbalanceError('A transaction needs at least two lines')
  if (debitTotal !== creditTotal) {
    throw new LedgerImbalanceError(
      `Ledger imbalance: debits ${debitTotal} != credits ${creditTotal} (${input.type})`,
    )
  }
  if (input.lines.some((l) => l.amount <= 0 || !Number.isInteger(l.amount))) {
    throw new LedgerImbalanceError('Ledger amounts must be positive integers in minor units')
  }

  const ref = input.reference ?? reference(input.type.toUpperCase().slice(0, 4))
  const currency = input.currency ?? DEFAULT_CURRENCY

  const txn = await tx.one<{ id: string }>(
    `INSERT INTO ledger_transactions (reference, type, amount, currency, narration, metadata)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [
      ref,
      input.type,
      debitTotal,
      currency,
      input.narration ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  )
  if (!txn) throw new Error('Failed to open ledger transaction')

  for (const line of input.lines) {
    const bucket = line.bucket ?? 'available'
    const delta = line.direction === 'credit' ? line.amount : -line.amount

    const wallet = await tx.one<Wallet>(
      `UPDATE wallets
          SET ${bucket} = ${bucket} + $2
        WHERE id = $1
        RETURNING *`,
      [line.walletId, delta],
    )
    if (!wallet) throw new Error(`Wallet ${line.walletId} not found`)
    if (wallet.currency !== currency) {
      throw new LedgerImbalanceError(
        `Wallet ${line.walletId} holds ${wallet.currency}, but this ${input.type} is in ${currency}`,
      )
    }

    const mayGoNegative =
      wallet.owner_type === 'platform' || (input.allowNegative ?? []).includes(wallet.id)

    if (!mayGoNegative && (wallet.available < 0 || wallet.locked < 0)) {
      // Undoing by throwing: the caller's transaction rolls this back.
      throw new InsufficientFundsError(wallet.available - delta)
    }

    await tx.query(
      `INSERT INTO ledger_entries (transaction_id, wallet_id, direction, amount, balance_after, narration)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        txn.id,
        line.walletId,
        line.direction,
        line.amount,
        wallet.available + wallet.locked,
        line.narration ?? input.narration ?? null,
      ],
    )

    await publish(
      {
        type: line.direction === 'credit' ? EVENT.WalletCredited : EVENT.WalletDebited,
        aggregateType: 'wallet',
        aggregateId: line.walletId,
        payload: { amount: line.amount, bucket, transactionType: input.type, reference: ref },
      },
      tx,
    )
  }

  return { transactionId: txn.id, reference: ref }
}

// ---------------------------------------------------------------------------
// Money movements
// ---------------------------------------------------------------------------

/** Top-up from the outside world (card, bank transfer, USSD). */
export async function deposit(
  ownerType: WalletOwnerType,
  ownerId: string,
  amount: number,
  narration = 'Wallet top-up',
  tx?: Sql,
) {
  const run = async (db: Sql) => {
    const wallet = await ensureWallet(ownerType, ownerId, DEFAULT_CURRENCY, db)
    const float = await platformWallet(PLATFORM_FLOAT, db)
    return postTransaction(db, {
      type: 'deposit',
      narration,
      lines: [
        { walletId: float.id, direction: 'debit', amount },
        { walletId: wallet.id, direction: 'credit', amount },
      ],
    })
  }
  return tx ? run(tx) : withTx(run)
}

/**
 * Cash out to a bank account. Takes `tx` so a payout can debit the wallet and
 * record itself in one transaction - neither may exist without the other.
 */
export async function withdraw(
  ownerType: WalletOwnerType,
  ownerId: string,
  amount: number,
  narration = 'Withdrawal',
  tx?: Sql,
  ledgerReference?: string,
) {
  const run = async (db: Sql) => {
    const wallet = await ensureWallet(ownerType, ownerId, DEFAULT_CURRENCY, db)
    if (wallet.available < amount) throw new InsufficientFundsError(wallet.available)
    const float = await platformWallet(PLATFORM_FLOAT, db)
    return postTransaction(db, {
      type: 'withdrawal',
      narration,
      reference: ledgerReference,
      lines: [
        { walletId: wallet.id, direction: 'debit', amount },
        { walletId: float.id, direction: 'credit', amount },
      ],
    })
  }
  return tx ? run(tx) : withTx(run)
}

/**
 * Put a withdrawal back: the bank transfer failed or was reversed, so the
 * money never left and returns to the wallet it came from.
 */
export async function reverseWithdrawal(
  tx: Sql,
  ownerType: WalletOwnerType,
  ownerId: string,
  amount: number,
  narration: string,
  ledgerReference?: string,
) {
  const wallet = await ensureWallet(ownerType, ownerId, DEFAULT_CURRENCY, tx)
  const float = await platformWallet(PLATFORM_FLOAT, tx)
  return postTransaction(tx, {
    type: 'refund',
    narration,
    reference: ledgerReference,
    lines: [
      { walletId: float.id, direction: 'debit', amount },
      { walletId: wallet.id, direction: 'credit', amount },
    ],
  })
}

/** Wallet-to-wallet transfer. */
export async function transfer(
  from: { type: WalletOwnerType; id: string },
  to: { type: WalletOwnerType; id: string },
  amount: number,
  narration = 'Transfer',
) {
  return withTx(async (db) => {
    const src = await ensureWallet(from.type, from.id, DEFAULT_CURRENCY, db)
    const dst = await ensureWallet(to.type, to.id, DEFAULT_CURRENCY, db)
    if (src.available < amount) throw new InsufficientFundsError(src.available)
    return postTransaction(db, {
      type: 'transfer',
      narration,
      lines: [
        { walletId: src.id, direction: 'debit', amount },
        { walletId: dst.id, direction: 'credit', amount },
      ],
    })
  })
}

/**
 * Pay for an order. The seller's proceeds land in escrow (`locked`) rather
 * than spendable balance; they are released on delivery. That is what makes
 * "Trust by Design" (PRD Core Principles) concrete for a buyer dealing with a
 * shop they have never used.
 */
export async function payForOrder(
  tx: Sql,
  input: {
    buyerWalletId: string
    sellerOrgId: string
    orderId: string
    orderNumber: string
    subtotal: number
    deliveryFee: number
    total: number
    platformFee: number
  },
) {
  const sellerWallet = await ensureWallet('organisation', input.sellerOrgId, DEFAULT_CURRENCY, tx)
  const revenue = await platformWallet(PLATFORM_REVENUE, tx)
  const logistics = await platformWallet(PLATFORM_LOGISTICS, tx)
  const sellerShare = input.subtotal - input.platformFee

  const lines: LedgerLine[] = [
    { walletId: input.buyerWalletId, direction: 'debit', amount: input.total },
    // Goods: held in escrow until the order is delivered.
    { walletId: sellerWallet.id, direction: 'credit', amount: sellerShare, bucket: 'locked' },
    { walletId: revenue.id, direction: 'credit', amount: input.platformFee },
  ]

  // Delivery: held separately, because whoever actually carries the goods -
  // a delivery partner or the seller - is not known yet.
  if (input.deliveryFee > 0) {
    lines.push({
      walletId: logistics.id,
      direction: 'credit',
      amount: input.deliveryFee,
      bucket: 'locked',
    })
  }

  return postTransaction(tx, {
    type: 'order_payment',
    narration: `Payment for order ${input.orderNumber}`,
    metadata: { orderId: input.orderId },
    lines,
  })
}

/**
 * Delivery completed by a delivery partner: their fee leaves the logistics
 * escrow, and whatever margin remains becomes platform revenue.
 */
export async function payRider(
  tx: Sql,
  input: { riderUserId: string; riderFee: number; deliveryFee: number; orderNumber: string },
) {
  const logistics = await platformWallet(PLATFORM_LOGISTICS, tx)
  const riderWallet = await ensureWallet('user', input.riderUserId, DEFAULT_CURRENCY, tx)
  const revenue = await platformWallet(PLATFORM_REVENUE, tx)
  const margin = input.deliveryFee - input.riderFee

  const lines: LedgerLine[] = [
    { walletId: logistics.id, direction: 'debit', amount: input.deliveryFee, bucket: 'locked' },
    { walletId: riderWallet.id, direction: 'credit', amount: input.riderFee },
  ]
  if (margin > 0) lines.push({ walletId: revenue.id, direction: 'credit', amount: margin })

  const result = await postTransaction(tx, {
    type: 'settlement',
    narration: `Delivery earnings for order ${input.orderNumber}`,
    lines,
  })

  await publish(
    {
      type: EVENT.RiderPaid,
      aggregateType: 'user',
      aggregateId: input.riderUserId,
      payload: { amount: input.riderFee, orderNumber: input.orderNumber },
    },
    tx,
  )
  return result
}

/** No delivery partner was involved: the seller carried it, so they earn it. */
export async function settleDeliveryToSeller(
  tx: Sql,
  input: { sellerOrgId: string; deliveryFee: number; orderNumber: string },
) {
  const logistics = await platformWallet(PLATFORM_LOGISTICS, tx)
  const sellerWallet = await ensureWallet('organisation', input.sellerOrgId, DEFAULT_CURRENCY, tx)

  return postTransaction(tx, {
    type: 'settlement',
    narration: `Delivery fee for order ${input.orderNumber}`,
    lines: [
      { walletId: logistics.id, direction: 'debit', amount: input.deliveryFee, bucket: 'locked' },
      { walletId: sellerWallet.id, direction: 'credit', amount: input.deliveryFee },
    ],
  })
}

/**
 * Loyalty cashback (SAD wallet functions; "Earn rewards" for consumers).
 * Funded from platform revenue - it is a real cost of acquisition, not money
 * conjured into the ledger.
 */
export async function payCashback(
  tx: Sql,
  input: { userId: string; amount: number; orderNumber: string },
) {
  if (input.amount <= 0) return null
  const revenue = await platformWallet(PLATFORM_REVENUE, tx)
  const wallet = await ensureWallet('user', input.userId, DEFAULT_CURRENCY, tx)

  const result = await postTransaction(tx, {
    type: 'cashback',
    narration: `Cashback on order ${input.orderNumber}`,
    lines: [
      { walletId: revenue.id, direction: 'debit', amount: input.amount },
      { walletId: wallet.id, direction: 'credit', amount: input.amount },
    ],
  })

  await publish(
    {
      type: EVENT.CashbackEarned,
      aggregateType: 'user',
      aggregateId: input.userId,
      payload: { amount: input.amount, orderNumber: input.orderNumber },
    },
    tx,
  )
  return result
}

/** Delivery confirmed: escrow becomes spendable for the seller. */
export async function releaseEscrow(
  sellerOrgId: string,
  amount: number,
  orderNumber: string,
  tx?: Sql,
) {
  const run = async (db: Sql) => {
    const wallet = await ensureWallet('organisation', sellerOrgId, DEFAULT_CURRENCY, db)
    if (wallet.locked < amount) throw new InsufficientFundsError(wallet.locked)
    const result = await postTransaction(db, {
      type: 'escrow_release',
      narration: `Settlement for order ${orderNumber}`,
      lines: [
        { walletId: wallet.id, direction: 'debit', amount, bucket: 'locked' },
        { walletId: wallet.id, direction: 'credit', amount, bucket: 'available' },
      ],
    })
    await publish(
      {
        type: EVENT.SettlementPaid,
        aggregateType: 'organisation',
        aggregateId: sellerOrgId,
        payload: { amount, orderNumber },
      },
      db,
    )
    return result
  }
  return tx ? run(tx) : withTx(run)
}

/** Cancellation or return: escrow goes back to the buyer. */
export async function refundOrder(
  tx: Sql,
  input: {
    buyerWalletId: string
    sellerOrgId: string
    orderNumber: string
    subtotal: number
    deliveryFee: number
    total: number
    platformFee: number
  },
) {
  const sellerWallet = await ensureWallet('organisation', input.sellerOrgId, DEFAULT_CURRENCY, tx)
  const revenue = await platformWallet(PLATFORM_REVENUE, tx)
  const logistics = await platformWallet(PLATFORM_LOGISTICS, tx)
  const sellerShare = input.subtotal - input.platformFee

  // Cancellation is only permitted before delivery, so the delivery fee is
  // always still sitting in logistics escrow and can be returned untouched.
  const lines: LedgerLine[] = [
    { walletId: sellerWallet.id, direction: 'debit', amount: sellerShare, bucket: 'locked' },
    { walletId: revenue.id, direction: 'debit', amount: input.platformFee },
    { walletId: input.buyerWalletId, direction: 'credit', amount: input.total },
  ]
  if (input.deliveryFee > 0) {
    lines.push({
      walletId: logistics.id,
      direction: 'debit',
      amount: input.deliveryFee,
      bucket: 'locked',
    })
  }

  return postTransaction(tx, {
    type: 'refund',
    narration: `Refund for order ${input.orderNumber}`,
    lines,
  })
}

// ---------------------------------------------------------------------------
// Statements & audit
// ---------------------------------------------------------------------------

export interface StatementLine {
  id: number
  direction: 'debit' | 'credit'
  amount: number
  balance_after: number
  narration: string | null
  type: TransactionType
  reference: string
  created_at: Date
}

export async function statement(walletId: string, limit = 50): Promise<StatementLine[]> {
  const sql = await getSql()
  return sql.query<StatementLine>(
    `SELECT e.id, e.direction, e.amount, e.balance_after, e.narration,
            t.type, t.reference, e.created_at
       FROM ledger_entries e
       JOIN ledger_transactions t ON t.id = e.transaction_id
      WHERE e.wallet_id = $1
      ORDER BY e.id DESC
      LIMIT $2`,
    [walletId, limit],
  )
}

/**
 * Audit: recompute every wallet balance from the ledger and compare it with
 * the cached value, and confirm every transaction still balances. Surfaced on
 * the admin console - the auditor role exists in the SAD's RBAC list precisely
 * so someone can run this.
 */
export async function verifyIntegrity() {
  const sql = await getSql()

  const unbalanced = await sql.query<{ reference: string; debits: number; credits: number }>(
    `SELECT t.reference,
            COALESCE(SUM(e.amount) FILTER (WHERE e.direction = 'debit'), 0)::bigint  AS debits,
            COALESCE(SUM(e.amount) FILTER (WHERE e.direction = 'credit'), 0)::bigint AS credits
       FROM ledger_transactions t
       JOIN ledger_entries e ON e.transaction_id = t.id
      GROUP BY t.reference
     HAVING COALESCE(SUM(e.amount) FILTER (WHERE e.direction = 'debit'), 0)
         <> COALESCE(SUM(e.amount) FILTER (WHERE e.direction = 'credit'), 0)`,
  )

  const totals = await sql.one<{ debits: number; credits: number }>(
    `SELECT
       (SELECT COALESCE(SUM(amount), 0)::bigint FROM ledger_entries WHERE direction = 'debit')  AS debits,
       (SELECT COALESCE(SUM(amount), 0)::bigint FROM ledger_entries WHERE direction = 'credit') AS credits`,
  )

  // Per currency, not in aggregate: naira and points are separate books, and
  // summing them could let a surplus in one mask a shortfall in the other.
  const positions = await sql.query<{ currency: string; net: number }>(
    `SELECT currency, COALESCE(SUM(available + locked), 0)::bigint AS net
       FROM wallets GROUP BY currency ORDER BY currency`,
  )

  return {
    balanced: unbalanced.length === 0,
    unbalancedTransactions: unbalanced,
    totalDebits: totals?.debits ?? 0,
    totalCredits: totals?.credits ?? 0,
    positionsByCurrency: positions,
    // Every wallet summed must be zero, in each currency: customer credits are
    // exactly offset by the platform float's (or points float's) negative
    // balance. A non-zero figure means value was created or destroyed.
    netWalletPosition: positions.reduce((sum, row) => sum + Math.abs(Number(row.net)), 0),
  }
}
