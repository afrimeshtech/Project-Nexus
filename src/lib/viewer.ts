import 'server-only'
import { currentOrganisation } from '@/lib/auth'
import { can } from '@/lib/org-access'

/**
 * Buying context for a *business* sourcing upstream, used by the partner
 * dashboards' "Source stock" flow.
 *
 * The same discovery surface serves everyone; only the tier changes, and the
 * tier decides both who you may buy from and whether you see retail or
 * wholesale prices. A shop owner browsing the public storefront is a consumer
 * at tier 5 paying retail. The same person inside their dashboard is an outlet
 * at tier 4 paying wholesale. Resolving that here keeps the distinction in one
 * place instead of being re-derived on every page.
 */
export async function sourcingContext(): Promise<{
  tier: number
  orgId: string
  orgName: string
  orgType: string
  lat: number
  lng: number
  address: string | null
} | null> {
  const org = await currentOrganisation()
  // Logistics partners do not buy stock, so they have no sourcing tier. A
  // sales rep does not either: buying upstream spends the business's money,
  // which stays with the owner. A rep shopping on the storefront is simply a
  // consumer paying for themselves.
  if (!org || org.type === 'logistics') return null
  if (!can(org.member_role, 'sourcing')) return null
  return {
    tier: org.tier_level,
    orgId: org.id,
    orgName: org.name,
    orgType: org.type,
    lat: org.lat,
    lng: org.lng,
    address: org.address,
  }
}
