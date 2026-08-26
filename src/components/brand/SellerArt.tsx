/**
 * Seller artwork — brand marks for the businesses on the platform.
 *
 * These replace the initials badge on a shop. The offer list exists so a buyer
 * can tell four nearby shops apart at a glance, and "GS / JS / AP / YM" is the
 * one thing that cannot be told apart at a glance.
 *
 * Every seller here is a neighbourhood business with no logo of its own, so
 * these are marks *for* them rather than reproductions of anything: a shopfront
 * for a corner store, a shed for a warehouse, a pallet for a wholesaler. Two
 * things carry the identity — the form, taken from what the business is, and an
 * accent colour taken from its name — so Grace Stores and Yaba Mini Mart never
 * look like the same shop. A logo the owner actually uploads always wins over
 * these (see `SellerThumb`).
 *
 * Drawn on an 80×80 grid, and coloured to read on the dark green tile: creams,
 * sand and warm accents, never a mid-green that would sink into the ground.
 */

const SHADOW = 'rgba(0,0,0,0.22)'
const WALL = '#f2ece0'
const WALL_SHADE = '#d6cdba'
const DARK = '#1f4034'
const GLASS = '#9fc7d8'

/**
 * Accents that all clear the dark green ground. Which one a business gets is
 * decided by its name, so it is stable across reseeds and across machines.
 */
const ACCENTS = ['#e8763a', '#e8c07a', '#7fc9a0', '#d9705a', '#f0c14b'] as const

/** FNV-1a, the same hash the generated business logos use. */
function hash(value: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

interface ArtProps {
  accent: string
}

/* -- Named forms ---------------------------------------------------------- */

/** A striped awning, shared by the shopfront forms. */
function Awning({ accent, x, w, y }: { accent: string; x: number; w: number; y: number }) {
  const stripe = Math.round(w / 5)
  return (
    <>
      <path d={`M${x} ${y}h${w}v7H${x}Z`} fill={accent} />
      {[0, 2, 4].map((i) => (
        <path
          key={i}
          d={`M${x + i * stripe} ${y}h${stripe}v7h-${stripe}Z`}
          fill={WALL}
          opacity="0.55"
        />
      ))}
      <path d={`M${x - 2} ${y + 7}h${w + 4}v2H${x - 2}Z`} fill={DARK} opacity="0.35" />
    </>
  )
}

function Storefront({ accent }: ArtProps) {
  return (
    <>
      <path d="M16 30h48v36H16Z" fill={WALL} />
      <path d="M16 30h48v4H16Z" fill={WALL_SHADE} />
      <Awning accent={accent} x={16} w={48} y={22} />
      {/* window and door */}
      <rect x="22" y="42" width="18" height="14" rx="1.5" fill={GLASS} />
      <path d="M22 49h18" stroke={WALL} strokeWidth="1.5" />
      <path d="M46 42h14v24H46Z" fill={DARK} />
      <circle cx="49" cy="55" r="1.6" fill={accent} />
      {/* sign board */}
      <rect x="26" y="34" width="28" height="5" rx="2" fill={accent} />
      <ellipse cx="40" cy="69" rx="28" ry="3" fill={SHADOW} />
    </>
  )
}

function Supermarket({ accent }: ArtProps) {
  return (
    <>
      <path d="M12 32h56v34H12Z" fill={WALL} />
      <path d="M12 32h56v4H12Z" fill={WALL_SHADE} />
      <Awning accent={accent} x={12} w={56} y={24} />
      {/* long window band */}
      <rect x="17" y="40" width="46" height="12" rx="1.5" fill={GLASS} />
      <path d="M32 40v12M47 40v12" stroke={WALL} strokeWidth="1.5" />
      {/* trolley out front */}
      <path d="M26 56h20l-3 8H29Z" fill={accent} />
      <path
        d="M23 55h4l2 3"
        stroke={WALL_SHADE}
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="31" cy="66" r="2.2" fill={DARK} />
      <circle cx="42" cy="66" r="2.2" fill={DARK} />
      <ellipse cx="40" cy="70" rx="30" ry="3" fill={SHADOW} />
    </>
  )
}

function Provisions({ accent }: ArtProps) {
  return (
    <>
      {/* shelving unit */}
      <path d="M16 22h48v46H16Z" fill={WALL_SHADE} />
      <path d="M19 25h42v40H19Z" fill={DARK} opacity="0.25" />
      <path d="M19 38h42v3H19Zm0 13h42v3H19Z" fill={WALL} />
      {/* tins on the top shelf */}
      <rect x="23" y="28" width="8" height="10" rx="1" fill={accent} />
      <rect x="34" y="28" width="8" height="10" rx="1" fill={WALL} />
      <rect x="45" y="28" width="8" height="10" rx="1" fill={accent} opacity="0.7" />
      {/* a sack and a bottle on the middle shelf */}
      <path d="M24 41c0-1 2-2 6-2s6 1 6 2v10H24Z" fill={WALL} />
      <rect x="27" y="44" width="6" height="4" rx="1" fill={accent} />
      <path d="M44 41h5v3l2 3v7h-9v-7l2-3Z" fill={GLASS} />
      {/* crates on the bottom */}
      <rect x="22" y="54" width="16" height="11" rx="1.5" fill={accent} opacity="0.85" />
      <rect x="42" y="54" width="16" height="11" rx="1.5" fill={WALL} opacity="0.8" />
      <ellipse cx="40" cy="70" rx="27" ry="3" fill={SHADOW} />
    </>
  )
}

function MiniMart({ accent }: ArtProps) {
  return (
    <>
      {/* a compact kiosk: narrower than the storefront, and taller */}
      <path d="M24 28h32v38H24Z" fill={WALL} />
      <path d="M24 28h32v4H24Z" fill={WALL_SHADE} />
      <Awning accent={accent} x={22} w={36} y={20} />
      {/* serving hatch */}
      <rect x="29" y="38" width="22" height="15" rx="1.5" fill={GLASS} />
      <path d="M29 45.5h22" stroke={WALL} strokeWidth="1.5" />
      {/* counter with a bottle and a pack on it */}
      <path d="M26 54h28v4H26Z" fill={accent} />
      <rect x="31" y="46" width="4" height="7" rx="1" fill={accent} />
      <rect x="43" y="47" width="6" height="6" rx="1" fill={WALL} />
      <path d="M24 58h32v8H24Z" fill={DARK} opacity="0.3" />
      <ellipse cx="40" cy="69" rx="24" ry="3" fill={SHADOW} />
    </>
  )
}

function Pharmacy({ accent }: ArtProps) {
  return (
    <>
      <path d="M18 30h44v36H18Z" fill={WALL} />
      <path d="M18 30h44v4H18Z" fill={WALL_SHADE} />
      <Awning accent={accent} x={18} w={44} y={22} />
      {/* the cross, the one mark a chemist is known by */}
      <path d="M35 38h10v7h7v10h-7v7H35v-7h-7V45h7Z" fill="#d9534f" />
      <path d="M35 38h10v7h-10Z" fill="#e8756f" opacity="0.6" />
      <ellipse cx="40" cy="69" rx="26" ry="3" fill={SHADOW} />
    </>
  )
}

function Warehouse({ accent }: ArtProps) {
  return (
    <>
      {/* wide shed with a curved roof */}
      <path d="M10 34c0-8 14-12 30-12s30 4 30 12v32H10Z" fill={WALL} />
      <path d="M10 34c0-8 14-12 30-12s30 4 30 12Z" fill={WALL_SHADE} />
      {/* roller door */}
      <path d="M28 44h24v22H28Z" fill={DARK} />
      <g stroke={WALL} strokeWidth="1.2" opacity="0.35">
        <path d="M28 49h24M28 54h24M28 59h24" />
      </g>
      {/* loading bay markings */}
      <path d="M14 60h10v6H14Z" fill={accent} />
      <path d="M56 60h10v6H56Z" fill={accent} />
      <ellipse cx="40" cy="69" rx="32" ry="3" fill={SHADOW} />
    </>
  )
}

function Hardware({ accent }: ArtProps) {
  return (
    <>
      {/* coursed brick/block stock - the yard's own goods, not a shopfront */}
      <path d="M14 36h52v34H14Z" fill={WALL} />
      <path d="M14 36h52v4H14Z" fill={WALL_SHADE} />
      <g stroke={WALL_SHADE} strokeWidth="1.4" opacity="0.6">
        <path d="M14 50h52M14 60h52" />
        <path d="M30 40v10M46 40v10M22 50v10M38 50v10M54 50v10" />
      </g>
      {/* sign board, the same convention every shopfront form uses */}
      <rect x="26" y="28" width="28" height="6" rx="2" fill={accent} />
      <ellipse cx="40" cy="70" rx="28" ry="3" fill={SHADOW} />
    </>
  )
}

function Wholesale({ accent }: ArtProps) {
  return (
    <>
      {/* a pallet of stacked crates — bulk, not retail */}
      <rect x="20" y="24" width="18" height="14" rx="1.5" fill={accent} />
      <rect x="42" y="24" width="18" height="14" rx="1.5" fill={WALL} />
      <rect x="20" y="40" width="18" height="14" rx="1.5" fill={WALL} />
      <rect x="42" y="40" width="18" height="14" rx="1.5" fill={accent} opacity="0.8" />
      {/* strapping */}
      <path d="M29 24v30M51 24v30" stroke={DARK} strokeWidth="1.6" opacity="0.35" />
      {/* pallet */}
      <path d="M16 56h48v4H16Z" fill={WALL_SHADE} />
      <path d="M19 60h6v5h-6Zm16 0h6v5h-6Zm16 0h6v5h-6Z" fill={WALL_SHADE} />
      <ellipse cx="40" cy="69" rx="30" ry="3" fill={SHADOW} />
    </>
  )
}

function FreshFoods({ accent }: ArtProps) {
  return (
    <>
      {/* produce crate */}
      <path d="M18 44h44l-3 22H21Z" fill={WALL} />
      <path d="M18 44h44v4H18Z" fill={WALL_SHADE} />
      <path d="M26 48v18M40 48v18M54 48v18" stroke={WALL_SHADE} strokeWidth="1.6" />
      {/* greens and fruit above the rim */}
      <path d="M24 44c-2-8 3-14 9-15-1 6-2 11-9 15Z" fill="#4f9d4a" />
      <path d="M34 30c6 2 9 8 7 14-5-4-7-9-7-14Z" fill="#5fb356" />
      <circle cx="50" cy="36" r="8" fill={accent} />
      <ellipse cx="47" cy="33" rx="2.6" ry="2" fill={WALL} opacity="0.6" />
      <ellipse cx="40" cy="69" rx="27" ry="3" fill={SHADOW} />
    </>
  )
}

function HomeGoods({ accent }: ArtProps) {
  return (
    <>
      {/* pot */}
      <path d="M18 40h30v18a6 6 0 0 1-6 6H24a6 6 0 0 1-6-6Z" fill={WALL} />
      <path d="M15 37h36v5H15Z" fill={WALL_SHADE} />
      <rect x="27" y="31" width="12" height="4" rx="2" fill={accent} />
      {/* kettle */}
      <path d="M52 44h14v12a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5Z" fill={accent} />
      <path d="M66 47l6-5v4l-5 4Z" fill={accent} />
      <path d="M55 44a4 4 0 0 1 8 0Z" fill={WALL} />
      <ellipse cx="40" cy="67" rx="28" ry="3" fill={SHADOW} />
    </>
  )
}

function Electronics({ accent }: ArtProps) {
  return (
    <>
      {/* screen */}
      <rect x="14" y="26" width="42" height="28" rx="3" fill={DARK} />
      <rect x="18" y="30" width="34" height="20" rx="1.5" fill={GLASS} />
      <path d="M18 44l9-8 7 6 6-5 12 10v3H18Z" fill={accent} opacity="0.75" />
      <path d="M30 54h10v5H30Z" fill={WALL_SHADE} />
      <path d="M24 59h22v3H24Z" fill={WALL} />
      {/* handset */}
      <rect x="58" y="34" width="12" height="26" rx="2.5" fill={WALL} />
      <rect x="60" y="38" width="8" height="16" rx="1" fill={accent} opacity="0.55" />
      <ellipse cx="40" cy="65" rx="30" ry="3" fill={SHADOW} />
    </>
  )
}

/* ------------------------------------------------------------------------ */

const FORMS = {
  storefront: Storefront,
  supermarket: Supermarket,
  provisions: Provisions,
  minimart: MiniMart,
  pharmacy: Pharmacy,
  warehouse: Warehouse,
  wholesale: Wholesale,
  hardware: Hardware,
  fresh: FreshFoods,
  home: HomeGoods,
  electronics: Electronics,
} as const

export type SellerForm = keyof typeof FORMS

/**
 * Which mark a business gets.
 *
 * Matched on the name first, because "Ikeja Pharmacy Plus" and "Yaba Mini Mart"
 * are both outlets and should not share a mark. The supply-chain tier is the
 * fallback for a name that says nothing, e.g. "Adeyemi & Sons". Order matters:
 * the most specific term wins.
 */
const KEYWORDS: [RegExp, SellerForm][] = [
  [/pharmac|chemist|drug/i, 'pharmacy'],
  [/warehouse|depot|cold store/i, 'warehouse'],
  [/wholesale|bulk|distribution|\btrade\b|traders|hub/i, 'wholesale'],
  [/material|hardware|building|construction|cement|timber|paint\b/i, 'hardware'],
  [/supermarket|superstore|hypermarket/i, 'supermarket'],
  [/mini ?mart|\bmart\b|kiosk/i, 'minimart'],
  [/provision|sundry/i, 'provisions'],
  [/fresh|foods?\b|farm|produce|grocer/i, 'fresh'],
  [/home|kitchen|essentials|furnish/i, 'home'],
  [/electronic|gadget|phones?\b|computer|tech\b/i, 'electronics'],
  [/stores?\b|shop|market|ventures|enterprise/i, 'storefront'],
]

const BY_TYPE: Record<string, SellerForm> = {
  manufacturer: 'warehouse',
  warehouse: 'warehouse',
  merchant: 'wholesale',
  outlet: 'storefront',
}

export function resolveSellerForm(name: string, type?: string | null): SellerForm | null {
  for (const [pattern, form] of KEYWORDS) {
    if (pattern.test(name)) return form
  }
  if (type && BY_TYPE[type]) return BY_TYPE[type]
  return null
}

export function SellerArt({
  name,
  type,
  size = 64,
}: {
  name: string
  type?: string | null
  size?: number
}) {
  const form = resolveSellerForm(name, type)
  if (!form) return null
  const Art = FORMS[form]
  const accent = ACCENTS[hash(name) % ACCENTS.length]
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" aria-hidden="true" focusable="false">
      <Art accent={accent} />
    </svg>
  )
}
