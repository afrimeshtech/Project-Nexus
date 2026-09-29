import { randomUUID } from 'node:crypto'
import { getSql, withTx, type Sql } from '@/db/client'
import { publish, EVENT } from '@/modules/events/service'
import { queueNotification } from '@/modules/notifications/service'
import { claimWebhookEvent, paystackFetch } from '@/modules/payments/service'
import { reverseWithdrawal, withdraw } from '@/modules/wallet/service'

/**
 * MODULE: payouts - wallet withdrawals to a Nigerian bank account.
 *
 *   1. Save a bank account. The provider resolves the account number to the
 *      holder's name, and that name is shown before anything is saved, so
 *      money is never sent to a mistyped number.
 *   2. Request a payout. The wallet is debited and the payout recorded in one
 *      transaction; only then is the provider asked to send the money.
 *   3. The provider settles it. Paystack answers asynchronously, and its
 *      transfer.success / transfer.failed / transfer.reversed webhooks move the
 *      payout to paid or failed. A failure returns the money to the wallet.
 *
 * The provider follows PAYMENT_PROVIDER: "paystack" drives Paystack's
 * Transfers API; "mock" uses a fixed bank list, a fake name lookup and pays
 * instantly, so the whole flow can be exercised without moving real money.
 */

export type PayoutOwner = { type: 'user' | 'organisation'; id: string }
export type PayoutStatus = 'processing' | 'paid' | 'failed'

export interface Bank {
  code: string
  name: string
}

export interface BankAccount {
  id: string
  owner_type: 'user' | 'organisation'
  owner_id: string
  bank_code: string
  bank_name: string
  account_number: string
  account_name: string
  recipient_code: string | null
  created_at: Date
}

export interface Payout {
  id: string
  reference: string
  owner_type: 'user' | 'organisation'
  owner_id: string
  bank_account_id: string | null
  bank_name: string
  account_number: string
  account_name: string
  amount: number
  currency: string
  status: PayoutStatus
  provider: string
  provider_ref: string | null
  failure_reason: string | null
  created_at: Date
  completed_at: Date | null
}

/** A problem the person can act on; its message is safe to show them. */
export class PayoutError extends Error {}

/** Smallest withdrawal, in kobo. Below this a transfer fee outweighs it. */
export const MIN_PAYOUT = 100_00
const MAX_SAVED_ACCOUNTS = 5

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

interface TransferResult {
  status: 'paid' | 'processing' | 'failed'
  providerRef: string | null
  failureReason?: string
}

interface PayoutProvider {
  name: string
  listBanks(): Promise<Bank[]>
  resolveAccount(accountNumber: string, bankCode: string): Promise<string>
  createRecipient(account: {
    accountName: string
    accountNumber: string
    bankCode: string
  }): Promise<string | null>
  transfer(input: {
    amount: number
    reference: string
    recipientCode: string | null
    reason: string
  }): Promise<TransferResult>
}

/** The larger Nigerian banks and wallets, with their NIBSS codes. */
const MOCK_BANKS: Bank[] = [
  { code: '044', name: 'Access Bank' },
  { code: '023', name: 'Citibank Nigeria' },
  { code: '050', name: 'Ecobank Nigeria' },
  { code: '070', name: 'Fidelity Bank' },
  { code: '011', name: 'First Bank of Nigeria' },
  { code: '214', name: 'First City Monument Bank' },
  { code: '058', name: 'Guaranty Trust Bank' },
  { code: '030', name: 'Heritage Bank' },
  { code: '082', name: 'Keystone Bank' },
  { code: '50211', name: 'Kuda Bank' },
  { code: '50515', name: 'Moniepoint MFB' },
  { code: '999992', name: 'OPay' },
  { code: '999991', name: 'PalmPay' },
  { code: '076', name: 'Polaris Bank' },
  { code: '221', name: 'Stanbic IBTC Bank' },
  { code: '232', name: 'Sterling Bank' },
  { code: '032', name: 'Union Bank of Nigeria' },
  { code: '033', name: 'United Bank For Africa' },
  { code: '215', name: 'Unity Bank' },
  { code: '035', name: 'Wema Bank' },
  { code: '057', name: 'Zenith Bank' },
]

const mockProvider: PayoutProvider = {
  name: 'mock',
  async listBanks() {
    return MOCK_BANKS
  },
  async resolveAccount(accountNumber) {
    // Deterministic, so the same number always shows the same name. An
    // account number ending 0000 stands for one that does not exist.
    if (accountNumber.endsWith('0000')) {
      throw new PayoutError('We could not find that account number at that bank.')
    }
    return `TEST ACCOUNT ${accountNumber.slice(-4)}`
  },
  async createRecipient() {
    return null
  },
  async transfer(input) {
    return { status: 'paid', providerRef: `mock_${input.reference}` }
  },
}

const paystackProvider: PayoutProvider = {
  name: 'paystack',

  async listBanks() {
    const result = await paystackFetch<{ name: string; code: string; active: boolean }[]>(
      '/bank?country=nigeria&currency=NGN&perPage=200',
      { method: 'GET' },
    )
    return (result.data ?? [])
      .filter((bank) => bank.active)
      .map((bank) => ({ code: bank.code, name: bank.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  },

  async resolveAccount(accountNumber, bankCode) {
    try {
      const result = await paystackFetch<{ account_name: string }>(
        `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
        { method: 'GET' },
      )
      const name = result.data?.account_name?.trim()
      if (!name) throw new PayoutError('We could not find that account number at that bank.')
      return name
    } catch (err) {
      if (err instanceof PayoutError) throw err
      // Paystack answers an unknown account with a 422; either way the person
      // has to check the number or the bank.
      console.error('[payouts] account resolve failed', err)
      throw new PayoutError('We could not find that account number at that bank.')
    }
  },

  async createRecipient(account) {
    const result = await paystackFetch<{ recipient_code: string }>('/transferrecipient', {
      method: 'POST',
      body: {
        type: 'nuban',
        name: account.accountName,
        account_number: account.accountNumber,
        bank_code: account.bankCode,
        currency: 'NGN',
      },
    })
    if (!result.status || !result.data?.recipient_code) {
      throw new PayoutError('Paystack would not accept that bank account for payouts.')
    }
    return result.data.recipient_code
  },

  async transfer(input) {
    if (!input.recipientCode) {
      return {
        status: 'failed',
        providerRef: null,
        failureReason: 'The bank account is incomplete',
      }
    }
    try {
      const result = await paystackFetch<{ status: string; transfer_code: string }>('/transfer', {
        method: 'POST',
        body: {
          source: 'balance',
          amount: input.amount,
          recipient: input.recipientCode,
          reference: input.reference,
          reason: input.reason,
        },
      })
      const status = result.data?.status
      const ref = result.data?.transfer_code ?? null
      if (!result.status) {
        return { status: 'failed', providerRef: ref, failureReason: result.message ?? 'Rejected' }
      }
      if (status === 'success') return { status: 'paid', providerRef: ref }
      if (status === 'otp') {
        // Paystack is holding the transfer for an OTP approval. Automatic
        // payouts need "Confirm transfers with OTP" turned off in Paystack.
        return {
          status: 'failed',
          providerRef: ref,
          failureReason: 'Transfers need OTP approval in Paystack; turn it off for payouts',
        }
      }
      if (status === 'failed' || status === 'reversed') {
        return { status: 'failed', providerRef: ref, failureReason: `Transfer ${status}` }
      }
      // pending / received / queued: the webhook finishes it.
      return { status: 'processing', providerRef: ref }
    } catch (err) {
      // A 4xx from Paystack is a definite no (insufficient balance, bad
      // recipient); a timeout is not - the transfer may still go through, so
      // it stays processing for the webhook or a reconciliation to settle.
      const message = (err as Error).message ?? ''
      if (/failed \(4\d\d\)/.test(message)) {
        console.error('[payouts] transfer rejected', err)
        return {
          status: 'failed',
          providerRef: null,
          failureReason: 'The payout provider rejected it',
        }
      }
      console.error('[payouts] transfer did not get an answer', err)
      return { status: 'processing', providerRef: null }
    }
  },
}

const PROVIDERS: Record<string, PayoutProvider> = {
  mock: mockProvider,
  paystack: paystackProvider,
}

function provider(): PayoutProvider {
  const configured = process.env.PAYMENT_PROVIDER ?? 'mock'
  const found = PROVIDERS[configured]
  if (!found) throw new Error(`PAYMENT_PROVIDER "${configured}" has no payout adapter`)
  return found
}

// ---------------------------------------------------------------------------
// Banks and saved accounts
// ---------------------------------------------------------------------------

let bankCache: { at: number; banks: Bank[] } | null = null

/** The bank list changes rarely; asking Paystack on every page view is waste. */
export async function listBanks(): Promise<Bank[]> {
  if (bankCache && Date.now() - bankCache.at < 12 * 60 * 60 * 1000) return bankCache.banks
  const banks = await provider().listBanks()
  bankCache = { at: Date.now(), banks }
  return banks
}

export function isValidAccountNumber(value: string): boolean {
  return /^\d{10}$/.test(value)
}

/** Look up who owns an account, before the person is asked to save it. */
export async function resolveBankAccount(
  accountNumber: string,
  bankCode: string,
): Promise<{ accountName: string; bankName: string }> {
  if (!isValidAccountNumber(accountNumber)) {
    throw new PayoutError('An account number is 10 digits.')
  }
  const bank = (await listBanks()).find((b) => b.code === bankCode)
  if (!bank) throw new PayoutError('Choose your bank from the list.')
  const accountName = await provider().resolveAccount(accountNumber, bankCode)
  return { accountName, bankName: bank.name }
}

export async function listBankAccounts(owner: PayoutOwner): Promise<BankAccount[]> {
  const sql = await getSql()
  return sql.query<BankAccount>(
    `SELECT * FROM bank_accounts WHERE owner_type = $1 AND owner_id = $2 ORDER BY created_at ASC`,
    [owner.type, owner.id],
  )
}

/**
 * Save an account. The name is looked up again here rather than taken from
 * the form: what the person confirmed on screen came from the provider, and
 * what is stored has to come from it too.
 */
export async function addBankAccount(
  owner: PayoutOwner,
  input: { accountNumber: string; bankCode: string },
  actorUserId: string,
): Promise<BankAccount> {
  const { accountName, bankName } = await resolveBankAccount(input.accountNumber, input.bankCode)
  const sql = await getSql()

  const existing = await listBankAccounts(owner)
  if (
    existing.some((a) => a.bank_code === input.bankCode && a.account_number === input.accountNumber)
  ) {
    throw new PayoutError('That account is already saved.')
  }
  if (existing.length >= MAX_SAVED_ACCOUNTS) {
    throw new PayoutError(
      `You can save up to ${MAX_SAVED_ACCOUNTS} bank accounts. Remove one first.`,
    )
  }

  const recipientCode = await provider().createRecipient({
    accountName,
    accountNumber: input.accountNumber,
    bankCode: input.bankCode,
  })

  const account = await sql.one<BankAccount>(
    `INSERT INTO bank_accounts
       (owner_type, owner_id, bank_code, bank_name, account_number, account_name,
        recipient_code, created_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      owner.type,
      owner.id,
      input.bankCode,
      bankName,
      input.accountNumber,
      accountName,
      recipientCode,
      actorUserId,
    ],
  )
  if (!account) throw new Error('Failed to save bank account')
  return account
}

export async function removeBankAccount(owner: PayoutOwner, accountId: string): Promise<void> {
  const sql = await getSql()
  const removed = await sql.one<{ id: string }>(
    `DELETE FROM bank_accounts WHERE id = $1 AND owner_type = $2 AND owner_id = $3 RETURNING id`,
    [accountId, owner.type, owner.id],
  )
  if (!removed) throw new PayoutError('That bank account was not found.')
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

export async function listPayouts(owner: PayoutOwner, limit = 10): Promise<Payout[]> {
  const sql = await getSql()
  return sql.query<Payout>(
    `SELECT * FROM payouts WHERE owner_type = $1 AND owner_id = $2 ORDER BY created_at DESC LIMIT $3`,
    [owner.type, owner.id, limit],
  )
}

/**
 * Withdraw to a saved account.
 *
 * Step one is local and atomic: the wallet is debited and the payout row
 * written together, so there is never money in flight without a record of
 * where it went. Step two is the call to the provider, made outside the
 * transaction because a slow bank must not hold a database lock.
 */
export async function requestPayout(
  owner: PayoutOwner,
  input: { bankAccountId: string; amount: number },
  actorUserId: string,
): Promise<Payout> {
  if (!Number.isInteger(input.amount) || input.amount < MIN_PAYOUT) {
    throw new PayoutError(`The smallest withdrawal is ₦${(MIN_PAYOUT / 100).toLocaleString()}.`)
  }
  const payoutProvider = provider()
  // Paystack references: lowercase letters, digits, dashes and underscores.
  const reference = `po_${randomUUID().replace(/-/g, '')}`

  const { payout, recipientCode } = await withTx(async (tx) => {
    const account = await tx.one<BankAccount>(
      `SELECT * FROM bank_accounts WHERE id = $1 AND owner_type = $2 AND owner_id = $3`,
      [input.bankAccountId, owner.type, owner.id],
    )
    if (!account) throw new PayoutError('Choose one of your saved bank accounts.')

    await withdraw(
      owner.type,
      owner.id,
      input.amount,
      `Withdrawal to ${account.bank_name} ····${account.account_number.slice(-4)}`,
      tx,
      reference.toUpperCase(),
    )

    const row = await tx.one<Payout>(
      `INSERT INTO payouts
         (reference, owner_type, owner_id, bank_account_id, bank_name, account_number,
          account_name, amount, provider, requested_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        reference,
        owner.type,
        owner.id,
        account.id,
        account.bank_name,
        account.account_number,
        account.account_name,
        input.amount,
        payoutProvider.name,
        actorUserId,
      ],
    )
    if (!row) throw new Error('Failed to record payout')

    await publish(
      {
        type: EVENT.PayoutRequested,
        aggregateType: 'payout',
        aggregateId: row.id,
        actorUserId,
        payload: { amount: input.amount, ownerType: owner.type, ownerId: owner.id },
      },
      tx,
    )
    return { payout: row, recipientCode: account.recipient_code }
  })

  const result = await payoutProvider.transfer({
    amount: payout.amount,
    reference,
    recipientCode,
    reason: 'AfriMesh wallet withdrawal',
  })

  if (result.providerRef) {
    const sql = await getSql()
    await sql.query(`UPDATE payouts SET provider_ref = $2 WHERE id = $1`, [
      payout.id,
      result.providerRef,
    ])
  }
  if (result.status === 'paid') return (await completePayout(reference)).payout ?? payout
  if (result.status === 'failed') {
    return (
      (await failPayout(reference, result.failureReason ?? 'The transfer failed')).payout ?? payout
    )
  }
  return { ...payout, provider_ref: result.providerRef }
}

export type PayoutOutcome = 'paid' | 'failed' | 'already_settled' | 'unknown_reference'

async function settle(
  reference: string,
  event: { provider: string; id: string; type: string } | undefined,
  apply: (tx: Sql, payout: Payout) => Promise<Payout>,
): Promise<{ outcome: PayoutOutcome; payout?: Payout }> {
  return withTx(async (tx) => {
    if (event && !(await claimWebhookEvent(tx, event.provider, event.id, event.type))) {
      return { outcome: 'already_settled' as const }
    }
    // Locked, so a webhook and the request that started the payout cannot
    // both settle it.
    const payout = await tx.one<Payout>(`SELECT * FROM payouts WHERE reference = $1 FOR UPDATE`, [
      reference,
    ])
    if (!payout) return { outcome: 'unknown_reference' as const }
    if (payout.status !== 'processing') return { outcome: 'already_settled' as const, payout }
    const updated = await apply(tx, payout)
    return {
      outcome: updated.status === 'paid' ? ('paid' as const) : ('failed' as const),
      payout: updated,
    }
  })
}

/** The bank has the money. */
export async function completePayout(
  reference: string,
  event?: { provider: string; id: string; type: string },
) {
  return settle(reference, event, async (tx, payout) => {
    const updated = await tx.one<Payout>(
      `UPDATE payouts SET status = 'paid', completed_at = now() WHERE id = $1 RETURNING *`,
      [payout.id],
    )
    await publish(
      {
        type: EVENT.PayoutPaid,
        aggregateType: 'payout',
        aggregateId: payout.id,
        payload: { amount: payout.amount },
      },
      tx,
    )
    await notifyOwner(
      tx,
      payout,
      'Withdrawal sent',
      `₦${(payout.amount / 100).toLocaleString()} has been sent to ${payout.bank_name} ····${payout.account_number.slice(-4)}.`,
    )
    return updated!
  })
}

/** The transfer failed or was reversed: the money goes back to the wallet. */
export async function failPayout(
  reference: string,
  reason: string,
  event?: { provider: string; id: string; type: string },
) {
  return settle(reference, event, async (tx, payout) => {
    await reverseWithdrawal(
      tx,
      payout.owner_type,
      payout.owner_id,
      payout.amount,
      `Withdrawal returned: ${reason}`,
      `${payout.reference}_rev`.toUpperCase(),
    )
    const updated = await tx.one<Payout>(
      `UPDATE payouts SET status = 'failed', failure_reason = $2, completed_at = now()
        WHERE id = $1 RETURNING *`,
      [payout.id, reason],
    )
    await publish(
      {
        type: EVENT.PayoutFailed,
        aggregateType: 'payout',
        aggregateId: payout.id,
        payload: { reason },
      },
      tx,
    )
    await notifyOwner(
      tx,
      payout,
      'Withdrawal returned',
      `Your ₦${(payout.amount / 100).toLocaleString()} withdrawal could not be sent and is back in your wallet.`,
    )
    return updated!
  })
}

/** Is this reference one of ours? Lets the webhook route transfer events. */
export async function isPayoutReference(reference: string): Promise<boolean> {
  const sql = await getSql()
  return Boolean(await sql.one(`SELECT 1 FROM payouts WHERE reference = $1`, [reference]))
}

async function notifyOwner(tx: Sql, payout: Payout, title: string, body: string) {
  const userId =
    payout.owner_type === 'user'
      ? payout.owner_id
      : (
          await tx.one<{ owner_user_id: string | null }>(
            `SELECT owner_user_id FROM organisations WHERE id = $1`,
            [payout.owner_id],
          )
        )?.owner_user_id
  if (!userId) return
  await queueNotification(
    { userId, title, body, category: 'account', referenceType: 'payout', referenceId: payout.id },
    tx,
  )
}
