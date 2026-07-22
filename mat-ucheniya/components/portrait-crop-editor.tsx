'use client'

/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from 'react'
import { portraitUrl, type Portrait } from '@/lib/portraits'

export type PortraitCrop = Pick<Portrait, 'crop_x' | 'crop_y' | 'crop_zoom'>

type Tone = 'light' | 'dark'

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/**
 * Calculates an absolutely positioned image that fills the circular frame.
 * Only one dimension is ever set; the other stays `auto`, so CSS must preserve
 * the source image's natural aspect ratio. `crop_x`/`crop_y` are the source
 * point placed in the centre of the frame; `crop_zoom` is the inverse width of
 * the visible source area.
 */
function layout(crop: PortraitCrop, aspect: number) {
  const zoom = clamp(crop.crop_zoom, 1, 4)
  const width = aspect >= 1 ? aspect * zoom : zoom
  const height = aspect >= 1 ? zoom : zoom / aspect
  const minX = 0.5 / width
  const minY = 0.5 / height
  const x = clamp(crop.crop_x, minX, 1 - minX)
  const y = clamp(crop.crop_y, minY, 1 - minY)
  return {
    width,
    height,
    x,
    y,
    style: aspect >= 1
      ? {
          width: 'auto',
          height: `${height * 100}%`,
          maxWidth: 'none',
          maxHeight: 'none',
          left: `${50 - x * width * 100}%`,
          top: `${50 - y * height * 100}%`,
        }
      : {
          width: `${width * 100}%`,
          height: 'auto',
          maxWidth: 'none',
          maxHeight: 'none',
          left: `${50 - x * width * 100}%`,
          top: `${50 - y * height * 100}%`,
        },
  }
}

export function portraitCropStyle(crop: PortraitCrop, aspect = 1) {
  return layout(crop, aspect).style
}

/**
 * A human-friendly crop control shared by the desktop catalog and Telegram.
 * Dragging the picture chooses the circular avatar area; the sole slider is
 * deliberately reserved for scale. This avoids the old three-coordinate
 * control and never distorts the source image.
 */
export function PortraitCropEditor({
  portrait,
  crop,
  onChange,
  tone = 'light',
  disabled = false,
}: {
  portrait: Portrait
  crop: PortraitCrop
  onChange: (crop: PortraitCrop) => void
  tone?: Tone
  disabled?: boolean
}) {
  const src = portraitUrl(portrait.r2_key)
  const [aspect, setAspect] = useState(1)
  const drag = useRef<{
    pointerId: number
    clientX: number
    clientY: number
    crop: PortraitCrop
    width: number
    height: number
  } | null>(null)
  const current = layout(crop, aspect)
  const light = tone === 'light'

  if (!src) return null

  const apply = (next: PortraitCrop) => {
    const nextLayout = layout(next, aspect)
    onChange({
      crop_x: nextLayout.x,
      crop_y: nextLayout.y,
      crop_zoom: clamp(next.crop_zoom, 1, 4),
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <div
          className={`relative h-48 w-48 shrink-0 overflow-hidden rounded-full ring-2 ${
            light ? 'bg-gray-100 ring-blue-500' : 'bg-neutral-800 ring-blue-400'
          } ${disabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
          style={{ touchAction: 'none' }}
          onPointerDown={(event) => {
            if (disabled) return
            const rect = event.currentTarget.getBoundingClientRect()
            drag.current = {
              pointerId: event.pointerId,
              clientX: event.clientX,
              clientY: event.clientY,
              crop,
              width: rect.width * current.width,
              height: rect.height * current.height,
            }
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            const start = drag.current
            if (!start || start.pointerId !== event.pointerId) return
            apply({
              crop_x: start.crop.crop_x - (event.clientX - start.clientX) / start.width,
              crop_y: start.crop.crop_y - (event.clientY - start.clientY) / start.height,
              crop_zoom: start.crop.crop_zoom,
            })
          }}
          onPointerUp={(event) => {
            if (drag.current?.pointerId === event.pointerId) drag.current = null
          }}
          onPointerCancel={() => {
            drag.current = null
          }}
        >
          <img
            src={src}
            alt=""
            draggable={false}
            onLoad={(event) => {
              const image = event.currentTarget
              if (image.naturalWidth && image.naturalHeight) {
                setAspect(image.naturalWidth / image.naturalHeight)
              }
            }}
            className="pointer-events-none absolute select-none"
            style={current.style}
          />
          <span
            aria-hidden
            className={`pointer-events-none absolute inset-0 rounded-full border-2 ${
              light ? 'border-white/80' : 'border-neutral-100/80'
            }`}
          />
        </div>

        <div className="min-w-56 flex-1 space-y-3">
          <div>
            <p className={`text-sm font-medium ${light ? 'text-gray-800' : 'text-neutral-100'}`}>
              Круглый аватар
            </p>
            <p className={`mt-0.5 text-xs ${light ? 'text-gray-500' : 'text-neutral-500'}`}>
              Потяните изображение внутри круга, чтобы выбрать область лица.
            </p>
          </div>
          <label className={`flex items-center gap-3 text-sm ${light ? 'text-gray-700' : 'text-neutral-300'}`}>
            <span className="w-20 shrink-0">Масштаб</span>
            <input
              type="range"
              min="1"
              max="4"
              step="0.01"
              value={crop.crop_zoom}
              disabled={disabled}
              onChange={(event) => apply({ ...crop, crop_zoom: Number(event.target.value) })}
              className="flex-1 accent-blue-600"
            />
            <span className={`w-9 text-right text-xs tabular-nums ${light ? 'text-gray-500' : 'text-neutral-500'}`}>
              ×{crop.crop_zoom.toFixed(1)}
            </span>
          </label>
          <button
            type="button"
            disabled={disabled}
            onClick={() => apply({ crop_x: 0.5, crop_y: 0.5, crop_zoom: 1 })}
            className={`text-sm underline underline-offset-2 transition-colors disabled:opacity-50 ${
              light ? 'text-blue-700 hover:text-blue-800' : 'text-blue-400 hover:text-blue-300'
            }`}
          >
            Центрировать и сбросить масштаб
          </button>
        </div>
      </div>
    </div>
  )
}
