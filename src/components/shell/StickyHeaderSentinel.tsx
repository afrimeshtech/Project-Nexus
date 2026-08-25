'use client'

import { useEffect } from 'react'

/**
 * Tells the header when it has stuck to the top of the viewport.
 *
 * `position: sticky` has no CSS state for "currently stuck" — the element
 * looks identical pinned or in flow — so a header that wants to condense on
 * pinning has to be told. The usual workaround is a scroll listener, which
 * fires on every frame of every scroll for a boolean that changes twice.
 *
 * This watches a one-pixel sentinel sitting immediately above the header
 * instead. When the sentinel leaves the viewport the header must be at the
 * top; when it returns, the header is back in flow. The browser does the work
 * off the main thread and calls back only on the transition.
 *
 * Degrades honestly: with no JavaScript, or if either element is missing, the
 * attribute is never set and the header stays at its full height — still
 * sticky, still usable, just not condensed.
 */
export function StickyHeaderSentinel({ headerId }: { headerId: string }) {
  const sentinelId = `${headerId}-sentinel`

  useEffect(() => {
    const header = document.getElementById(headerId)
    const sentinel = document.getElementById(sentinelId)
    if (!header || !sentinel) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        header.toggleAttribute('data-stuck', !entry.isIntersecting)
      },
      // Zero threshold: the transition is the sentinel touching the edge.
      { threshold: 0 },
    )

    observer.observe(sentinel)
    return () => {
      observer.disconnect()
      // The header outlives this component on a client navigation; leaving a
      // stale data-stuck behind would condense a header that is not pinned.
      header.removeAttribute('data-stuck')
    }
  }, [headerId, sentinelId])

  return <div id={sentinelId} aria-hidden="true" className="h-px" />
}
