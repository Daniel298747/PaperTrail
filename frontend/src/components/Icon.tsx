// Small line icons drawn for PaperTrail (1.5px strokes on a 16px grid). Always decorative: the
// adjacent text carries the meaning, so every icon is aria-hidden.
const PATHS: Record<string, string> = {
  check: 'M3.5 8.5l3 3 6-7',
  alert: 'M8 4.5v4.5M8 11.4v.1',
  circle: '',
  clock: 'M8 4.8V8l2.2 1.6',
  upload: 'M8 10.5V3M5 6l3-3 3 3M3 10.5v2.5h10v-2.5',
  download: 'M8 3v7.5M5 7.5l3 3 3-3M3 10.5v2.5h10v-2.5',
  file: 'M4 2.5h5l3 3v8H4zM9 2.5v3h3',
  eye: 'M1.8 8s2.3-4.2 6.2-4.2S14.2 8 14.2 8s-2.3 4.2-6.2 4.2S1.8 8 1.8 8z',
  bell: 'M4 11V7.2a4 4 0 018 0V11l1 1.2H3zM6.6 13.6a1.6 1.6 0 002.8 0',
  menu: 'M2.5 4.5h11M2.5 8h11M2.5 11.5h11',
  close: 'M4 4l8 8M12 4l-8 8',
  plus: 'M8 3v10M3 8h10',
  arrow: 'M3 8h10M9 4l4 4-4 4',
  back: 'M13 8H3M7 4L3 8l4 4',
  chevronUp: 'M4.5 10l3.5-3.5L11.5 10',
  chevronDown: 'M4.5 6l3.5 3.5L11.5 6',
  repeat: 'M3 7V6a2 2 0 012-2h7M10 2l2 2-2 2M13 9v1a2 2 0 01-2 2H4M6 14l-2-2 2-2',
  pause: 'M6 4v8M10 4v8',
  play: 'M5.5 3.8v8.4L12 8z',
  trash: 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5',
}

interface IconProps {
  name: keyof typeof PATHS
  size?: number
  className?: string
}

export function Icon({ name, size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {name === 'circle' && <circle cx="8" cy="8" r="4.5" />}
      {name === 'alert' && <circle cx="8" cy="8" r="6" />}
      {name === 'clock' && <circle cx="8" cy="8" r="5.5" />}
      {name === 'eye' && <circle cx="8" cy="8" r="1.8" />}
      {PATHS[name] && <path d={PATHS[name]} />}
    </svg>
  )
}
