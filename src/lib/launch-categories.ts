/**
 * The categories the MVP launches with.
 *
 * AfriMesh starts as a grocery network: neighbourhood provisions shops and
 * the drinks they stock. The catalogue already holds more than that, and the
 * data stays - only the category *lists* (the home page row, the search
 * filters, the seller's Add products picker) are limited to this set.
 * Products in other categories still exist, still sell and still turn up in
 * search; they just are not advertised as a category yet.
 *
 * To open a category, uncomment its slug. Nothing else needs to change.
 */
export const LAUNCH_CATEGORY_SLUGS: readonly string[] = [
  'groceries',
  'beverages',
  // FUTURE-CATEGORIES: silenced for the grocery MVP.
  // 'building-materials',
  // 'pharmacy',
  // 'electronics',
  // 'home-kitchen',
  // 'personal-care',
  // 'agro-inputs',
]

export function isLaunchCategory(slug: string | null | undefined): boolean {
  return !!slug && LAUNCH_CATEGORY_SLUGS.includes(slug)
}
