import Link from 'next/link'
import { CategoryArt } from '@/components/brand/CategoryArt'
import { Icon } from '@/components/Icon'

export interface CategoryCard {
  id: string
  name: string
  slug: string
  /** Real photography, once it exists. Falls back to the illustration. */
  image_url?: string | null
}

/**
 * Horizontally scrollable row of category cards.
 *
 * Scrolls rather than wraps, so the row occupies one predictable band whatever
 * the viewport — a wrapping grid pushes the products below the fold on a phone
 * as soon as a ninth category is added.
 *
 * Snap points mean a swipe lands on a card rather than halfway between two.
 * The row is also keyboard-reachable: each card is a link, so tabbing through
 * scrolls it naturally without needing a scrollable div in the tab order.
 */
export function CategoryRow({
  categories,
  moreHref = '/search',
  limit = 5,
}: {
  categories: CategoryCard[]
  moreHref?: string
  limit?: number
}) {
  const shown = categories.slice(0, limit)

  return (
    <div
      className="scroll-x -mx-4 flex snap-x snap-mandatory gap-3.5 px-4 pb-2"
      role="list"
      aria-label="Product categories"
    >
      {shown.map((category, i) => (
        <Link
          key={category.id}
          href={`/search?category=${category.id}`}
          role="listitem"
          className="category-card press pop-in group relative snap-start overflow-hidden hover:category-card-hover active:press-active"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <span className="category-art group-hover:category-art-hover">
            {category.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={category.image_url}
                alt=""
                className="size-[56px] rounded-brand object-cover"
              />
            ) : (
              <CategoryArt slug={category.slug} size={56} />
            )}
          </span>
          <span className="mt-2 text-center text-xs font-medium leading-tight text-white">
            {category.name}
          </span>
        </Link>
      ))}

      {/* "More" stays a minimalist mark — it is a control, not a product. */}
      <Link
        href={moreHref}
        role="listitem"
        className="category-card press pop-in group relative snap-start overflow-hidden hover:category-card-hover active:press-active"
        style={{ animationDelay: `${shown.length * 80}ms` }}
      >
        <span className="category-art grid size-[56px] place-items-center text-white/70 transition-colors group-hover:category-art-hover group-hover:text-accent-400">
          <Icon name="more" size={26} />
        </span>
        <span className="mt-2 text-center text-xs font-medium leading-tight text-white">More</span>
      </Link>
    </div>
  )
}
