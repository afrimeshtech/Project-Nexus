/**
 * Whether completed orders earn the buyer loyalty cashback.
 *
 * The MVP leaves cashback out: completing an order pays nothing back into the
 * buyer's wallet, and no screen or notification promises it. `cashbackFor`,
 * `payCashback` and the ledger entry type are all still built; what is switched
 * off is the payout and every mention of it.
 *
 * FUTURE-CASHBACK: set to true to pay and show cashback again.
 * `grep -rn FUTURE-CASHBACK src` lists every switch that moves with it.
 */
export const CASHBACK_LAUNCHED: boolean = false
