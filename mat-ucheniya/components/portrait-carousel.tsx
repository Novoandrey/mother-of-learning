'use client'

import { useState } from 'react'
import { portraitUrl, type Portrait } from '@/lib/portraits'

/**
 * Portrait carousel for a character/npc/creature node (spec-030). Read-only
 * display; upload/reorder lands in a later phase. Renders nothing when the
 * node has no portraits (most nodes, until seeded) — portraits are decorative
 * and must never take vertical space they don't earn.
 */
export function PortraitCarousel({
  name,
  portraits,
}: {
  name: string
  portraits: Portrait[]
}) {
  const [idx, setIdx] = useState(0)
  if (portraits.length === 0) return null

  const clamped = Math.min(idx, portraits.length - 1)
  const cur = portraits[clamped]
  const multi = portraits.length > 1

  function go(delta: number) {
    setIdx((i) => {
      const n = portraits.length
      return (((i + delta) % n) + n) % n
    })
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="relative mx-auto max-w-sm">
        <PortraitImg key={cur.r2_key} keyStr={cur.r2_key} alt={name} />

        {multi && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Предыдущий портрет"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/45 px-2.5 py-1 text-lg leading-none text-white hover:bg-black/65 transition-colors"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Следующий портрет"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/45 px-2.5 py-1 text-lg leading-none text-white hover:bg-black/65 transition-colors"
            >
              ›
            </button>
            <div className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white">
              {clamped + 1}/{portraits.length}
            </div>
          </>
        )}
      </div>

      {cur.caption && (
        <p className="mt-2 text-center text-sm text-gray-500">{cur.caption}</p>
      )}

      {multi && (
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {portraits.map((p, i) => (
            <button
              key={p.r2_key}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`Портрет ${i + 1}${p.caption ? `: ${p.caption}` : ''}`}
              aria-current={i === clamped}
              className={`h-2 w-2 rounded-full transition-colors ${
                i === clamped ? 'bg-gray-700' : 'bg-gray-300 hover:bg-gray-400'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** <img> with a resized-thumbnail src that falls back to the full object if
 *  Cloudflare Image-Resizing isn't enabled on the zone. */
function PortraitImg({ keyStr, alt }: { keyStr: string; alt: string }) {
  const full = portraitUrl(keyStr) ?? undefined
  const [src, setSrc] = useState<string | undefined>(
    portraitUrl(keyStr, { width: 640 }) ?? undefined,
  )
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => {
        if (src !== full) setSrc(full)
      }}
      className="mx-auto w-full rounded-lg object-contain"
    />
  )
}
