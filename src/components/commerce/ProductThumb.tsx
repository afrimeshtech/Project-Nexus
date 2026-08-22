import { ProductArt, resolveProductForm } from '@/components/brand/ProductArt'

/**
 * The image beside a product, on the brand's dark green tile.
 *
 * Resolution order, most specific first:
 *   1. a photo a seller actually uploaded for this product
 *   2. an illustration of the product form (milk tin, rice sack, cola bottle)
 *   3. the logo of the company that makes it
 *   4. initials — only when nothing else is known
 *
 * The illustration outranks the brand logo because a shopper scanning a list is
 * looking for the *thing*, not the manufacturer; the logo is better than
 * nothing but worse than a picture of the goods.
 */
export function ProductThumb({
  name,
  imageUrl,
  brandLogo,
  categorySlug,
  size = 'lg',
}: {
  name: string
  imageUrl?: string | null
  brandLogo?: string | null
  categorySlug?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  // xl is the catalogue well, where the art is the subject rather than a
  // marker beside a row of text.
  const box = { sm: 'size-12', md: 'size-16', lg: 'size-20', xl: 'size-28' }[size]
  const art = { sm: 38, md: 52, lg: 64, xl: 92 }[size]

  // A real photo fills the tile edge to edge — no green surround, because the
  // photo is the product and framing it would only shrink it.
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        className={`${box} shrink-0 rounded-brand object-cover`}
        loading="lazy"
      />
    )
  }

  const hasArt = resolveProductForm(name, categorySlug) !== null

  return (
    <span
      aria-hidden
      // `group-hover` only fires inside a card that opted into `group`; on a
      // page that did not, the tile simply stays still.
      className={`${box} brand-tile grid shrink-0 place-items-center overflow-hidden rounded-brand group-hover:brand-tile-hover`}
    >
      {hasArt ? (
        <ProductArt name={name} categorySlug={categorySlug} size={art} />
      ) : brandLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brandLogo} alt="" className="size-3/4 object-contain" loading="lazy" />
      ) : (
        <span className="text-sm font-semibold text-white/90">{initialsOf(name)}</span>
      )}
    </span>
  )
}

function initialsOf(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w && !/^\d/.test(w))
  if (!words.length) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}
