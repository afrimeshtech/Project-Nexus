/**
 * Who inside a business may do what.
 *
 * A retailer is rarely one person. The owner holds the money; the people
 * behind the counter - sales reps - keep the shelves right and get orders out
 * of the door. They need the stock and the order queue to do that job, and
 * nothing that would let them move, see or sign away the business's funds.
 *
 * Stated once, here, and consumed by the dashboard navigation, every partner
 * page and every server action. Hiding a nav entry is presentation; the
 * checks in pages and actions are the actual boundary.
 */

export type OrgMemberRole = 'owner' | 'sales_rep'

export type OrgCapability =
  /** Stock levels, pricing, batches, adding products to the listing. */
  | 'inventory'
  /** Accept, prepare, cancel and fulfil orders placed by buyers. */
  | 'orders'
  /** Hand an order to a named delivery partner. */
  | 'dispatch'
  /** Order-scoped conversations with buyers. */
  | 'messages'
  /** Wallet balance, top-up, withdrawal, escrow; also revenue figures. */
  | 'funds'
  /** Reward points - redeemable for naira, so they are funds too. */
  | 'rewards'
  /** Sales analytics, demand data, the inventory movement log. */
  | 'analytics'
  /** Business profile, location, delivery radius, logo. */
  | 'settings'
  /** API keys for machine integrations. */
  | 'api'
  /** Buying stock upstream on the business's account. */
  | 'sourcing'
  /** Adding and removing sales reps. */
  | 'team'

const SALES_REP: ReadonlySet<OrgCapability> = new Set([
  'inventory',
  'orders',
  'dispatch',
  'messages',
])

export function can(role: OrgMemberRole, capability: OrgCapability): boolean {
  if (role === 'owner') return true
  return SALES_REP.has(capability)
}

/**
 * Resolve a membership row to a role. Anything that is not explicitly the
 * owner is a sales rep - an unrecognised or legacy `role_in_org` value must
 * fall to the least-privileged role, never to the most.
 */
export function memberRoleFrom(opts: {
  isOrgOwner: boolean
  roleInOrg: string | null
}): OrgMemberRole {
  if (opts.isOrgOwner || opts.roleInOrg === 'owner') return 'owner'
  return 'sales_rep'
}

export const MEMBER_ROLE_LABEL: Record<OrgMemberRole, string> = {
  owner: 'Owner',
  sales_rep: 'Sales rep',
}
