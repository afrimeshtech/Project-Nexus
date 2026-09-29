'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { currentUser, organisationFor } from '@/lib/auth'
import { toMinor } from '@/lib/money'
import { InsufficientFundsError } from '@/modules/wallet/service'
import {
  addBankAccount,
  removeBankAccount,
  requestPayout,
  resolveBankAccount,
  PayoutError,
  type PayoutOwner,
} from '@/modules/payouts/service'

import { parseForm, z, uuid, nairaAmount } from '@/lib/forms'

export interface PayoutActionState {
  error?: string
  notice?: string
  /** A looked-up account, shown for the person to confirm before saving. */
  preview?: { bankCode: string; bankName: string; accountNumber: string; accountName: string }
}

const scope = z.enum(['user', 'organisation']).catch('user')

const accountSchema = z.object({
  scope,
  bankCode: z.string().trim().min(1, { message: 'Choose your bank.' }).max(12),
  accountNumber: z
    .string()
    .trim()
    .regex(/^\d{10}$/, { message: 'An account number is 10 digits.' }),
  // Present on the second submit, once the looked-up name has been shown.
  confirm: z.literal('yes').optional(),
})

const removeSchema = z.object({ scope, accountId: uuid('bank account') })

const withdrawSchema = z.object({
  scope,
  bankAccountId: uuid('bank account'),
  amount: nairaAmount('Withdrawal amount', 100),
})

/**
 * Whose money this is. A business wallet is the owner's alone - a sales rep
 * never reaches it - and the organisation always comes from the session,
 * never from the form.
 */
async function ownerFor(target: 'user' | 'organisation'): Promise<PayoutOwner | { error: string }> {
  const user = await currentUser()
  if (!user) redirect('/login?next=/wallet')
  if (target === 'user') return { type: 'user', id: user.id }
  const org = await organisationFor('funds')
  if (!org) return { error: 'Only the business owner can manage business payouts' }
  return { type: 'organisation', id: org.id }
}

function paths() {
  revalidatePath('/wallet')
  revalidatePath('/partner/wallet')
}

/** Look an account up, then - on the confirming submit - save it. */
export async function bankAccountAction(
  _prev: PayoutActionState,
  formData: FormData,
): Promise<PayoutActionState> {
  const parsed = parseForm(accountSchema, formData)
  if (!parsed.ok) return { error: parsed.error }
  const owner = await ownerFor(parsed.data.scope)
  if ('error' in owner) return { error: owner.error }
  const user = await currentUser()

  try {
    if (!parsed.data.confirm) {
      const { accountName, bankName } = await resolveBankAccount(
        parsed.data.accountNumber,
        parsed.data.bankCode,
      )
      return {
        preview: {
          bankCode: parsed.data.bankCode,
          bankName,
          accountNumber: parsed.data.accountNumber,
          accountName,
        },
      }
    }
    const account = await addBankAccount(
      owner,
      { accountNumber: parsed.data.accountNumber, bankCode: parsed.data.bankCode },
      user!.id,
    )
    paths()
    return { notice: `${account.account_name} at ${account.bank_name} is saved for withdrawals.` }
  } catch (err) {
    if (err instanceof PayoutError) return { error: err.message }
    console.error('[payouts] saving bank account failed', err)
    return { error: 'We could not check that bank account. Please try again.' }
  }
}

export async function removeBankAccountAction(
  _prev: PayoutActionState,
  formData: FormData,
): Promise<PayoutActionState> {
  const parsed = parseForm(removeSchema, formData)
  if (!parsed.ok) return { error: parsed.error }
  const owner = await ownerFor(parsed.data.scope)
  if ('error' in owner) return { error: owner.error }

  try {
    await removeBankAccount(owner, parsed.data.accountId)
  } catch (err) {
    if (err instanceof PayoutError) return { error: err.message }
    console.error('[payouts] removing bank account failed', err)
    return { error: 'We could not remove that account.' }
  }
  paths()
  return { notice: 'Bank account removed.' }
}

export async function withdrawAction(
  _prev: PayoutActionState,
  formData: FormData,
): Promise<PayoutActionState> {
  const parsed = parseForm(withdrawSchema, formData)
  if (!parsed.ok) return { error: parsed.error }
  const owner = await ownerFor(parsed.data.scope)
  if ('error' in owner) return { error: owner.error }
  const user = await currentUser()
  const naira = parsed.data.amount

  let payout
  try {
    payout = await requestPayout(
      owner,
      { bankAccountId: parsed.data.bankAccountId, amount: toMinor(naira) },
      user!.id,
    )
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      return { error: 'Your available balance is not enough for that withdrawal.' }
    }
    if (err instanceof PayoutError) return { error: err.message }
    console.error('[payouts] withdrawal failed', err)
    return { error: 'We could not start that withdrawal.' }
  }

  paths()
  const to = `${payout.bank_name} ····${payout.account_number.slice(-4)}`
  if (payout.status === 'paid')
    return { notice: `₦${naira.toLocaleString()} has been sent to ${to}.` }
  if (payout.status === 'failed') {
    return {
      error: `The transfer to ${to} did not go through, so the ₦${naira.toLocaleString()} is back in your wallet.`,
    }
  }
  return {
    notice: `₦${naira.toLocaleString()} is on its way to ${to}. You will be notified when the bank confirms it.`,
  }
}
