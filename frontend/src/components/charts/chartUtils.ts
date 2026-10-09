import { useCallback, useState } from 'react'

/** Tracks an element's rendered width so SVG charts can lay out to their container. */
export function useElementWidth<T extends HTMLElement>(): [(node: T | null) => (() => void) | undefined, number] {
  const [width, setWidth] = useState(0)
  const ref = useCallback((node: T | null) => {
    if (!node) return undefined
    setWidth(Math.floor(node.getBoundingClientRect().width))
    const observer = new ResizeObserver((entries) => setWidth(Math.floor(entries[0].contentRect.width)))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

/** Rounds the axis maximum up to a clean value (1, 2, 2.5 or 5 x 10^n per step). */
export function niceScale(max: number, intervals = 4): { max: number; ticks: number[] } {
  if (!(max > 0)) return { max: 1, ticks: [0] }
  const rough = max / intervals
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const residual = rough / magnitude
  const step = (residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 2.5 ? 2.5 : residual <= 5 ? 5 : 10) * magnitude
  const niceMax = Math.ceil(max / step - 1e-9) * step
  const ticks: number[] = []
  for (let value = 0; value <= niceMax + step / 2; value += step) ticks.push(Number(value.toFixed(6)))
  return { max: niceMax, ticks }
}

/** A column with a 4px rounded data-end and a square foot on the baseline. */
export function columnPath(x: number, y: number, width: number, height: number, radius = 4): string {
  const r = Math.max(0, Math.min(radius, width / 2, height))
  return [
    `M${x},${y + height}`,
    `V${y + r}`,
    `A${r},${r} 0 0 1 ${x + r},${y}`,
    `H${x + width - r}`,
    `A${r},${r} 0 0 1 ${x + width},${y + r}`,
    `V${y + height}`,
    'Z',
  ].join('')
}
