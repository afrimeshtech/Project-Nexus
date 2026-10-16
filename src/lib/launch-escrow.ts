/**
 * Whether escrow is named anywhere a shopper or retailer can see it.
 *
 * Only the wording is off. Payments still work exactly as built: an order's
 * money is held until the buyer confirms collection, then released to the
 * seller. What the MVP leaves out is presenting that as "escrow" - the held
 * figures, the "in escrow" captions, and the promise on the public pages.
 *
 * FUTURE-ESCROW: set to true to name escrow again.
 * `grep -rn FUTURE-ESCROW src` lists every switch that moves with it.
 */
export const ESCROW_SHOWN: boolean = false
