import type { SVGProps } from 'react'

/**
 * Outlined icon set.
 *
 * Minimalist, stroked, no fills — drawn on a 24×24 grid with a 1.5 stroke and
 * round caps, so every icon shares the same optical weight.
 *
 * Colour comes from `currentColor`, never baked in. That matters here because
 * the app puts icons on both dark and light surfaces: on the forest ground they
 * inherit the light gray body colour, and inside a cream input field they
 * inherit the dark gray field colour. A hardcoded "dark gray" would be
 * invisible on half the app.
 *
 * Inline rather than an icon package: it is ~2 KB of markup that tree-shakes to
 * only what is used, and it keeps the zero-runtime-dependency posture the rest
 * of the UI has.
 */

export type IconName =
  | 'home'
  | 'search'
  | 'basket'
  | 'box'
  | 'wallet'
  | 'chat'
  | 'user'
  | 'bell'
  | 'pin'
  | 'star'
  | 'star-filled'
  | 'chart'
  | 'store'
  | 'tag'
  | 'scale'
  | 'shield'
  | 'list'
  | 'pulse'
  | 'inbox'
  | 'plus'
  | 'minus'
  | 'refresh'
  | 'settings'
  | 'scooter'
  | 'truck'
  | 'factory'
  | 'warehouse'
  | 'check'
  | 'lock'
  | 'compass'
  | 'folder'
  | 'receipt'
  | 'more'
  | 'clock'
  | 'trend'
  | 'pill'
  | 'device'
  | 'pan'
  | 'bottle'
  | 'cup'
  | 'brick'
  | 'wheat'
  | 'cart'
  | 'image'
  | 'chevron-down'
  | 'arrow-left'
  | 'menu'
  | 'close'
  | 'info'
  | 'bookmark'
  | 'mail'
  | 'eye'
  | 'eye-off'

/** Every path is stroked; `fill` stays none so the set reads as outlined. */
const PATHS: Record<IconName, string> = {
  home: 'M3 10.5 12 3l9 7.5M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5M9.5 21v-6h5v6',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM15.5 15.5 21 21',
  basket:
    'M3 9h18l-1.6 9.2a2 2 0 0 1-2 1.8H6.6a2 2 0 0 1-2-1.8L3 9ZM8 9 12 3l4 6M9.5 13v3.5M14.5 13v3.5',
  box: 'M20.5 8.5 12 4 3.5 8.5v7L12 20l8.5-4.5v-7ZM3.5 8.5 12 13l8.5-4.5M12 13v7',
  wallet:
    'M3.5 8.5A2 2 0 0 1 5.5 6.5h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9ZM3.5 10.5h17M16 15h1.5',
  chat: 'M20.5 12c0 4.1-3.8 7.4-8.5 7.4a9.7 9.7 0 0 1-2.6-.35L4.5 20.5l1.2-3.3A7 7 0 0 1 3.5 12C3.5 7.9 7.3 4.6 12 4.6s8.5 3.3 8.5 7.4Z',
  user: 'M12 11.5a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5ZM4.5 20.5c0-3.3 3.4-5.5 7.5-5.5s7.5 2.2 7.5 5.5',
  bell: 'M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10ZM10 18.5a2.2 2.2 0 0 0 4 0',
  pin: 'M12 21s6.5-6 6.5-11a6.5 6.5 0 1 0-13 0C5.5 15 12 21 12 21ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  star: 'M12 3.5l2.7 5.6 6.1.85-4.45 4.3 1.1 6.05L12 17.4l-5.45 2.9 1.1-6.05L3.2 9.95l6.1-.85L12 3.5Z',
  'star-filled':
    'M12 3.5l2.7 5.6 6.1.85-4.45 4.3 1.1 6.05L12 17.4l-5.45 2.9 1.1-6.05L3.2 9.95l6.1-.85L12 3.5Z',
  chart: 'M4 20V4M4 20h16M8 20v-6M12.5 20V9M17 20v-8',
  store: 'M4 9.5V20a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9.5M3 9.5 5.5 4h13L21 9.5H3ZM9 21v-5.5h6V21',
  tag: 'M4 11.5V5a1 1 0 0 1 1-1h6.5l8 8-7.5 7.5-8-8ZM8 8.5h.01',
  scale: 'M12 4v16M6 8h12M6 8 3.5 14h5L6 8ZM18 8l-2.5 6h5L18 8ZM8 20.5h8',
  shield: 'M12 3.5 5 6v5.5c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6l-7-2.5ZM9.5 12l1.8 1.8L15 10',
  list: 'M6 4h9l4 4v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM14.5 4v4.5H19M8.5 13h7M8.5 16.5h5',
  pulse: 'M3 12.5h4l2-5 3 10 2.5-6 1.5 3h5',
  inbox: 'M3.5 13h4l1.5 3h6l1.5-3h4M3.5 13 6 5h12l2.5 8v6a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-6Z',
  plus: 'M12 5.5v13M5.5 12h13',
  minus: 'M5.5 12h13',
  refresh: 'M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .35 1.9l.05.05a2 2 0 1 1-2.85 2.85l-.05-.05a1.7 1.7 0 0 0-2.9 1.2v.15a2 2 0 1 1-4 0V21a1.7 1.7 0 0 0-2.9-1.2l-.05.05A2 2 0 1 1 4.2 17l.05-.05A1.7 1.7 0 0 0 3.05 14H3a2 2 0 1 1 0-4h.15A1.7 1.7 0 0 0 4.25 7.1L4.2 7.05A2 2 0 1 1 7.05 4.2l.05.05A1.7 1.7 0 0 0 10 3.05V3a2 2 0 1 1 4 0v.15a1.7 1.7 0 0 0 2.9 1.2l.05-.05A2 2 0 1 1 19.8 7l-.05.05A1.7 1.7 0 0 0 21 10h.15a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z',
  scooter:
    'M6.5 19a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5ZM18.5 19a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5ZM9.25 16.25h6.5M13 5h3l2.5 8.5M5 8.5h5l3 7.75',
  truck:
    'M2.5 6.5h11v10h-11v-10ZM13.5 10h4l3 3v3.5h-7M6 20a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5ZM17 20a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Z',
  factory: 'M3.5 20.5V10l5 3V10l5 3V6l7 4v10.5h-17ZM7.5 20.5v-4M12 20.5v-4M16.5 20.5v-4',
  warehouse: 'M3 20.5V9.5L12 4l9 5.5v11M3 20.5h18M7.5 20.5v-7h9v7M7.5 17h9',
  check: 'M5 12.5 10 17.5 19.5 7',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13v9.5h-13V11ZM12 15v2.5',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM15.5 8.5 13.5 13.5 8.5 15.5 10.5 10.5 15.5 8.5Z',
  folder: 'M3.5 7.5a1 1 0 0 1 1-1h4l2 2.5h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-14a1 1 0 0 1-1-1v-11.5Z',
  receipt: 'M6 3.5h12v17l-3-1.75-3 1.75-3-1.75-3 1.75v-17ZM9 8h6M9 12h6M9 16h3',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.5V12l3 2',
  trend: 'M3.5 17 9 11l3.5 3L20.5 6M20.5 6h-5M20.5 6v5',
  pill: 'M8 16 16 8M6.5 17.5a4.6 4.6 0 0 1 0-6.5l4.5-4.5a4.6 4.6 0 0 1 6.5 6.5l-4.5 4.5a4.6 4.6 0 0 1-6.5 0Z',
  device: 'M7.5 3h9a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM10.5 18h3',
  pan: 'M3 13h11a0 0 0 0 1 0 0 5.5 5.5 0 0 1-11 0ZM14 13h7M17.5 9.5 21 13l-3.5 3.5',
  bottle: 'M10 3h4v3.5l1.5 2.5V21h-7V9l1.5-2.5V3ZM8.5 13h7',
  cup: 'M6 8h12l-1 12.5H7L6 8ZM8.5 4.5h7M9 12h6',
  brick: 'M3.5 8.5h17v7h-17v-7ZM3.5 12h17M9 8.5V12M15 12v3.5',
  wheat:
    'M12 21V9M12 9c0-2.5 1.5-4 3-4.5.5 2-.5 4-3 4.5ZM12 9c0-2.5-1.5-4-3-4.5-.5 2 .5 4 3 4.5ZM12 14c0-2.5 1.5-4 3-4.5.5 2-.5 4-3 4.5ZM12 14c0-2.5-1.5-4-3-4.5-.5 2 .5 4 3 4.5Z',
  cart: 'M3 4.5h2.5l2.5 10.5h9L20 8H7M9.5 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM16.5 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  image:
    'M4 5.5h16a.5.5 0 0 1 .5.5v12a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V6a.5.5 0 0 1 .5-.5ZM8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM3.5 16 9 11l4 4 3-2.5 4.5 4',
  'chevron-down': 'M6 9.5 12 15.5 18 9.5',
  'arrow-left': 'M19 12H5M11 6l-6 6 6 6',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5.5M12 7.75h.01',
  bookmark: 'M6.5 4h11a1 1 0 0 1 1 1v15l-6.5-4.5L5.5 20V5a1 1 0 0 1 1-1Z',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12ZM12 14.75a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5Z',
  'eye-off':
    'M4 4l16 16M10.6 6.1A9.6 9.6 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.9 3.6M14 14.2a2.75 2.75 0 0 1-4.2-4.2M6.6 7.7C4 9.4 2.5 12 2.5 12s3.5 6.5 9.5 6.5a9.3 9.3 0 0 0 4.4-1.1',
  mail: 'M4 6.5a1.5 1.5 0 0 1 1.5-1.5h13A1.5 1.5 0 0 1 20 6.5v11A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-11ZM4.5 6.5l7.5 6 7.5-6',
}

/** Only this one is filled — a filled star is how a rating reads. */
const FILLED: IconName[] = ['star-filled']

export function Icon({
  name,
  size = 20,
  className,
  ...props
}: { name: IconName; size?: number; className?: string } & Omit<
  SVGProps<SVGSVGElement>,
  'name' | 'width' | 'height'
>) {
  const filled = FILLED.includes(name)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

/** Category slug -> icon, so categories render outlined rather than as emoji. */
export const CATEGORY_ICON: Record<string, IconName> = {
  groceries: 'cart',
  beverages: 'cup',
  'building-materials': 'brick',
  pharmacy: 'pill',
  electronics: 'device',
  'home-kitchen': 'pan',
  'personal-care': 'bottle',
  'agro-inputs': 'wheat',
}
