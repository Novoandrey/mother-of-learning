'use client'

/* eslint-disable @next/next/no-img-element */

/**
 * Shared /tg UI primitives (spec-058 W1). Moved verbatim from ledger-app.tsx so
 * the new shell + tab modules (action-hub / character-tab / party-tab) and the
 * legacy screens draw from one place. Everything here is presentation-only:
 * no data fetching, no server actions — those live in the screens.
 */

import { useState } from 'react'
import type { TgWallet, TgFeedRow } from '@/lib/queries/ledger-tg'
import {
  formatDenoms,
  formatGp,
  formatSignedGp,
  dayLabel,
  initialOf,
  portraitUrl,
} from './format'

// Time helpers shared by expedition forms (defined in lib, re-exported here so
// form modules can import all field helpers from one place).
export { hhmmToMinute, minuteToHHMM } from '@/lib/expedition-calendar'

// ─────────────────────────── layout ───────────────────────────

export function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 text-center text-sm text-neutral-400">
      {children}
    </div>
  )
}

// ─────────────────────────── portraits ───────────────────────────

/**
 * Portrait <img> with a resized thumbnail + graceful fallback (feedback #2):
 * loads a small Cloudflare-resized WebP; if the zone has no Transformations,
 * onError swaps to the un-resized original. Lazy by default so off-screen
 * avatars in the list don't all download at once; `eager` for the hero.
 */
export function SmartImg({
  keyStr,
  width,
  alt,
  className,
  style,
  eager,
}: {
  keyStr: string
  width: number
  alt: string
  className?: string
  style?: React.CSSProperties
  eager?: boolean
}) {
  const original = portraitUrl(keyStr) ?? undefined
  const [src, setSrc] = useState<string | undefined>(portraitUrl(keyStr, { width }) ?? undefined)
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => {
        if (src !== original) setSrc(original)
      }}
    />
  )
}

export function Portrait({ name, keyStr }: { name: string; keyStr: string | null }) {
  if (keyStr && portraitUrl(keyStr)) {
    return (
      <SmartImg
        keyStr={keyStr}
        width={768}
        alt={name}
        className="max-h-full max-w-full object-contain"
        eager
      />
    )
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-neutral-700 text-6xl font-semibold text-neutral-200">
      {initialOf(name)}
    </div>
  )
}

export function Avatar({ name, keyStr, size }: { name: string; keyStr: string | null; size: number }) {
  const style = { width: size, height: size }
  if (keyStr && portraitUrl(keyStr)) {
    return (
      <SmartImg
        keyStr={keyStr}
        width={96}
        alt={name}
        style={style}
        className="shrink-0 rounded-full object-cover"
      />
    )
  }
  return (
    <div
      style={style}
      className="flex shrink-0 items-center justify-center rounded-full bg-neutral-700 font-semibold text-neutral-200"
    >
      {initialOf(name)}
    </div>
  )
}

// ─────────────────────────── navigation chrome ───────────────────────────

export function BackLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="mb-4 text-sm text-neutral-400 transition-colors hover:text-neutral-200"
    >
      ← {children}
    </button>
  )
}

export function AppButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: string
  label: string
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        'flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-2.5 text-center transition-colors ' +
        (disabled
          ? 'cursor-default bg-neutral-900/50 text-neutral-600'
          : 'bg-neutral-900 text-neutral-100 hover:bg-neutral-800')
      }
    >
      <span className="text-xl leading-none">{icon}</span>
      {label && <span className="text-[11px]">{label}</span>}
    </button>
  )
}

// ─────────────────────────── wallet card ───────────────────────────

export function WalletCard({ wallet, label }: { wallet: TgWallet; label?: string }) {
  return (
    <div className="rounded-2xl bg-neutral-900 p-4 shadow-sm">
      {label && <div className="mb-1 text-xs text-neutral-500">{label}</div>}
      <div className="font-mono text-4xl font-semibold tabular-nums">
        {formatGp(wallet.aggregateGp)}
      </div>
      <div className="mt-1 font-mono text-sm tabular-nums text-neutral-400">
        {formatDenoms(wallet.coins)}
      </div>
    </div>
  )
}

// ─────────────────────────── feed ───────────────────────────

export function FeedList({
  rows,
  categories,
}: {
  rows: TgFeedRow[]
  categories: Map<string, string>
}) {
  if (rows.length === 0) {
    return <p className="px-1 py-6 text-sm text-neutral-500">Пока пусто.</p>
  }
  // Group consecutive rows by loop·day for the dividers.
  const groups: { key: string; loop: number; day: number; rows: TgFeedRow[] }[] = []
  for (const r of rows) {
    const key = `${r.loopNumber}-${r.dayInLoop}`
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.rows.push(r)
    else groups.push({ key, loop: r.loopNumber, day: r.dayInLoop, rows: [r] })
  }

  return (
    <div>
      {groups.map((g) => (
        <div key={g.key}>
          <div className="px-1 pb-1 pt-4 text-xs text-neutral-600">{dayLabel(g.loop, g.day)}</div>
          <ul className="space-y-1">
            {g.rows.map((r) => (
              <FeedRow key={r.id} r={r} categories={categories} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export function FeedRow({ r, categories }: { r: TgFeedRow; categories: Map<string, string> }) {
  const pending = r.status === 'pending'
  const rejected = r.status === 'rejected'
  const label = categories.get(r.categorySlug) ?? r.categorySlug
  const note = r.comment?.trim()

  let amount: React.ReactNode
  if (r.kind === 'item') {
    amount = (
      <span className="text-neutral-300">
        {r.itemName}
        {r.itemQty && r.itemQty !== 1 ? ` ×${Math.abs(r.itemQty)}` : ''}
      </span>
    )
  } else {
    const negative = r.signedGp < 0
    amount = (
      <span
        className={'font-mono tabular-nums ' + (negative ? 'text-neutral-300' : 'text-emerald-400/80')}
      >
        {formatSignedGp(r.signedGp)}
      </span>
    )
  }

  return (
    <li className="flex items-start justify-between gap-3 rounded-lg px-1 py-1.5">
      <div className="min-w-0">
        <div
          className={'flex items-center gap-2 ' + (rejected ? 'line-through opacity-50' : '')}
        >
          {pending && <span aria-hidden>⏳</span>}
          {amount}
        </div>
        <div className="truncate text-xs text-neutral-500">
          {label}
          {note ? ` · ${note}` : ''}
          {r.kind === 'transfer' ? ' · перевод' : ''}
        </div>
      </div>
      {pending && (
        <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-400">
          на одобрение
        </span>
      )}
      {rejected && (
        <span className="shrink-0 rounded-full bg-neutral-700/40 px-2 py-0.5 text-xs text-neutral-400">
          отклонено
        </span>
      )}
    </li>
  )
}

// ─────────────────────────── form fields (sheet pattern) ───────────────────────────

export const FIELD =
  'w-full rounded-lg bg-neutral-800 px-3 py-2 text-neutral-100 placeholder:text-neutral-500 outline-none focus:ring-1 focus:ring-neutral-600'

// A bottom sheet. Backdrop click does NOT close (a mis-tap must not throw away a
// half-typed form — spec-055 R2); the only ways out are the explicit «← Назад»
// button and each sheet's own submit. The panel caps at 90vh and scrolls its
// content internally so a long form (напр. шаблон вылазки: награда+ростер+время)
// always fits a phone with the submit button reachable; the header stays pinned.
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60">
      <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-neutral-900 pb-8">
        <div className="sticky top-0 z-10 mb-3 flex items-center gap-3 bg-neutral-900 px-4 pb-2 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-sm text-neutral-400 transition-colors hover:text-neutral-200"
          >
            ← Назад
          </button>
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h2>
        </div>
        <div className="px-4">{children}</div>
      </div>
    </div>
  )
}

export function SegToggle<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-neutral-800 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={
            'flex-1 rounded-md py-1.5 text-sm transition-colors ' +
            (value === o.value ? 'bg-neutral-700 text-neutral-100' : 'text-neutral-400')
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// Integer input that tolerates a transient empty field while typing. A plain
// controlled number input that snaps empty→min on every keystroke makes it
// impossible to erase a digit to type a new one (you had to type "12" then
// delete the "1" to get "2"). This keeps an internal text buffer: empty is
// allowed mid-edit, the committed value only ever settles to a valid int, and
// blur clamps an empty/invalid field back to `min`.
export function IntInput({
  value,
  onCommit,
  min = 1,
  className,
}: {
  value: number
  onCommit: (n: number) => void
  min?: number
  className?: string
}) {
  const [buf, setBuf] = useState(String(value))
  const [seen, setSeen] = useState(value)
  // Reset the text buffer only when the committed value changes from outside
  // (sanctioned "reset state on prop change" — no effect, no cascading-render
  // lint). Clearing the field doesn't commit, so an empty buffer is preserved
  // while typing — the fix for "couldn't erase a digit to type a new number".
  if (value !== seen) {
    setSeen(value)
    setBuf(String(value))
  }
  return (
    <input
      className={className}
      inputMode="numeric"
      value={buf}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d]/g, '')
        setBuf(raw)
        if (raw !== '') onCommit(Math.max(min, parseInt(raw, 10)))
      }}
      onBlur={() => {
        const n = parseInt(buf, 10)
        const clamped = Number.isFinite(n) ? Math.max(min, n) : min
        setBuf(String(clamped))
        onCommit(clamped)
      }}
    />
  )
}

export function SubmitButton({
  busy,
  onClick,
  children,
}: {
  busy: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="mt-4 w-full rounded-lg bg-blue-600 py-2.5 font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
    >
      {busy ? 'Сохраняю…' : children}
    </button>
  )
}

// ─────────────────────────── parse helpers ───────────────────────────

/** Parse a "зм" amount field → positive gold number, or null if invalid. */
export function parseGp(raw: string): number | null {
  const n = Number(raw.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

// «HH:MM» (a native <input type="time"> value) → {h, m}, or null if empty/junk.
// Used for both a вылазка's старт (minute-of-day) and its длительность (length).
export function parseHHMM(raw: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim())
  if (!m) return null
  const h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  if (h > 23 || min > 59) return null
  return { h, m: min }
}
