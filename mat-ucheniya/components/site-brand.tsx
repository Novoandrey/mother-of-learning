import Image from 'next/image'

/**
 * Site brand block for top bars: ouroboros logo + app name + epigraph.
 *
 * Used in the campaign top bar and the /docs top bar so the brand
 * stays consistent across the app. The campaign-specific name (and
 * `+ Создать` button etc.) live next to this block, not inside it.
 *
 * The epigraph is intentionally absurd — it's an inside joke, not a
 * real product tagline. Displayed in italics with the attribution on
 * the next line.
 */
export function SiteBrand() {
  return (
    <div className="flex items-center gap-3">
      <Image
        src="/logo.png"
        alt="Уроборос"
        width={36}
        height={36}
        className="rounded flex-shrink-0"
        priority
      />
      <div className="flex flex-col leading-tight">
        <span className="font-semibold text-sm text-gray-900">Мать Учения</span>
        <span className="text-[11px] italic text-gray-500">
          «Мы делаем реально крутые вещи» — Зак Новеда
        </span>
      </div>
    </div>
  )
}
