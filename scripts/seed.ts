/**
 * Seeds a working pilot market.
 *
 * This deliberately goes through the real service layer - registerUser,
 * registerOrganisation, upsertStock, placeOrder, payOrder, advanceOrder,
 * rateOrder - rather than inserting rows directly. That means running it is
 * also an end-to-end exercise of the platform: reservations are taken, the
 * double-entry ledger is written, events are logged and notifications are
 * queued exactly as they would be in production. If the seed completes, the
 * commerce path works.
 *
 * Market: Lagos, matching the BRS short-term objective of launching in one
 * metropolitan area.
 */
import { assertDestructiveAllowed, DestructiveGuardError } from '../src/lib/destructive-guard.ts'
import { getSql } from '@/db/client'
import { registerUser } from '@/modules/identity/service'
import { createProduct } from '@/modules/catalog/service'
import { registerOrganisation, verifyOrganisation } from '@/modules/organisations/service'
import { upsertStock, addBatch } from '@/modules/inventory/service'
import { placeOrder, payOrder, advanceOrder, rateOrder } from '@/modules/orders/service'
import { openJobs, acceptJob, markPickedUp, completeDelivery } from '@/modules/logistics/service'
import { sendMessage } from '@/modules/messaging/service'
import { deposit, verifyIntegrity } from '@/modules/wallet/service'
import { searchProducts } from '@/modules/search/service'
import { recordProductView } from '@/modules/search/service'
import { DEFAULT_WEIGHTS, setWeight, type RankingScope } from '@/modules/recommendation/service'
import { setSetting } from '@/modules/platform/service'
import { storeGeneratedSvg } from '@/modules/storage/service'
import { businessLogoSvg } from '@/lib/placeholder'
import { TIER } from '@/lib/tiers'

const N = (naira: number) => Math.round(naira * 100) // to kobo

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { name: 'Groceries', slug: 'groceries', icon: '🛒' },
  { name: 'Beverages', slug: 'beverages', icon: '🥤' },
  { name: 'Building Materials', slug: 'building-materials', icon: '🧱' },
  { name: 'Pharmacy', slug: 'pharmacy', icon: '💊' },
  { name: 'Electronics', slug: 'electronics', icon: '📱' },
  { name: 'Home & Kitchen', slug: 'home-kitchen', icon: '🍳' },
  { name: 'Personal Care', slug: 'personal-care', icon: '🧴' },
  { name: 'Agro Inputs', slug: 'agro-inputs', icon: '🌾' },
]

const BRANDS = [
  'Dangote',
  'BUA',
  'Lafarge',
  'Peak',
  'Nestlé',
  'Indomie',
  'Golden Penny',
  'Cadbury',
  'Emzor',
  'Fidson',
  'Coca-Cola',
  'Nivea',
  'Ariel',
  'Hisense',
  'Power Oil',
  'Mamador',
  'Honeywell',
  'Kings',
  'Milo',
  'Bournvita',
]

interface SeedProduct {
  name: string
  brand: string
  category: string
  pack: string
  uom: string
  gtin: string
  /** Warehouse price in naira; every other tier is derived from it. */
  base: number
  batch?: boolean
}

const PRODUCTS: SeedProduct[] = [
  // Groceries
  {
    name: 'Golden Penny Semovita 1kg',
    brand: 'Golden Penny',
    category: 'groceries',
    pack: '1 kg',
    uom: 'bag',
    gtin: '6156000112233',
    base: 1450,
  },
  {
    name: 'Honeywell Wheat Meal 2kg',
    brand: 'Honeywell',
    category: 'groceries',
    pack: '2 kg',
    uom: 'bag',
    gtin: '6156000112240',
    base: 3100,
  },
  {
    name: 'Indomie Chicken Noodles (Carton of 40)',
    brand: 'Indomie',
    category: 'groceries',
    pack: '40 packs',
    uom: 'carton',
    gtin: '6156000112257',
    base: 8900,
  },
  {
    name: 'Indomie Onion Noodles 70g',
    brand: 'Indomie',
    category: 'groceries',
    pack: '70 g',
    uom: 'pack',
    gtin: '6156000112264',
    base: 220,
  },
  {
    name: 'Peak Milk Powder 400g',
    brand: 'Peak',
    category: 'groceries',
    pack: '400 g',
    uom: 'tin',
    gtin: '6156000112271',
    base: 5400,
  },
  {
    name: 'Peak Evaporated Milk 170g',
    brand: 'Peak',
    category: 'groceries',
    pack: '170 g',
    uom: 'tin',
    gtin: '6156000112288',
    base: 780,
  },
  {
    name: 'Milo Refill 500g',
    brand: 'Milo',
    category: 'groceries',
    pack: '500 g',
    uom: 'pack',
    gtin: '6156000112295',
    base: 4200,
  },
  {
    name: 'Bournvita 500g',
    brand: 'Bournvita',
    category: 'groceries',
    pack: '500 g',
    uom: 'tin',
    gtin: '6156000112301',
    base: 4050,
  },
  {
    name: 'Power Oil Vegetable Oil 3L',
    brand: 'Power Oil',
    category: 'groceries',
    pack: '3 L',
    uom: 'bottle',
    gtin: '6156000112318',
    base: 9200,
  },
  {
    name: 'Mamador Cooking Oil 1L',
    brand: 'Mamador',
    category: 'groceries',
    pack: '1 L',
    uom: 'bottle',
    gtin: '6156000112325',
    base: 3300,
  },
  {
    name: 'Kings Rice 5kg',
    brand: 'Kings',
    category: 'groceries',
    pack: '5 kg',
    uom: 'bag',
    gtin: '6156000112332',
    base: 8600,
  },
  {
    name: 'Dangote Sugar 1kg',
    brand: 'Dangote',
    category: 'groceries',
    pack: '1 kg',
    uom: 'pack',
    gtin: '6156000112349',
    base: 1700,
  },
  {
    name: 'Dangote Salt 500g',
    brand: 'Dangote',
    category: 'groceries',
    pack: '500 g',
    uom: 'pack',
    gtin: '6156000112356',
    base: 420,
  },
  {
    name: 'Golden Penny Spaghetti 500g',
    brand: 'Golden Penny',
    category: 'groceries',
    pack: '500 g',
    uom: 'pack',
    gtin: '6156000112363',
    base: 780,
  },

  // Beverages
  {
    name: 'Coca-Cola 50cl (Pack of 12)',
    brand: 'Coca-Cola',
    category: 'beverages',
    pack: '12 x 50 cl',
    uom: 'pack',
    gtin: '6156000212233',
    base: 3400,
  },
  {
    name: 'Coca-Cola 35cl Bottle',
    brand: 'Coca-Cola',
    category: 'beverages',
    pack: '35 cl',
    uom: 'bottle',
    gtin: '6156000212240',
    base: 250,
  },
  {
    name: 'Eva Table Water 75cl (Pack of 12)',
    brand: 'Coca-Cola',
    category: 'beverages',
    pack: '12 x 75 cl',
    uom: 'pack',
    gtin: '6156000212257',
    base: 2100,
  },
  {
    name: 'Nestlé Pure Life 1.5L',
    brand: 'Nestlé',
    category: 'beverages',
    pack: '1.5 L',
    uom: 'bottle',
    gtin: '6156000212264',
    base: 480,
  },

  // Building materials
  {
    name: 'Dangote Cement 50kg',
    brand: 'Dangote',
    category: 'building-materials',
    pack: '50 kg',
    uom: 'bag',
    gtin: '6156000312233',
    base: 8300,
  },
  {
    name: 'BUA Cement 50kg',
    brand: 'BUA',
    category: 'building-materials',
    pack: '50 kg',
    uom: 'bag',
    gtin: '6156000312240',
    base: 8150,
  },
  {
    name: 'Lafarge Elephant Cement 50kg',
    brand: 'Lafarge',
    category: 'building-materials',
    pack: '50 kg',
    uom: 'bag',
    gtin: '6156000312257',
    base: 8400,
  },
  {
    name: 'Iron Rod 12mm (12m length)',
    brand: 'BUA',
    category: 'building-materials',
    pack: '12 m',
    uom: 'length',
    gtin: '6156000312264',
    base: 11500,
  },
  {
    name: 'Roofing Nails 5kg',
    brand: 'BUA',
    category: 'building-materials',
    pack: '5 kg',
    uom: 'bag',
    gtin: '6156000312271',
    base: 6800,
  },

  // Pharmacy (batch + expiry tracked)
  {
    name: 'Emzor Paracetamol 500mg (Pack of 100)',
    brand: 'Emzor',
    category: 'pharmacy',
    pack: '100 tablets',
    uom: 'pack',
    gtin: '6156000412233',
    base: 1250,
    batch: true,
  },
  {
    name: 'Emzor Vitamin C 100mg (Pack of 100)',
    brand: 'Emzor',
    category: 'pharmacy',
    pack: '100 tablets',
    uom: 'pack',
    gtin: '6156000412240',
    base: 1600,
    batch: true,
  },
  {
    name: 'Fidson Amoxicillin 500mg (Pack of 20)',
    brand: 'Fidson',
    category: 'pharmacy',
    pack: '20 capsules',
    uom: 'pack',
    gtin: '6156000412257',
    base: 2400,
    batch: true,
  },
  {
    name: 'Fidson Oral Rehydration Salts',
    brand: 'Fidson',
    category: 'pharmacy',
    pack: '20 g',
    uom: 'sachet',
    gtin: '6156000412264',
    base: 260,
    batch: true,
  },

  // Electronics
  {
    name: 'Hisense 32" LED Television',
    brand: 'Hisense',
    category: 'electronics',
    pack: '32 inch',
    uom: 'unit',
    gtin: '6156000512233',
    base: 148000,
  },
  {
    name: 'Hisense Standing Fan 18"',
    brand: 'Hisense',
    category: 'electronics',
    pack: '18 inch',
    uom: 'unit',
    gtin: '6156000512240',
    base: 34500,
  },
  {
    name: 'Rechargeable LED Lantern',
    brand: 'Hisense',
    category: 'electronics',
    pack: 'single',
    uom: 'unit',
    gtin: '6156000512257',
    base: 7800,
  },

  // Home & kitchen
  {
    name: 'Non-stick Frying Pan 26cm',
    brand: 'Kings',
    category: 'home-kitchen',
    pack: '26 cm',
    uom: 'unit',
    gtin: '6156000612233',
    base: 6900,
  },
  {
    name: 'Stainless Cooking Pot Set (3 pieces)',
    brand: 'Kings',
    category: 'home-kitchen',
    pack: '3 pieces',
    uom: 'set',
    gtin: '6156000612240',
    base: 24500,
  },
  {
    name: 'Plastic Storage Bucket 20L',
    brand: 'Kings',
    category: 'home-kitchen',
    pack: '20 L',
    uom: 'unit',
    gtin: '6156000612257',
    base: 3200,
  },

  // Personal care
  {
    name: 'Nivea Body Lotion 400ml',
    brand: 'Nivea',
    category: 'personal-care',
    pack: '400 ml',
    uom: 'bottle',
    gtin: '6156000712233',
    base: 4600,
  },
  {
    name: 'Ariel Detergent 900g',
    brand: 'Ariel',
    category: 'personal-care',
    pack: '900 g',
    uom: 'pack',
    gtin: '6156000712240',
    base: 3100,
  },
  {
    name: 'Nivea Roll-on Deodorant 50ml',
    brand: 'Nivea',
    category: 'personal-care',
    pack: '50 ml',
    uom: 'unit',
    gtin: '6156000712257',
    base: 2350,
  },

  // Agro inputs (batch + expiry tracked)
  {
    name: 'NPK 20-10-10 Fertiliser 50kg',
    brand: 'Dangote',
    category: 'agro-inputs',
    pack: '50 kg',
    uom: 'bag',
    gtin: '6156000812233',
    base: 32000,
    batch: true,
  },
  {
    name: 'Maize Seed (Hybrid) 2kg',
    brand: 'Dangote',
    category: 'agro-inputs',
    pack: '2 kg',
    uom: 'bag',
    gtin: '6156000812240',
    base: 5400,
    batch: true,
  },
]

interface SeedOrg {
  key: string
  name: string
  type: 'warehouse' | 'merchant' | 'outlet'
  owner: { name: string; phone: string; email: string }
  lat: number
  lng: number
  address: string
  city: string
  dispatch: number
  /** Category slugs this business carries. */
  carries: string[]
}

const ORGS: SeedOrg[] = [
  // Tier 2 - dealer warehouses
  {
    key: 'apapa-hub',
    name: 'Apapa Distribution Hub',
    type: 'warehouse',
    owner: { name: 'Tunde Bakare', phone: '08031000001', email: 'tunde@apapahub.ng' },
    lat: 6.4491,
    lng: 3.3592,
    address: 'Wharf Road, Apapa',
    city: 'Lagos',
    dispatch: 240,
    carries: ['groceries', 'beverages', 'building-materials', 'personal-care', 'agro-inputs'],
  },
  {
    key: 'ikeja-warehouse',
    name: 'Ikeja Central Warehouse',
    type: 'warehouse',
    owner: { name: 'Ngozi Eze', phone: '08031000002', email: 'ngozi@ikejacentral.ng' },
    lat: 6.61,
    lng: 3.34,
    address: 'Acme Road, Ogba',
    city: 'Lagos',
    dispatch: 200,
    carries: ['groceries', 'pharmacy', 'electronics', 'home-kitchen', 'personal-care'],
  },

  // Tier 3 - merchants (wholesalers)
  {
    key: 'alaba-wholesale',
    name: 'Alaba Wholesale Ltd',
    type: 'merchant',
    owner: { name: 'Emeka Obi', phone: '08032000001', email: 'emeka@alabawholesale.ng' },
    lat: 6.46,
    lng: 3.19,
    address: 'Alaba International Market',
    city: 'Lagos',
    dispatch: 120,
    carries: ['electronics', 'home-kitchen', 'personal-care'],
  },
  {
    key: 'mushin-trade',
    name: 'Mushin Trade Partners',
    type: 'merchant',
    owner: { name: 'Fatima Yusuf', phone: '08032000002', email: 'fatima@mushintrade.ng' },
    lat: 6.531,
    lng: 3.349,
    address: 'Agege Motor Road, Mushin',
    city: 'Lagos',
    dispatch: 90,
    carries: ['groceries', 'beverages', 'personal-care'],
  },
  {
    key: 'oshodi-bulk',
    name: 'Oshodi Bulk Traders',
    type: 'merchant',
    owner: { name: 'Segun Adeyemi', phone: '08032000003', email: 'segun@oshodibulk.ng' },
    lat: 6.556,
    lng: 3.345,
    address: 'Oshodi Market Road',
    city: 'Lagos',
    dispatch: 100,
    carries: ['groceries', 'building-materials', 'agro-inputs', 'pharmacy'],
  },

  // Tier 4 - neighbourhood retail outlets
  {
    key: 'grace-stores',
    name: 'Grace Stores',
    type: 'outlet',
    owner: { name: 'Grace Aderinto', phone: '08033000001', email: 'grace@gracestores.ng' },
    lat: 6.599,
    lng: 3.352,
    address: '14 Allen Avenue, Ikeja',
    city: 'Lagos',
    dispatch: 25,
    carries: ['groceries', 'beverages', 'personal-care'],
  },
  {
    key: 'jide-supermarket',
    name: 'Jide Supermarket',
    type: 'outlet',
    owner: { name: 'Jide Olawale', phone: '08033000002', email: 'jide@jidesupermarket.ng' },
    lat: 6.605,
    lng: 3.348,
    address: '7 Opebi Road, Ikeja',
    city: 'Lagos',
    dispatch: 30,
    carries: ['groceries', 'beverages', 'home-kitchen', 'personal-care'],
  },
  {
    key: 'adaobi-provisions',
    name: 'Adaobi Provisions',
    type: 'outlet',
    owner: { name: 'Adaobi Nnamdi', phone: '08033000003', email: 'adaobi@adaobistores.ng' },
    lat: 6.592,
    lng: 3.362,
    address: '22 Awolowo Way, Ikeja',
    city: 'Lagos',
    dispatch: 20,
    carries: ['groceries', 'beverages'],
  },
  {
    key: 'yaba-minimart',
    name: 'Yaba Mini Mart',
    type: 'outlet',
    owner: { name: 'Bola Ogundipe', phone: '08033000004', email: 'bola@yabaminimart.ng' },
    lat: 6.51,
    lng: 3.372,
    address: '5 Herbert Macaulay Way, Yaba',
    city: 'Lagos',
    dispatch: 25,
    carries: ['groceries', 'beverages', 'personal-care'],
  },
  {
    key: 'surulere-fresh',
    name: 'Surulere Fresh Foods',
    type: 'outlet',
    owner: { name: 'Kemi Balogun', phone: '08033000005', email: 'kemi@surulerefresh.ng' },
    lat: 6.4975,
    lng: 3.349,
    address: '31 Adeniran Ogunsanya, Surulere',
    city: 'Lagos',
    dispatch: 30,
    carries: ['groceries', 'beverages', 'home-kitchen'],
  },
  {
    key: 'ikeja-pharmacy',
    name: 'Ikeja Pharmacy Plus',
    type: 'outlet',
    owner: { name: 'Dr Chinedu Okeke', phone: '08033000006', email: 'chinedu@ikejapharmacy.ng' },
    lat: 6.603,
    lng: 3.356,
    address: '9 Obafemi Awolowo Way, Ikeja',
    city: 'Lagos',
    dispatch: 20,
    carries: ['pharmacy', 'personal-care'],
  },
  {
    key: 'lekki-home',
    name: 'Lekki Home Essentials',
    type: 'outlet',
    owner: { name: 'Ifeoma Chukwu', phone: '08033000007', email: 'ifeoma@lekkihome.ng' },
    lat: 6.4478,
    lng: 3.4723,
    address: 'Admiralty Way, Lekki Phase 1',
    city: 'Lagos',
    dispatch: 35,
    carries: ['home-kitchen', 'electronics', 'personal-care'],
  },
  {
    key: 'buildright',
    name: 'BuildRight Materials',
    type: 'outlet',
    owner: { name: 'Yakubu Danladi', phone: '08033000008', email: 'yakubu@buildright.ng' },
    lat: 6.608,
    lng: 3.33,
    address: 'Oba Akran Avenue, Ikeja',
    city: 'Lagos',
    dispatch: 60,
    carries: ['building-materials'],
  },
]

// ---------------------------------------------------------------------------

async function main() {
  // Seeding installs the demo accounts, including an administrator whose
  // password is committed to this repository. Harmless locally, a full
  // compromise anywhere else, so it is gated on the same check as the drop.
  assertDestructiveAllowed('seed demo data')

  const sql = await getSql()
  const log = (msg: string) => console.log(`  ${msg}`)

  const existing = await sql.one<{ count: number }>(`SELECT COUNT(*)::int AS count FROM users`)
  if ((existing?.count ?? 0) > 0) {
    console.error('\n! Database already contains data. Run `npm run db:reset` to start clean.')
    process.exit(1)
  }

  console.log('\nSeeding AfriMesh pilot market (Lagos)\n')

  // -- Ranking weights and platform settings -------------------------------
  console.log('· Configuration')
  for (const [scope, weights] of Object.entries(DEFAULT_WEIGHTS)) {
    for (const [factor, weight] of Object.entries(weights)) {
      await setWeight(scope as RankingScope, factor, weight)
    }
  }
  await setSetting('launch_market', { city: 'Lagos', country: 'NG' })
  await setSetting('support_contact', { phone: '+2348000000000', email: 'support@afrimesh.africa' })
  log('ranking weights + platform settings written')

  // -- Catalogue -----------------------------------------------------------
  console.log('· Master product catalogue')
  const categoryIds = new Map<string, string>()
  for (const [index, category] of CATEGORIES.entries()) {
    const row = await sql.one<{ id: string }>(
      `INSERT INTO categories (name, slug, icon, sort_order) VALUES ($1,$2,$3,$4) RETURNING id`,
      [category.name, category.slug, category.icon, index],
    )
    categoryIds.set(category.slug, row!.id)
  }

  const brandIds = new Map<string, string>()
  for (const brand of BRANDS) {
    const slug = brand.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    // Every brand gets a mark, so the product-photo -> brand-logo fallback is
    // actually exercisable: clear a product's photo and its maker's logo shows.
    const logo = await storeGeneratedSvg(businessLogoSvg(brand), 'logos', `brand-${slug}`)
    const row = await sql.one<{ id: string }>(
      `INSERT INTO brands (name, slug, logo_url) VALUES ($1,$2,$3) RETURNING id`,
      [brand, slug, logo.url],
    )
    brandIds.set(brand, row!.id)
  }

  const productIds = new Map<string, string>()
  for (const product of PRODUCTS) {
    // No image_url. A seeded product has no photograph, and the generated tile
    // that used to be stored here was an initials badge wearing a photo's
    // clothes: because it landed in `image_url` it outranked everything else,
    // so every card showed "PM" instead of the milk tin `ProductArt` draws.
    // Leaving the column null lets the illustration win, and keeps the field
    // meaning what it says - a photo someone actually took.
    const created = await createProduct({
      name: product.name,
      gtin: product.gtin,
      brandId: brandIds.get(product.brand) ?? null,
      categoryId: categoryIds.get(product.category) ?? null,
      unitOfMeasure: product.uom,
      packSize: product.pack,
      requiresBatch: product.batch ?? false,
      description: `${product.brand} ${product.name}. Sold in ${product.pack}.`,
    })
    productIds.set(product.name, created.id)
  }
  log(`${CATEGORIES.length} categories, ${BRANDS.length} brands, ${PRODUCTS.length} products`)

  // -- Platform staff ------------------------------------------------------
  console.log('· People')
  const admin = await registerUser({
    fullName: 'Khalifa Babankwata',
    email: 'admin@afrimesh.africa',
    phone: '08030000000',
    password: 'afrimesh',
    role: 'super_admin',
  })
  await registerUser({
    fullName: 'Nasir Ibrahim',
    email: 'auditor@afrimesh.africa',
    password: 'afrimesh',
    role: 'auditor',
  })

  // -- Consumers -----------------------------------------------------------
  const consumers = await Promise.all([
    registerUser({
      fullName: 'Ada Nwosu',
      phone: '08030000001',
      email: 'ada@example.ng',
      password: 'afrimesh',
      lat: 6.6018,
      lng: 3.3515,
      address: '12 Allen Avenue, Ikeja',
      city: 'Lagos',
      state: 'Lagos',
    }),
    registerUser({
      fullName: 'Musa Bello',
      phone: '08030000002',
      email: 'musa@example.ng',
      password: 'afrimesh',
      lat: 6.51,
      lng: 3.372,
      address: '3 Commercial Avenue, Yaba',
      city: 'Lagos',
      state: 'Lagos',
    }),
    registerUser({
      fullName: 'Chidinma Okafor',
      phone: '08030000003',
      email: 'chidinma@example.ng',
      password: 'afrimesh',
      lat: 6.4975,
      lng: 3.349,
      address: '18 Bode Thomas, Surulere',
      city: 'Lagos',
      state: 'Lagos',
    }),
  ])
  // -- Delivery partners ---------------------------------------------------
  // Positioned around the Ikeja and Yaba clusters so open jobs actually fall
  // inside their radius on the job board.
  const riders = await Promise.all(
    [
      {
        name: 'Sola Adeyinka',
        phone: '08034000001',
        email: 'sola@rider.ng',
        lat: 6.6005,
        lng: 3.3505,
      },
      {
        name: 'Ibrahim Sani',
        phone: '08034000002',
        email: 'ibrahim@rider.ng',
        lat: 6.512,
        lng: 3.37,
      },
      { name: 'Peter Okon', phone: '08034000003', email: 'peter@rider.ng', lat: 6.498, lng: 3.35 },
    ].map((rider) =>
      registerUser({
        fullName: rider.name,
        phone: rider.phone,
        email: rider.email,
        password: 'afrimesh',
        role: 'delivery_partner',
        lat: rider.lat,
        lng: rider.lng,
        city: 'Lagos',
        state: 'Lagos',
      }),
    ),
  )

  log(`1 super admin, 1 auditor, ${consumers.length} consumers, ${riders.length} delivery partners`)

  // -- Businesses ----------------------------------------------------------
  console.log('· Businesses')
  const orgIds = new Map<string, string>()
  const orgOwners = new Map<string, string>()

  for (const spec of ORGS) {
    const owner = await registerUser({
      fullName: spec.owner.name,
      phone: spec.owner.phone,
      email: spec.owner.email,
      password: 'afrimesh',
      lat: spec.lat,
      lng: spec.lng,
      address: spec.address,
      city: spec.city,
      state: 'Lagos',
    })
    const org = await registerOrganisation({
      name: spec.name,
      type: spec.type,
      ownerUserId: owner.id,
      registrationNumber: `RC${1_000_000 + orgIds.size}`,
      lat: spec.lat,
      lng: spec.lng,
      address: spec.address,
      city: spec.city,
      state: 'Lagos',
      phone: spec.owner.phone,
      email: spec.owner.email,
    })
    // All but one are approved, so the admin console has a real pending queue.
    if (spec.key !== 'lekki-home') await verifyOrganisation(org.id, admin.id)

    // No logo_url, for the same reason products get no image_url: an initials
    // tile stored here reads as a logo the owner uploaded, so it outranks the
    // `SellerArt` mark and every shop goes back to being two letters. The
    // column fills in when an owner uploads one from /partner/settings.
    await sql.query(`UPDATE organisations SET avg_dispatch_minutes = $2 WHERE id = $1`, [
      org.id,
      spec.dispatch,
    ])
    orgIds.set(spec.key, org.id)
    orgOwners.set(spec.key, owner.id)
  }
  log(`${ORGS.length} organisations (1 left pending verification for the admin queue)`)

  // -- Inventory -----------------------------------------------------------
  console.log('· Inventory (Distributed Commerce Inventory Engine)')
  let listings = 0

  for (const spec of ORGS) {
    const orgId = orgIds.get(spec.key)!
    const ownerId = orgOwners.get(spec.key)!
    const catalogue = PRODUCTS.filter((p) => spec.carries.includes(p.category))

    for (const product of catalogue) {
      const productId = productIds.get(product.name)!

      // Price ladder down the chain. Each tier adds its margin, so a consumer
      // buying from a shop pays more than the shop paid its merchant - which
      // is what makes the wholesale/retail split in the price layer real.
      const priceFor = {
        warehouse: { wholesale: product.base, retail: null as number | null },
        merchant: { wholesale: Math.round(product.base * 1.08), retail: null as number | null },
        outlet: { wholesale: null as number | null, retail: Math.round(product.base * 1.28) },
      }[spec.type]

      // Bigger tiers hold deeper stock and enforce minimum order quantities.
      const depth = { warehouse: 900, merchant: 260, outlet: 45 }[spec.type]
      const moq = { warehouse: 20, merchant: 5, outlet: 1 }[spec.type]

      // Vary quantities so low-stock and out-of-stock states exist to be seen.
      const jitter = (product.name.length * 7 + spec.key.length * 13) % 100
      let qty = Math.max(0, Math.round(depth * (0.35 + jitter / 100)))
      if (spec.type === 'outlet' && jitter > 92) qty = 0
      else if (spec.type === 'outlet' && jitter > 84) qty = 3

      // A few promotional prices, so the promo path is exercised.
      const promo = jitter > 95 && priceFor.retail ? Math.round(priceFor.retail * 0.9) : null

      const item = await upsertStock({
        organisationId: orgId,
        productId,
        qty,
        retailPrice: priceFor.retail ? N(priceFor.retail) : null,
        wholesalePrice: priceFor.wholesale ? N(priceFor.wholesale) : null,
        promoPrice: promo ? N(promo) : null,
        minOrderQty: moq,
        reorderLevel: { warehouse: 100, merchant: 30, outlet: 6 }[spec.type],
        actorUserId: ownerId,
        note: 'Opening stock',
      })
      listings++

      // Batch and expiry tracking where the product demands it.
      if (product.batch && qty > 0) {
        const expiry = new Date()
        expiry.setDate(expiry.getDate() + (jitter > 80 ? 40 : 400))
        await addBatch(item.id, {
          batchNumber: `B${product.gtin.slice(-5)}-${spec.key.slice(0, 3).toUpperCase()}`,
          manufacturedOn: new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10),
          expiresOn: expiry.toISOString().slice(0, 10),
          qty,
        })
      }
    }
  }
  log(`${listings} live listings across ${ORGS.length} businesses`)

  // -- Demand signal -------------------------------------------------------
  console.log('· Demand intelligence')
  const ada = consumers[0]
  const searchCtx = { lat: 6.6018, lng: 3.3515, tier: TIER.consumer, userId: ada.id }
  for (const term of [
    'peak milk',
    'cement',
    'indomie',
    'rice',
    'paracetamol',
    'cooking oil',
    'generator',
    'diesel',
  ]) {
    await searchProducts(searchCtx, term, {})
  }
  for (const name of [
    'Peak Milk Powder 400g',
    'Dangote Cement 50kg',
    'Indomie Chicken Noodles (Carton of 40)',
    'Kings Rice 5kg',
  ]) {
    for (let i = 0; i < 5; i++) await recordProductView(productIds.get(name)!, ada.id)
  }
  log('search history and product views recorded (2 searches with no local match)')

  // -- Live commerce -------------------------------------------------------
  console.log('· Orders')
  const graceId = orgIds.get('grace-stores')!
  const jideId = orgIds.get('jide-supermarket')!
  const yabaId = orgIds.get('yaba-minimart')!
  const mushinId = orgIds.get('mushin-trade')!
  const apapaId = orgIds.get('apapa-hub')!

  async function pickListing(orgId: string, productName: string) {
    const row = await sql.one<{ id: string; min_order_qty: number }>(
      `SELECT id, min_order_qty FROM inventory_items
        WHERE organisation_id = $1 AND product_id = $2 AND qty_available > 0`,
      [orgId, productIds.get(productName)!],
    )
    return row
  }

  /** Places, pays and drives an order all the way to completion + rating. */
  async function fullOrder(opts: {
    buyerUserId: string
    buyerOrgId: string | null
    buyerTier: number
    sellerOrgId: string
    lines: { product: string; qty: number }[]
    lat: number
    lng: number
    address: string
    method: 'wallet' | 'card' | 'bank_transfer' | 'ussd'
    finish: 'completed' | 'dispatched' | 'confirmed' | 'pending'
    stars?: number
    comment?: string
    daysAgo?: number
    /** Route the delivery through a delivery partner rather than the seller. */
    riderUserId?: string
  }) {
    const items: { inventoryItemId: string; qty: number }[] = []
    for (const line of opts.lines) {
      const listing = await pickListing(opts.sellerOrgId, line.product)
      if (!listing) continue
      items.push({
        inventoryItemId: listing.id,
        qty: Math.max(line.qty, listing.min_order_qty),
      })
    }
    if (!items.length) return null

    const order = await placeOrder({
      buyerUserId: opts.buyerUserId,
      buyerOrgId: opts.buyerOrgId,
      buyerTier: opts.buyerTier,
      sellerOrgId: opts.sellerOrgId,
      items,
      fulfilment: 'delivery',
      deliveryAddress: opts.address,
      deliveryLat: opts.lat,
      deliveryLng: opts.lng,
    })

    if (opts.finish === 'pending') return order

    const paid = await payOrder(order.id, opts.buyerUserId, opts.method)
    if (!paid.ok) {
      console.warn(`    ! payment failed for ${order.order_number}: ${paid.error}`)
      return order
    }

    if (opts.finish === 'confirmed') return order

    await advanceOrder(order.id, 'preparing', opts.buyerUserId, 'Seller preparing the order')
    await advanceOrder(order.id, 'dispatched', opts.buyerUserId, 'Order handed over for delivery')
    if (opts.finish === 'dispatched') return order

    if (opts.riderUserId) {
      // Through the logistics engine: a delivery partner claims the job from
      // the open board, collects, and delivers. Completing the job is what
      // marks the order delivered and pays the rider.
      const job = await sql.one<{ id: string }>(
        `SELECT id FROM deliveries WHERE order_id = $1 AND status = 'unassigned'`,
        [order.id],
      )
      if (job) {
        await acceptJob(job.id, opts.riderUserId)
        await markPickedUp(job.id, opts.riderUserId)
        await completeDelivery(job.id, opts.riderUserId, 'Handed to the customer')
      } else {
        await advanceOrder(order.id, 'delivered', opts.buyerUserId, 'Delivered to buyer')
      }
    } else {
      await advanceOrder(order.id, 'delivered', opts.buyerUserId, 'Delivered by the seller')
    }

    await advanceOrder(order.id, 'completed', opts.buyerUserId, 'Order completed')

    if (opts.stars) {
      await rateOrder(order.id, opts.buyerUserId, opts.stars, opts.comment ?? null)
    }

    // Backdate so the dashboards show a trend rather than one spike today.
    if (opts.daysAgo) {
      await sql.query(
        `UPDATE orders
            SET placed_at    = now() - ($2 || ' days')::interval,
                confirmed_at = now() - ($2 || ' days')::interval,
                delivered_at = now() - ($2 || ' days')::interval,
                completed_at = now() - ($2 || ' days')::interval
          WHERE id = $1`,
        [order.id, String(opts.daysAgo)],
      )
    }
    return order
  }

  // Fund one consumer wallet so the wallet payment path is exercised too.
  await deposit('user', consumers[0].id, N(150_000), 'Opening wallet top-up')

  const consumerOrders = [
    {
      buyer: 0,
      seller: graceId,
      lines: [
        { product: 'Peak Milk Powder 400g', qty: 2 },
        { product: 'Golden Penny Semovita 1kg', qty: 3 },
      ],
      method: 'wallet' as const,
      finish: 'completed' as const,
      stars: 5,
      comment: 'Very close and always in stock.',
      daysAgo: 11,
      rider: 0,
    },
    {
      buyer: 0,
      seller: jideId,
      lines: [
        { product: 'Indomie Chicken Noodles (Carton of 40)', qty: 1 },
        { product: 'Power Oil Vegetable Oil 3L', qty: 1 },
      ],
      method: 'card' as const,
      finish: 'completed' as const,
      stars: 4,
      comment: 'Good prices, delivery took a while.',
      daysAgo: 8,
      rider: 0,
    },
    {
      buyer: 1,
      seller: yabaId,
      lines: [
        { product: 'Kings Rice 5kg', qty: 2 },
        { product: 'Dangote Sugar 1kg', qty: 2 },
      ],
      method: 'card' as const,
      finish: 'completed' as const,
      stars: 5,
      comment: 'Cheapest around Yaba.',
      daysAgo: 6,
      rider: 1,
    },
    {
      buyer: 2,
      seller: orgIds.get('surulere-fresh')!,
      lines: [{ product: 'Mamador Cooking Oil 1L', qty: 3 }],
      method: 'bank_transfer' as const,
      finish: 'completed' as const,
      stars: 4,
      daysAgo: 5,
      rider: 2,
    },
    // Delivered by the seller themselves, so the delivery fee settles to them.
    {
      buyer: 0,
      seller: graceId,
      lines: [{ product: 'Coca-Cola 50cl (Pack of 12)', qty: 2 }],
      method: 'wallet' as const,
      finish: 'completed' as const,
      stars: 5,
      comment: 'Repeat order, no issues.',
      daysAgo: 3,
    },
    // Dispatched and waiting on the rider board, so it is visible to riders.
    {
      buyer: 1,
      seller: yabaId,
      lines: [{ product: 'Ariel Detergent 900g', qty: 2 }],
      method: 'ussd' as const,
      finish: 'dispatched' as const,
    },
    {
      buyer: 2,
      seller: orgIds.get('surulere-fresh')!,
      lines: [{ product: 'Nestlé Pure Life 1.5L', qty: 6 }],
      method: 'card' as const,
      finish: 'confirmed' as const,
    },
    {
      buyer: 0,
      seller: jideId,
      lines: [{ product: 'Nivea Body Lotion 400ml', qty: 1 }],
      method: 'wallet' as const,
      finish: 'pending' as const,
    },
  ]

  const positions = [
    { lat: 6.6018, lng: 3.3515, address: '12 Allen Avenue, Ikeja' },
    { lat: 6.51, lng: 3.372, address: '3 Commercial Avenue, Yaba' },
    { lat: 6.4975, lng: 3.349, address: '18 Bode Thomas, Surulere' },
  ]

  let placed = 0
  const placedOrders: { id: string; buyer: number }[] = []
  for (const spec of consumerOrders) {
    const pos = positions[spec.buyer]
    const result = await fullOrder({
      buyerUserId: consumers[spec.buyer].id,
      buyerOrgId: null,
      buyerTier: TIER.consumer,
      sellerOrgId: spec.seller,
      lines: spec.lines,
      lat: pos.lat,
      lng: pos.lng,
      address: pos.address,
      method: spec.method,
      finish: spec.finish,
      stars: spec.stars,
      comment: spec.comment,
      daysAgo: spec.daysAgo,
      riderUserId: spec.rider !== undefined ? riders[spec.rider].id : undefined,
    })
    if (result) {
      placed++
      placedOrders.push({ id: result.id, buyer: spec.buyer })
    }
  }

  // B2B: an outlet restocking from its merchant, and a merchant restocking
  // from a dealer warehouse. This is the multi-tier supply chain in action.
  const b2b = [
    {
      buyerUserId: orgOwners.get('grace-stores')!,
      buyerOrgId: graceId,
      tier: TIER.outlet,
      seller: mushinId,
      lines: [
        { product: 'Peak Milk Powder 400g', qty: 24 },
        { product: 'Golden Penny Semovita 1kg', qty: 30 },
      ],
      lat: 6.599,
      lng: 3.352,
      address: '14 Allen Avenue, Ikeja',
      daysAgo: 9,
      stars: 5,
    },
    {
      buyerUserId: orgOwners.get('yaba-minimart')!,
      buyerOrgId: yabaId,
      tier: TIER.outlet,
      seller: mushinId,
      lines: [{ product: 'Kings Rice 5kg', qty: 20 }],
      lat: 6.51,
      lng: 3.372,
      address: '5 Herbert Macaulay Way, Yaba',
      daysAgo: 4,
      stars: 4,
    },
    {
      buyerUserId: orgOwners.get('mushin-trade')!,
      buyerOrgId: mushinId,
      tier: TIER.merchant,
      seller: apapaId,
      lines: [
        { product: 'Peak Milk Powder 400g', qty: 200 },
        { product: 'Kings Rice 5kg', qty: 120 },
      ],
      lat: 6.531,
      lng: 3.349,
      address: 'Agege Motor Road, Mushin',
      daysAgo: 12,
      stars: 5,
    },
  ]

  for (const spec of b2b) {
    await deposit('user', spec.buyerUserId, N(3_000_000), 'Business wallet funding')
    const result = await fullOrder({
      buyerUserId: spec.buyerUserId,
      buyerOrgId: spec.buyerOrgId,
      buyerTier: spec.tier,
      sellerOrgId: spec.seller,
      lines: spec.lines,
      lat: spec.lat,
      lng: spec.lng,
      address: spec.address,
      method: 'wallet',
      finish: 'completed',
      stars: spec.stars,
      daysAgo: spec.daysAgo,
    })
    if (result) placed++
  }
  log(`${placed} orders across B2C and B2B tiers`)

  // -- Conversations -------------------------------------------------------
  console.log('· Messages')
  let threads = 0
  const conversationSeeds = [
    {
      index: 0,
      from: 'buyer' as const,
      body: 'Hi, please leave it with the security at the gate if I am not in.',
    },
    { index: 0, from: 'seller' as const, body: 'Noted. The rider will call you when he is close.' },
    { index: 2, from: 'buyer' as const, body: 'Is the rice the 5kg bag or the smaller one?' },
    { index: 2, from: 'seller' as const, body: 'It is the 5kg bag. Sent already.' },
  ]
  for (const seed of conversationSeeds) {
    const target = placedOrders[seed.index]
    if (!target) continue
    const order = await sql.one<{ seller_org_id: string }>(
      `SELECT seller_org_id FROM orders WHERE id = $1`,
      [target.id],
    )
    if (!order) continue

    if (seed.from === 'buyer') {
      await sendMessage({
        orderId: target.id,
        senderUserId: consumers[target.buyer].id,
        organisationId: null,
        body: seed.body,
      })
    } else {
      const owner = await sql.one<{ owner_user_id: string }>(
        `SELECT owner_user_id FROM organisations WHERE id = $1`,
        [order.seller_org_id],
      )
      if (!owner?.owner_user_id) continue
      await sendMessage({
        orderId: target.id,
        senderUserId: owner.owner_user_id,
        organisationId: order.seller_org_id,
        body: seed.body,
      })
    }
    threads++
  }

  const openBoard = await openJobs({ lat: 6.6018, lng: 3.3515 }, { radiusKm: 30 })
  log(`${threads} messages exchanged · ${openBoard.length} delivery job(s) open on the rider board`)

  // -- Integrity check -----------------------------------------------------
  console.log('· Verification')
  const integrity = await verifyIntegrity()
  const counts = await sql.one<{
    events: number
    ledger_entries: number
    reservations: number
    notifications: number
    ratings: number
  }>(
    `SELECT
      (SELECT COUNT(*)::int FROM event_log)          AS events,
      (SELECT COUNT(*)::int FROM ledger_entries)     AS ledger_entries,
      (SELECT COUNT(*)::int FROM stock_reservations) AS reservations,
      (SELECT COUNT(*)::int FROM notifications)      AS notifications,
      (SELECT COUNT(*)::int FROM ratings)            AS ratings`,
  )

  log(
    `${counts?.events} domain events, ${counts?.ledger_entries} ledger entries, ${counts?.ratings} verified ratings`,
  )
  log(
    `double-entry ledger balanced: ${integrity.balanced ? 'yes' : 'NO'} · ` +
      `net wallet position: ${integrity.netWalletPosition} (must be 0)`,
  )

  if (!integrity.balanced || integrity.netWalletPosition !== 0) {
    console.error('\n! Ledger integrity check FAILED — seeding aborted as unsafe.')
    process.exit(1)
  }

  console.log('\nDone. Sign in with any of these (password: afrimesh)\n')
  console.log('  Consumer          ada@example.ng')
  console.log('  Retail outlet     grace@gracestores.ng')
  console.log('  Merchant          fatima@mushintrade.ng')
  console.log('  Dealer warehouse  tunde@apapahub.ng')
  console.log('  Delivery partner  sola@rider.ng          → /rider')
  console.log('  Platform admin    admin@afrimesh.africa  → /admin')
  console.log('')
  process.exit(0)
}

main().catch((err) => {
  // A refusal is a decision, not a crash — print the reason, not a stack.
  if (err instanceof DestructiveGuardError) {
    console.error(`
! ${err.message}
`)
    process.exit(1)
  }
  console.error(err)
  process.exit(1)
})
