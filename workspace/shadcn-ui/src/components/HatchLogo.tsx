import { cn } from '@/lib/utils'
import hatchLogo from '@/assets/brand/hatch-logo.png'

type HatchLogoProps = {
  className?: string
  /**
   * If we ever add an icon-only treatment, this flag can switch assets.
   * For now the full wordmark is the default.
   */
  wordmark?: boolean
  alt?: string
}

export function HatchLogo({ className, wordmark = true, alt = 'Hatch logo' }: HatchLogoProps) {
  const logoSrc = hatchLogo

  return (
    <img
      src={logoSrc}
      alt={alt}
      className={cn('pointer-events-none select-none object-contain w-auto', className)}
      draggable={false}
    />
  )
}

export default HatchLogo
