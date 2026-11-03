import { cn } from '@/lib/utils'
import logo from '../assets/kap/logo.webp'

/** The app logo: Kap's head sticker, cut from the user's own artwork by scripts/kap.py (never redrawn). */
export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <img
      src={logo}
      alt=""
      aria-hidden="true"
      draggable={false}
      width={size}
      height={size}
      className={cn('brand-mark shrink-0 object-contain select-none', className)}
      style={{ width: size, height: size }}
    />
  )
}

/** Logo plus the wordmark in the brand green; logos are exempt from text contrast rules. */
export function Wordmark({ textClassName, size = 40 }: { textClassName?: string; size?: number }) {
  return (
    <span className="group/brand flex items-center gap-2">
      <BrandMark size={size} />
      <span
        className={cn(
          'text-[26px] leading-none font-black tracking-[-0.035em] text-primary dark:text-primary',
          textClassName,
        )}
      >
        BarangAI
      </span>
    </span>
  )
}
