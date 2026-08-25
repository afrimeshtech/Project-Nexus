'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from '@/components/Icon'

export interface MenuLink {
  href: string
  label: string
  icon: IconName
  badge?: number
}

/**
 * Hamburger menu in the header.
 *
 * A real disclosure rather than a decorative icon: it holds the destinations
 * that do not fit the bar, and on a phone it is the only way to reach several
 * of them. Closes on Escape and on navigation.
 *
 * The panel is light while the bar above it is the brand's dark green, so the
 * icons and labels here take their own colours — the bar's white text would be
 * invisible on this surface.
 *
 * The sheet is portalled to the body. It is rendered from inside the header,
 * and the header is `position: relative; z-index: 30` — which makes it a
 * stacking context, and traps everything inside it at that rank. The sheet's
 * own z-60 only ordered it against the header's other children, so the footer,
 * a z-30 sibling later in the document, painted straight over the bottom of
 * the panel. Raising the number would not have fixed it; leaving the context
 * does.
 */
export function HeaderMenu({ links, accountLabel }: { links: MenuLink[]; accountLabel?: string }) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    const panel = panelRef.current
    // Captured now rather than read in cleanup: by the time cleanup runs the
    // ref may point somewhere else, and focus would go with it.
    const trigger = triggerRef.current
    /*
     * Move into the sheet, and keep the keyboard inside it.
     *
     * Opening used to leave focus on the trigger, behind the scrim: a keyboard
     * user pressed the button, nothing appeared to happen, and tabbing walked
     * them through the page underneath rather than the menu they had just
     * opened. A sheet that covers the page has to own the keyboard while it is
     * up, and hand it back when it closes.
     */
    const focusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null)

    focusable()[0]?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        return
      }
      if (event.key !== 'Tab') return

      const items = focusable()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const activeEl = document.activeElement

      // Wrap at the ends rather than letting focus escape to the page behind.
      if (event.shiftKey && (activeEl === first || !panel?.contains(activeEl))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && activeEl === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    // Stop the page scrolling behind an open sheet.
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      // Back to the control that opened it, so the place in the page is not
      // lost. Guarded because the trigger is still mounted either way.
      trigger?.focus()
    }
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Open menu"
        className="grid size-10 place-items-center rounded-brand border border-bar-line text-bar-ink transition-colors hover:bg-bar-line/60"
      >
        <Icon name="menu" size={20} />
      </button>

      {/* Opens from the left, matching the button's side — a panel that flies in
          from the opposite edge to the control that opened it breaks the
          connection between the two. */}
      {open &&
        createPortal(
          <div className="fixed inset-0 flex justify-start" style={{ zIndex: 'var(--z-overlay)' }}>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-surface-deep/70 backdrop-blur-sm"
            />

            <nav
              aria-label="Menu"
              className="relative flex h-full w-[19rem] max-w-[85vw] flex-col bg-surface shadow-raised"
            >
              {/* Name, and the way out. */}
              <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-4">
                <span className="truncate text-base font-semibold text-ink">
                  {accountLabel ?? 'Menu'}
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="grid size-9 shrink-0 place-items-center rounded-brand text-menu-icon transition-colors hover:bg-surface-muted"
                >
                  <Icon name="close" size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-2">
                {links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="menu-row hover:menu-row-hover"
                  >
                    <span className="shrink-0 text-menu-icon">
                      <Icon name={link.icon} size={26} />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{link.label}</span>
                    {!!link.badge && link.badge > 0 && (
                      <span className="pill-notify-sm shrink-0">{link.badge}</span>
                    )}
                  </Link>
                ))}
              </div>
            </nav>
          </div>,
          document.body,
        )}
    </>
  )
}
