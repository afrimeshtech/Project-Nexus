/**
 * Next.js calls register() once when the server starts. Background jobs that
 * must run whether or not anyone is browsing start here.
 */
export async function register() {
  // The sweeper needs the database driver, which only exists in the Node.js
  // runtime; register() also runs for the edge runtime that middleware uses.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { startReservationSweeper } = await import('@/modules/inventory/sweeper')
  startReservationSweeper()
}
