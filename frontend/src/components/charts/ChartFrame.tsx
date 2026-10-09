import { useState, type ReactNode } from 'react'

export interface LegendEntry {
  label: string
  color: string
}

/** Title, legend and the table-view toggle that every chart carries. */
export function ChartFrame({ title, description, legend, table, children, level = 2, refetching }: {
  title: string
  description?: ReactNode
  legend?: LegendEntry[]
  table?: ReactNode
  children: ReactNode
  level?: 2 | 3
  refetching?: boolean
}) {
  const [showTable, setShowTable] = useState(false)
  const Heading = level === 2 ? 'h2' : 'h3'
  return (
    <figure className={`chart ${refetching ? 'is-refetching' : ''}`}>
      <div className="chart-head">
        <div>
          <Heading>{title}</Heading>
          {description && <p>{description}</p>}
        </div>
        <div className="chart-tools">
          {legend && legend.length > 1 && (
            <ul className="legend" aria-label="Legend">
              {legend.map((entry) => (
                <li key={entry.label} className="legend-item">
                  <span className="legend-swatch" style={{ background: entry.color }} />
                  {entry.label}
                </li>
              ))}
            </ul>
          )}
          {table && (
            <button type="button" className="btn btn-text" aria-pressed={showTable}
              onClick={() => setShowTable((value) => !value)}>
              {showTable ? 'Show chart' : 'Show table'}
            </button>
          )}
        </div>
      </div>
      {showTable ? <div className="chart-table">{table}</div> : children}
    </figure>
  )
}
