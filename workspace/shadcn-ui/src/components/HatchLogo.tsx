import { cn } from '@/lib/utils'
import hatchLogo from '@/assets/brand/hatch-logo.png'

type HatchLogoProps = {
  className?: string
  wordmark?: boolean
  alt?: string
}

const fallbackSvg =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22 fill=%22none%22%3E%3Cdefs%3E%3ClinearGradient id=%22hatch-grad%22 x1=%2214%22 y1=%226%22 x2=%2252%22 y2=%2258%22 gradientUnits=%22userSpaceOnUse%22%3E%3Cstop stop-color=%22%232563EB%22/%3E%3Cstop offset=%221%22 stop-color=%22%2322D3EE%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect x=%224%22 y=%224%22 width=%2256%22 height=%2256%22 rx=%2214%22 fill=%22url(%23hatch-grad)%22/%3E%3Cpath d=%22M22 19h8.5c5.4 0 9.5 3.5 9.5 9 0 5.7-4.2 9.2-9.7 9.2H26v7.8h-4V19Zm4 4v10.3h4.2c3.4 0 5.5-1.9 5.5-5.2 0-3.3-2.1-5.1-5.5-5.1H26Z%22 fill=%22white%22/%3E%3C/svg%3E'

const publicLogoSrc = encodeURI('/hatch logo.png')

export function HatchLogo({ className, wordmark = true, alt = 'Hatch logo' }: HatchLogoProps) {
  // Prefer the asset dropped in /public, then fall back to the bundled asset, then to an inline SVG.
  const sources = [publicLogoSrc, hatchLogo, fallbackSvg]

  return (
    <img
      src={sources[0]}
      alt={alt}
      className={cn('pointer-events-none select-none object-contain w-auto', className)}
      draggable={false}
      data-fallback-index="1"
      onError={(e) => {
        const target = e.currentTarget
        const index = Number(target.dataset.fallbackIndex ?? '1')
        const next = sources[index]
        if (next) {
          target.dataset.fallbackIndex = String(index + 1)
          target.src = next
          return
        }
        target.src = fallbackSvg
      }}
    />
  )
}

export default HatchLogo
