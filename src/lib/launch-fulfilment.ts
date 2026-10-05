/**
 * How orders reach the buyer at launch.
 *
 * The MVP is buy-and-collect: a shopper fills a basket, pays, and collects
 * from the shop. Delivery - the fee, the rider job board, dispatch and proof
 * of delivery - is all still built and still compiles; what is switched off is
 * the way in. Checkout only posts `pickup`, and the form schema refuses
 * anything else, so a delivery order cannot be placed rather than merely not
 * being offered.
 *
 * FUTURE-DELIVERY: to open delivery, add 'delivery' here.
 * `grep -rn FUTURE-DELIVERY src` lists every switch that moves with it.
 */
export const LAUNCH_FULFILMENT = [
  'pickup',
  // 'delivery',
] as const

export type LaunchFulfilment = (typeof LAUNCH_FULFILMENT)[number]

export function deliveryLaunched(): boolean {
  return (LAUNCH_FULFILMENT as readonly string[]).includes('delivery')
}
