interface Props {
  path: string
  size?: number
  filled?: boolean
}

/** Decorative 24×24 icon; always hidden from assistive tech (text labels carry meaning). */
export function Icon({ path, size = 24, filled = false }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d={path} />
    </svg>
  )
}
