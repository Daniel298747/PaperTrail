import { useState, type KeyboardEvent, type ReactNode } from 'react'

import { columnPath, niceScale, useElementWidth } from './chartUtils'

export interface ColumnSeries {
  key: string
  label: string
  /** CSS colour (a token such as var(--series-1)) */
  color: string
  values: number[]
  /** Exact, preformatted values for the tooltip and the screen-reader readout */
  display: string[]
}

interface ColumnChartProps {
  categories: string[]
  /** Full category name for the tooltip ("March 2026") */
  categoryLabel: (category: string) => string
  /** Axis label: first line plus an optional second line (e.g. the year) */
  tickLabel: (category: string, index: number) => [string, string?]
  series: ColumnSeries[]
  formatTick: (value: number) => string
  ariaLabel: string
  height?: number
  compact?: boolean
}

/**
 * Columns grouped by category. Hover or arrow keys move a highlight band; the tooltip lists every
 * series at that position (values first, labels second, line keys). Values are also available in the
 * table view the caller provides, so the tooltip never gates anything.
 */
export function ColumnChart({
  categories,
  categoryLabel,
  tickLabel,
  series,
  formatTick,
  ariaLabel,
  height = 240,
  compact = false,
}: ColumnChartProps) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)

  const margin = compact ? { top: 6, right: 0, bottom: 22, left: 0 } : { top: 12, right: 4, bottom: 36, left: 54 }
  const plotWidth = Math.max(0, width - margin.left - margin.right)
  const plotHeight = height - margin.top - margin.bottom
  const scale = niceScale(Math.max(0, ...series.flatMap((s) => s.values)))
  const y = (value: number) => plotHeight - (value / scale.max) * plotHeight

  const count = categories.length
  const band = count ? plotWidth / count : 0
  const gap = 2
  const barWidth = Math.max(2, Math.min(compact ? 12 : 24, (band * 0.72 - gap * (series.length - 1)) / series.length))
  const groupWidth = barWidth * series.length + gap * (series.length - 1)
  const labelEvery = Math.max(1, Math.ceil(38 / Math.max(band, 1)))

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!count) return
    const moves: Record<string, () => number | null> = {
      ArrowRight: () => (active === null ? 0 : Math.min(count - 1, active + 1)),
      ArrowLeft: () => (active === null ? count - 1 : Math.max(0, active - 1)),
      Home: () => 0,
      End: () => count - 1,
      Escape: () => null,
    }
    const move = moves[event.key]
    if (move) {
      event.preventDefault()
      setActive(move())
    }
  }

  const describe = (index: number) =>
    `${categoryLabel(categories[index])}: ${series.map((s) => `${s.label} ${s.display[index]}`).join(', ')}`

  let tooltip: ReactNode = null
  if (active !== null && width > 0) {
    const center = margin.left + (active + 0.5) * band
    const flip = center > width * 0.6
    tooltip = (
      <div
        className="chart-tooltip"
        style={{
          left: center,
          top: margin.top,
          transform: flip ? 'translateX(calc(-100% - 14px))' : 'translateX(14px)',
        }}
      >
        <div className="tt-title">{categoryLabel(categories[active])}</div>
        {series.map((s) => (
          <div className="tt-row" key={s.key}>
            <span className="tt-key" style={{ background: s.color }} />
            <span className="tt-value">{s.display[active]}</span>
            <span className="tt-label">{s.label}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="chart-plot"
      tabIndex={0}
      role="group"
      aria-label={`${ariaLabel}. Use the left and right arrow keys to read each value.`}
      onKeyDown={onKeyDown}
      onPointerLeave={() => setActive(null)}
      onBlur={() => setActive(null)}
    >
      {width > 0 && (
        <svg width={width} height={height} aria-hidden="true">
          <g transform={`translate(${margin.left},${margin.top})`}>
            {scale.ticks.map((tick) => (
              <g key={tick}>
                {(!compact || tick === 0) && (
                  <line
                    x1={0}
                    x2={plotWidth}
                    y1={Math.round(y(tick)) + 0.5}
                    y2={Math.round(y(tick)) + 0.5}
                    style={{ stroke: tick === 0 ? 'var(--chart-axis)' : 'var(--chart-grid)' }}
                    strokeWidth={1}
                  />
                )}
                {!compact && (
                  <text x={-10} y={y(tick)} dy="0.32em" textAnchor="end" className="tick-label">
                    {formatTick(tick)}
                  </text>
                )}
              </g>
            ))}

            {active !== null && (
              <rect x={active * band} y={0} width={band} height={plotHeight} style={{ fill: 'var(--chart-hover)' }} />
            )}

            {categories.map((category, index) => {
              const start = index * band + (band - groupWidth) / 2
              return (
                <g key={category}>
                  {series.map((s, seriesIndex) => {
                    const value = s.values[index]
                    if (!(value > 0)) return null
                    const top = y(value)
                    return (
                      <path
                        key={s.key}
                        d={columnPath(start + seriesIndex * (barWidth + gap), top, barWidth, plotHeight - top)}
                        style={{ fill: s.color }}
                      />
                    )
                  })}
                </g>
              )
            })}

            {categories.map((category, index) => {
              const show = compact ? index === 0 || index === count - 1 : index % labelEvery === 0
              if (!show) return null
              const [first, second] = tickLabel(category, index)
              const anchor = compact ? (index === 0 ? 'start' : 'end') : 'middle'
              const x = compact ? (index === 0 ? index * band : (index + 1) * band) : (index + 0.5) * band
              return (
                <text key={category} x={x} y={plotHeight + 15} textAnchor={anchor} className="tick-label">
                  {first}
                  {second && !compact && (
                    <tspan x={x} dy="1.25em" className="tick-label strong">{second}</tspan>
                  )}
                </text>
              )
            })}

            {categories.map((category, index) => (
              <rect
                key={category}
                x={index * band}
                y={0}
                width={band}
                height={plotHeight + margin.bottom}
                fill="transparent"
                onPointerEnter={() => setActive(index)}
                onPointerMove={() => setActive(index)}
              />
            ))}
          </g>
        </svg>
      )}
      {tooltip}
      <p className="sr-only" aria-live="polite">{active !== null ? describe(active) : ''}</p>
    </div>
  )
}
