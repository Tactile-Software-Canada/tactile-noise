interface Props {
  size?: number
}

/** Vector squircle brand mark matching the Tactile Noise icon kit. */
export function BrandIcon({ size = 26 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      aria-hidden="true"
      focusable="false"
      class="brand-icon"
    >
      <defs>
        <clipPath id="brand-squircle">
          <rect width="512" height="512" rx="115" ry="115" />
        </clipPath>
      </defs>
      <g clip-path="url(#brand-squircle)">
        <rect width="512" height="512" fill="#EAD0AC" />
        <path
          d="M 0,310 C 85,305 120,165 200,165 C 260,165 270,225 315,215 C 365,205 380,85 460,55 L 512,35 L 512,512 L 0,512 Z"
          fill="#DCB587"
        />
        <path
          d="M 0,360 C 90,350 130,200 200,200 C 260,200 275,265 320,260 C 370,255 395,160 512,125 L 512,512 L 0,512 Z"
          fill="#F6B483"
        />
        <path
          d="M 0,415 C 95,405 140,235 205,235 C 260,235 280,315 325,310 C 375,305 405,215 512,195 L 512,512 L 0,512 Z"
          fill="#EDE0C4"
        />
        <path
          d="M 0,460 C 100,450 145,285 205,285 C 260,285 280,375 325,370 C 375,365 415,265 512,245 L 512,512 L 0,512 Z"
          fill="#C97856"
        />
        <path
          d="M 0,495 C 105,485 150,340 205,340 C 260,340 280,425 325,420 C 375,415 420,320 512,300 L 512,512 L 0,512 Z"
          fill="#B1593B"
        />
      </g>
    </svg>
  )
}
