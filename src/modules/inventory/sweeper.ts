import { expireStaleReservations } from '@/modules/inventory/service'

/**
 * Releases expired stock reservations on a timer, so a checkout abandoned at
 * the payment step gives its stock back within about a minute of its window
 * closing. Before this the sweep only ran when someone opened an order page
 * or an admin pressed "Run maintenance", so a hold could sit on stock for as
 * long as nobody happened to do either.
 *
 * In-process rather than cron: production is one app container (see
 * deploy/docker-compose.yml), so there is exactly one timer. If the app is
 * ever scaled out, every replica runs its own; that is safe because a release
 * claims each hold before restoring stock (see releaseReservations), but it is
 * wasted work and the job belongs in a single scheduler at that point.
 *
 * RESERVATION_SWEEP_SECONDS sets the interval (default 60); 0 turns it off.
 */
const INTERVAL_SECONDS = Number(process.env.RESERVATION_SWEEP_SECONDS ?? 60)

// Survive Next.js dev hot reloads, which re-run register() and would otherwise
// stack a new timer on top of the old one each time.
const globalForSweeper = globalThis as unknown as { __afrimeshSweeper?: NodeJS.Timeout }

export function startReservationSweeper(): void {
  if (globalForSweeper.__afrimeshSweeper) return
  if (!Number.isFinite(INTERVAL_SECONDS) || INTERVAL_SECONDS <= 0) return

  let running = false
  const tick = async () => {
    // A slow pass (a large backlog after downtime) must not overlap the next.
    if (running) return
    running = true
    try {
      const released = await expireStaleReservations()
      if (released > 0) console.log(`[sweeper] released ${released} expired reservation(s)`)
    } catch (err) {
      // Next tick retries; a transient database error must not kill the timer.
      console.error('[sweeper] expired reservation sweep failed', err)
    } finally {
      running = false
    }
  }

  const timer = setInterval(tick, INTERVAL_SECONDS * 1000)
  // Never hold the process open on shutdown just for the sweep.
  timer.unref()
  globalForSweeper.__afrimeshSweeper = timer
  // Catch up on anything that expired while the server was down.
  void tick()
}
