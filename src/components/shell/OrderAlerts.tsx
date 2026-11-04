'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/Icon'

/**
 * Rings a bell on the store dashboard when a buyer pays for an order - the
 * moment there is something to prepare - so a retailer serving at the counter
 * hears it without watching the screen. Unpaid orders don't ring: they may
 * never be paid, and the reservation sweeper cancels them when they lapse.
 *
 * Polls /api/partner/order-alerts every POLL_MS. A background tab keeps
 * polling (browsers slow its timers to about once a minute), so it still
 * rings, only later. On a newly paid order it also shows a card naming the order,
 * announces it to screen readers, and asks the router to re-render the page.
 *
 * The card carries the news rather than the page's own numbers: in testing
 * (Next 16.2.12) router.refresh() fetched the fresh payload and the server
 * was verified to send the new order, yet the dashboard kept its old counts on
 * screen. A Link navigation always showed them, so the card's "View orders"
 * is one. The card is this component's own state, which always renders.
 *
 * The sound is synthesised with Web Audio - no file to ship or fail to load.
 * Browsers refuse to start audio before the person has interacted with the
 * page, so the audio context is unlocked on the first tap or key press; until
 * then a new order still updates the page, it just can't make a sound.
 *
 * The mute toggle is hidden below `sm`, where the partner bar has no room
 * left for another 44px button (see PartnerShell); the bell still rings there.
 *
 * The toggle is remembered per browser. It is a convenience, not a setting
 * anyone else needs to see, so localStorage is the right home for it.
 */
const POLL_MS = 15_000
const PREF_KEY = 'afrimesh:order-sound'

type AlertResponse = { cursor: string; orderNumbers: string[] }

// The preference as an external store, so the server render (always "on")
// and the saved browser value reconcile without a setState-in-effect flash.
// `memoryPref` backs it when storage is blocked (private mode), so the toggle
// still works for the visit.
let memoryPref: boolean | null = null
const prefListeners = new Set<() => void>()

function readPref(): boolean {
  try {
    const saved = localStorage.getItem(PREF_KEY)
    if (saved) return saved !== 'off'
  } catch {
    // Fall through to the in-memory value.
  }
  return memoryPref ?? true
}

function writePref(on: boolean) {
  memoryPref = on
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off')
  } catch {
    // Blocked storage: memoryPref carries it.
  }
  prefListeners.forEach((notify) => notify())
}

function subscribePref(notify: () => void) {
  prefListeners.add(notify)
  // Another tab toggling it should change this one too.
  window.addEventListener('storage', notify)
  return () => {
    prefListeners.delete(notify)
    window.removeEventListener('storage', notify)
  }
}

/** Two strikes of a small bell: a fundamental plus the inharmonic partials that make it ring. */
function ring(ctx: AudioContext) {
  const PARTIALS: [ratio: number, gain: number, decay: number][] = [
    [1, 0.5, 1.6],
    [2, 0.22, 1.1],
    [2.76, 0.16, 0.8],
    [5.4, 0.07, 0.45],
  ]
  const master = ctx.createGain()
  master.gain.value = 0.35
  master.connect(ctx.destination)

  for (const strike of [0, 0.32]) {
    const start = ctx.currentTime + strike
    for (const [ratio, gain, decay] of PARTIALS) {
      const osc = ctx.createOscillator()
      const env = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 830 * ratio
      env.gain.setValueAtTime(0.0001, start)
      env.gain.exponentialRampToValueAtTime(gain, start + 0.005)
      env.gain.exponentialRampToValueAtTime(0.0001, start + decay)
      osc.connect(env).connect(master)
      osc.start(start)
      osc.stop(start + decay + 0.05)
    }
  }
}

// Tab-wide, not per component. Every dashboard page renders its own
// PartnerShell, so moving between pages remounts this component. Kept per
// instance, the unlocked AudioContext went with the old page - a retailer who
// tapped "Orders" and then waited heard nothing, because that tap was the
// gesture and it unlocked a context that was then thrown away. The poll's
// cursor and seen-set had the same problem: each remount took a fresh
// baseline, and an order paid in the gap was filed as already there.
let sharedCtx: AudioContext | null = null
let unlockListening = false

function audio(): AudioContext | null {
  if (!sharedCtx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    sharedCtx = new Ctor()
  }
  return sharedCtx
}

// Listen until audio is actually running, not just once: a gesture that lands
// before the context can resume should not use up the only chance.
function listenForUnlock() {
  if (unlockListening) return
  unlockListening = true
  const unlock = () => {
    const ctx = audio()
    if (!ctx) return
    void ctx.resume().then(() => {
      if (ctx.state !== 'running') return
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    })
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
}

// Order numbers already rung for. The route repeats the last minute's orders
// on every poll (see its LOOKBACK note), so this is what stops a second ring.
// Replaced by each response rather than grown: a number keeps appearing until
// it ages out of the window, and then cannot come back. Keyed by store, so a
// different business signing in on the same tab starts from its own baseline.
const pollState: { orgId: string | null; cursor: string | null; seen: Set<string> } = {
  orgId: null,
  cursor: null,
  seen: new Set(),
}

export function OrderAlerts({ organisationId }: { organisationId: string }) {
  const router = useRouter()
  const soundOn = useSyncExternalStore(subscribePref, readPref, () => true)
  const [announcement, setAnnouncement] = useState('')
  const [arrived, setArrived] = useState<string[]>([])

  useEffect(listenForUnlock, [])

  useEffect(() => {
    if (pollState.orgId !== organisationId) {
      pollState.orgId = organisationId
      pollState.cursor = null
      pollState.seen = new Set()
    }
    let stopped = false

    const poll = async () => {
      try {
        const url = pollState.cursor
          ? `/api/partner/order-alerts?after=${encodeURIComponent(pollState.cursor)}`
          : '/api/partner/order-alerts'
        const res = await fetch(url, { cache: 'no-store' })
        // Signed out, or a member who can't handle orders: nothing to ring for.
        if (res.status === 401 || res.status === 403) {
          stopped = true
          return
        }
        if (!res.ok) return
        const data = (await res.json()) as AlertResponse
        // Another store signed in while this request was in flight.
        if (pollState.orgId !== organisationId) return
        const isFirst = pollState.cursor === null
        pollState.cursor = data.cursor
        const fresh = data.orderNumbers.filter((n) => !pollState.seen.has(n))
        pollState.seen = new Set(data.orderNumbers)
        // The first response is the baseline: already paid before we looked.
        if (isFirst || fresh.length === 0) return

        const ctx = sharedCtx
        if (readPref() && ctx && ctx.state === 'running') ring(ctx)
        const n = fresh.length
        setAnnouncement(n === 1 ? `Order paid: ${fresh[0]}` : `${n} orders paid`)
        // Newest first; orders paid while the card is open join it.
        setArrived((prev) => [...fresh, ...prev])
        // Best effort for the badge and counts - see the note at the top.
        router.refresh()
      } catch {
        // Offline or a deploy restarting the server: try again next tick.
      }
    }

    void poll()
    const timer = setInterval(() => {
      if (!stopped) void poll()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [router, organisationId])

  const toggle = () => {
    const next = !soundOn
    writePref(next)
    if (next) {
      // The click is the gesture that unlocks audio; play it so they know the sound.
      const ctx = audio()
      if (ctx) void ctx.resume().then(() => ring(ctx))
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={soundOn}
        aria-label={soundOn ? 'New-order sound on' : 'New-order sound off'}
        title={soundOn ? 'New-order sound on — tap to mute' : 'New-order sound off — tap to turn on'}
        className="press relative hidden size-11 place-items-center rounded-brand border border-bar-line text-bar-ink transition-colors hover:bg-bar-line/60 active:press-active sm:grid"
      >
        <Icon name={soundOn ? 'sound' : 'sound-off'} size={18} />
      </button>
      <span role="status" className="sr-only">
        {announcement}
      </span>
      {/* Not a live region itself: the persistent span above announces, and a
          region inserted with its text is announced inconsistently. Portalled
          so no transformed ancestor in the header can trap `fixed`. */}
      {arrived.length > 0 &&
        createPortal(
          <div
            className="fixed inset-x-4 bottom-4 mx-auto max-w-sm rounded-brand border border-line bg-surface p-4 shadow-subtle sm:inset-x-auto sm:right-6 sm:bottom-6"
            style={{ zIndex: 'var(--z-popover)' }}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-accent-strong">
                <Icon name="bell" size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">
                  {arrived.length === 1 ? 'New order paid' : `${arrived.length} new orders paid`}
                </p>
                <p className="mt-0.5 truncate font-technical text-sm text-muted">
                  {arrived.slice(0, 3).join(', ')}
                  {arrived.length > 3 && ` and ${arrived.length - 3} more`}
                </p>
                <Link
                  href="/partner/orders"
                  onClick={() => setArrived([])}
                  className="mt-2 inline-block text-sm font-semibold text-accent-strong hover:underline"
                >
                  View orders
                </Link>
              </div>
              <button
                type="button"
                onClick={() => setArrived([])}
                aria-label="Dismiss new-order alert"
                className="press -m-2 grid size-11 place-items-center rounded-brand text-muted hover:text-ink"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
