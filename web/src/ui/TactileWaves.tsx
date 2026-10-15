import { useEffect, useRef } from 'preact/hooks'

interface Props {
  className?: string
}

/**
 * Animated SVG tactile wave background faithfully ported from the reference design.
 * Features 5 undulating wave layers with staggered cycle durations and smooth spline easing.
 */
export function TactileWaves({ className = '' }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotion = () => {
      try {
        if (mediaQuery.matches) {
          svg.pauseAnimations?.()
        } else {
          svg.unpauseAnimations?.()
        }
      } catch {
        // Fallback for environments lacking pauseAnimations API
      }
    }

    updateMotion()
    mediaQuery.addEventListener('change', updateMotion)
    return () => mediaQuery.removeEventListener('change', updateMotion)
  }, [])

  return (
    <div class={`tactile-wave-bg ${className}`} aria-hidden="true">
      <svg
        ref={svgRef}
        class="tactile-wave-svg"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Layer 2: Muted Tan (5.2s cycle) */}
        <path
          fill="var(--wave-layer-2, #DCB587)"
          d="M 0,600 C 200,590 260,320 400,320 C 520,320 540,435 630,415 C 730,395 760,165 920,105 L 1000,70 L 1000,1000 L 0,1000 Z"
        >
          <animate
            attributeName="d"
            dur="5.2s"
            repeatCount="indefinite"
            calcMode="spline"
            keyTimes="0; 0.5; 1"
            keySplines="0.45 0.05 0.55 0.95; 0.45 0.05 0.55 0.95"
            values="
              M 0,600 C 200,590 260,320 400,320 C 520,320 540,435 630,415 C 730,395 760,165 920,105 L 1000,70 L 1000,1000 L 0,1000 Z;
              M 0,565 C 215,555 245,355 390,355 C 510,355 555,395 645,375 C 745,355 775,195 925,135 L 1000,100 L 1000,1000 L 0,1000 Z;
              M 0,600 C 200,590 260,320 400,320 C 520,320 540,435 630,415 C 730,395 760,165 920,105 L 1000,70 L 1000,1000 L 0,1000 Z"
          />
        </path>

        {/* Layer 3: Soft Peach (3.8s cycle) */}
        <path
          fill="var(--wave-layer-3, #F6B483)"
          d="M 0,700 C 210,680 270,390 405,390 C 525,390 550,515 640,505 C 740,495 790,310 1000,240 L 1000,1000 L 0,1000 Z"
        >
          <animate
            attributeName="d"
            dur="3.8s"
            repeatCount="indefinite"
            calcMode="spline"
            keyTimes="0; 0.5; 1"
            keySplines="0.45 0.05 0.55 0.95; 0.45 0.05 0.55 0.95"
            values="
              M 0,700 C 210,680 270,390 405,390 C 525,390 550,515 640,505 C 740,495 790,310 1000,240 L 1000,1000 L 0,1000 Z;
              M 0,730 C 195,710 285,360 415,360 C 535,360 535,545 625,535 C 725,525 775,275 1000,210 L 1000,1000 L 0,1000 Z;
              M 0,700 C 210,680 270,390 405,390 C 525,390 550,515 640,505 C 740,495 790,310 1000,240 L 1000,1000 L 0,1000 Z"
          />
        </path>

        {/* Layer 4: Light Cream Ribbon (5.8s cycle) */}
        <path
          fill="var(--wave-layer-4, #EDE0C4)"
          d="M 0,805 C 220,785 280,460 410,460 C 530,460 560,610 650,600 C 750,590 810,420 1000,375 L 1000,1000 L 0,1000 Z"
        >
          <animate
            attributeName="d"
            dur="5.8s"
            repeatCount="indefinite"
            calcMode="spline"
            keyTimes="0; 0.5; 1"
            keySplines="0.45 0.05 0.55 0.95; 0.45 0.05 0.55 0.95"
            values="
              M 0,805 C 220,785 280,460 410,460 C 530,460 560,610 650,600 C 750,590 810,420 1000,375 L 1000,1000 L 0,1000 Z;
              M 0,775 C 235,755 265,495 395,495 C 515,495 575,575 665,565 C 765,555 825,450 1000,405 L 1000,1000 L 0,1000 Z;
              M 0,805 C 220,785 280,460 410,460 C 530,460 560,610 650,600 C 750,590 810,420 1000,375 L 1000,1000 L 0,1000 Z"
          />
        </path>

        {/* Layer 5: Warm Terracotta (4.4s cycle) */}
        <path
          fill="var(--wave-layer-5, #C97856)"
          d="M 0,895 C 230,875 290,555 415,555 C 535,555 560,725 650,715 C 750,705 830,515 1000,475 L 1000,1000 L 0,1000 Z"
        >
          <animate
            attributeName="d"
            dur="4.4s"
            repeatCount="indefinite"
            calcMode="spline"
            keyTimes="0; 0.5; 1"
            keySplines="0.45 0.05 0.55 0.95; 0.45 0.05 0.55 0.95"
            values="
              M 0,895 C 230,875 290,555 415,555 C 535,555 560,725 650,715 C 750,705 830,515 1000,475 L 1000,1000 L 0,1000 Z;
              M 0,920 C 215,900 305,525 425,525 C 545,525 545,755 635,745 C 735,735 815,485 1000,445 L 1000,1000 L 0,1000 Z;
              M 0,895 C 230,875 290,555 415,555 C 535,555 560,725 650,715 C 750,705 830,515 1000,475 L 1000,1000 L 0,1000 Z"
          />
        </path>

        {/* Layer 6: Deep Terracotta Base (6.4s cycle) */}
        <path
          fill="var(--wave-layer-6, #B1593B)"
          d="M 0,965 C 240,945 300,665 420,665 C 540,665 565,825 655,815 C 755,805 840,625 1000,585 L 1000,1000 L 0,1000 Z"
        >
          <animate
            attributeName="d"
            dur="6.4s"
            repeatCount="indefinite"
            calcMode="spline"
            keyTimes="0; 0.5; 1"
            keySplines="0.45 0.05 0.55 0.95; 0.45 0.05 0.55 0.95"
            values="
              M 0,965 C 240,945 300,665 420,665 C 540,665 565,825 655,815 C 755,805 840,625 1000,585 L 1000,1000 L 0,1000 Z;
              M 0,940 C 255,920 285,695 405,695 C 525,695 580,795 670,785 C 770,775 855,655 1000,615 L 1000,1000 L 0,1000 Z;
              M 0,965 C 240,945 300,665 420,665 C 540,665 565,825 655,815 C 755,805 840,625 1000,585 L 1000,1000 L 0,1000 Z"
          />
        </path>
      </svg>
    </div>
  )
}
