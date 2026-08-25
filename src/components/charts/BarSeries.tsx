import { formatMoneyCompact } from '@/lib/money'

/**
 * A minimal trend chart, drawn as plain HTML rather than an SVG chart library:
 * no dependency, no client JavaScript, and the underlying figures stay
 * readable to a screen reader through the table markup.
 */
export function BarSeries({
  data,
  valueKey,
  labelKey = 'day',
  money = true,
  caption,
  emptyLabel = 'No activity in this period',
}: {
  data: Record<string, string | number>[]
  valueKey: string
  labelKey?: string
  money?: boolean
  caption: string
  /** Shown when the window has no activity. Name the metric, not the absence. */
  emptyLabel?: string
}) {
  const values = data.map((d) => Number(d[valueKey]) || 0)
  const max = Math.max(...values, 1)

  /*
   * Two different things arrive here looking the same, and both need saying
   * out loud rather than drawn.
   *
   * A window with no rows at all, and a window whose every value is zero, both
   * used to render as a 128px band of white with a 2px hairline of bars along
   * the bottom — the `Math.max(2, …)` floor below guarantees the stub even at
   * zero. That is accurate and completely unreadable: it looks like a panel
   * that failed to load, which is exactly the wrong impression for a dashboard
   * to give about a quiet fortnight.
   */
  const isEmpty = values.length === 0 || values.every((v) => v === 0)

  if (isEmpty) {
    return (
      <figure>
        <figcaption className="sr-only">{caption}</figcaption>
        {/* Same h-32 as the populated chart, so a card does not change height
            when the first sale lands. The baseline is drawn because a visible
            zero axis is what distinguishes "flat" from "missing" — without it
            the reader has no evidence the chart rendered at all. */}
        <div
          className="relative flex h-32 items-end"
          role="img"
          aria-label={`${caption} — no activity in this period`}
        >
          <span className="absolute inset-x-0 bottom-0 h-px bg-line" aria-hidden="true" />
          <p className="absolute inset-0 grid place-items-center text-sm text-muted">
            {emptyLabel}
          </p>
        </div>
        {/* The date range is kept. Which window was checked is the useful half
            of the answer — "nothing in the last 14 days" is information, and
            "nothing" on its own is not. */}
        {data.length > 0 && (
          <div className="mt-1.5 flex justify-between font-technical text-[10px] text-muted">
            <span>{data[0]?.[labelKey]}</span>
            <span>{data[data.length - 1]?.[labelKey]}</span>
          </div>
        )}
      </figure>
    )
  }

  return (
    <figure>
      <figcaption className="sr-only">{caption}</figcaption>
      {/* items-stretch, not items-end.
          
          The bars size themselves with a percentage height, and a percentage
          resolves against the parent's height — so the column has to have one.
          Under items-end the columns were not stretched to the track: they
          shrink-wrapped to their content, which is only the percentage-height
          span, so the column measured 0px and every bar resolved to 0% of 0.
          The chart rendered its axis, its caption and its values while drawing
          nothing at all, on both the admin and partner dashboards.

          The bars stay bottom-aligned because each column is flex-col with
          justify-end; that was always doing the alignment work, and items-end
          on the track was only stopping the columns from having a height. */}
      <div className="flex h-32 items-stretch gap-1" role="img" aria-label={caption}>
        {data.map((row, index) => {
          const value = Number(row[valueKey]) || 0
          const height = Math.max(2, (value / max) * 100)
          return (
            <div key={index} className="group relative flex flex-1 flex-col justify-end">
              <span
                className="rounded-t bg-accent-500/80 transition-colors group-hover:bg-accent-500"
                style={{ height: `${height}%` }}
              />
              <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-surface-deep px-1.5 py-0.5 text-[10px] text-white group-hover:block">
                {money ? formatMoneyCompact(value) : value}
              </span>
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex justify-between font-technical text-[10px] text-muted">
        <span>{data[0]?.[labelKey]}</span>
        <span>{data[data.length - 1]?.[labelKey]}</span>
      </div>
    </figure>
  )
}
