'use client'

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CampaignCharacter } from '@/lib/queries/campaign-characters'
import {
  getWalletTg,
  getFeedTg,
  getTxCategoriesTg,
  getStashTg,
  getAllBalancesTg,
  searchCampaignItemsTg,
  getPcItemHoldingsTg,
  getPcInventoryTg,
  getMyPendingTg,
  searchBuyableItemsTg,
  getBuyableItemsByIdsTg,
  getCampaignBuyConfigTg,
  getCampaignSetsTg,
  hasLoopCreditTg,
  getStashItemHoldingsTg,
  getStashResourceHoldingsTg,
  type StashResourceHoldingTg,
  type TgWallet,
  type TgRole,
  type TgFeedRow,
  type TgBalanceRow,
  type PcInventoryRowTg,
  type BuyableItemTg,
  type CampaignSetTg,
} from '@/lib/queries/ledger-tg'
import {
  formatDenoms,
  formatGp,
  formatSignedGp,
  dayLabel,
  initialOf,
  portraitUrl,
} from './format'
import { computeShortfall } from '@/lib/transaction-resolver'
import {
  createTransaction,
  createTransfer,
  createItemTransfer,
  createPurchase,
  deleteTransaction,
  deleteTransfer,
  submitBatch,
  takeLoopCredit,
} from '@/app/actions/transactions'
import {
  resolveBuyUnitPriceGp,
  normalizeRarity,
} from '@/lib/item-purchase-policy'
import { setEquipped } from '@/app/actions/equipped'
import {
  createSet,
  updateSet,
  deleteSet,
  buyItems,
  type SetItem,
} from '@/app/actions/sets'
import {
  listExpeditions,
  listExpeditionRuns,
  type ExpeditionTg,
  type ExpeditionRunTg,
} from '@/lib/queries/expeditions-tg'
import {
  addExpedition,
  updateExpedition,
  deleteExpedition,
  runExpedition,
} from '@/app/actions/expeditions'
import {
  listSchemas,
  listCraftRuns,
  getCraftSettingsTg,
  getCurrentPartyLevelTg,
  listDisassemblableStashItemsTg,
  type CraftSchemaTg,
  type CraftRunTg,
  type StashCraftableItemTg,
} from '@/lib/queries/craft-tg'
import { createSchemaItem, disassembleItem, runCraft } from '@/app/actions/craft'
import {
  craftRowFor,
  rateForPb,
  requiredRateHours,
  type CraftSettings,
} from '@/lib/craft-settings'
import { craftRarityKey, missingCraftHours } from '@/lib/craft'
import { pbForLevel } from '@/lib/party-level'
import type { RarityKey } from '@/lib/item-default-prices'
import { createResourceItem, sellStashResource } from '@/app/actions/resources'
import {
  validateExpeditionWindow,
  hhmmToMinute,
  minuteToHHMM,
  LOOP_DAYS,
} from '@/lib/expedition-calendar'
import { LOOP_CREDIT_GP } from '@/lib/ledger-constants'
import {
  putMoneyIntoStash,
  takeMoneyFromStash,
  putItemIntoStash,
  takeItemFromStash,
} from '@/app/actions/stash'

// ─────────────────────────── shared ───────────────────────────

export function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 text-center text-sm text-neutral-400">
      {children}
    </div>
  )
}

/**
 * Portrait <img> with a resized thumbnail + graceful fallback (feedback #2):
 * loads a small Cloudflare-resized WebP; if the zone has no Transformations,
 * onError swaps to the un-resized original. Lazy by default so off-screen
 * avatars in the list don't all download at once; `eager` for the hero.
 */
function SmartImg({
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

function Portrait({ name, keyStr }: { name: string; keyStr: string | null }) {
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

function Avatar({ name, keyStr, size }: { name: string; keyStr: string | null; size: number }) {
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

function BackLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="mb-4 text-sm text-neutral-400 transition-colors hover:text-neutral-200"
    >
      ← {children}
    </button>
  )
}

// ─────────────────────────── T008 — character list ───────────────────────────

export function CharacterList({
  characters,
  onSelect,
  onOpenBalances,
  onOpenWiki,
  onOpenExpeditions,
  onOpenCraft,
}: {
  characters: CampaignCharacter[]
  onSelect: (c: CampaignCharacter) => void
  onOpenBalances?: () => void
  onOpenWiki?: () => void
  onOpenExpeditions?: () => void
  onOpenCraft?: () => void
}) {
  const own = characters.filter((c) => c.isOwn)
  const others = characters.filter((c) => !c.isOwn)

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-3 text-lg font-semibold">Персонажи</h1>
      {/* Балансы / Вылазки / Крафт / Каталог — видимые кнопки (были спрятаны в
          ⋮-меню, которое никто не находил), как лончер в PcHome. Flex вместо
          grid — ряд ровно делится на сколько есть кнопок. */}
      {(onOpenBalances || onOpenExpeditions || onOpenCraft || onOpenWiki) && (
        <div className="mb-4 flex gap-2">
          {onOpenBalances && <AppButton icon="⚖️" label="Балансы" onClick={onOpenBalances} />}
          {onOpenExpeditions && <AppButton icon="🧭" label="Вылазки" onClick={onOpenExpeditions} />}
          {onOpenCraft && <AppButton icon="🛠" label="Крафт" onClick={onOpenCraft} />}
          {onOpenWiki && <AppButton icon="📖" label="Каталог" onClick={onOpenWiki} />}
        </div>
      )}
      {own.length > 0 && (
        <Group title="Мои персонажи">
          {own.map((c) => (
            <CharacterRow key={c.id} c={c} onSelect={onSelect} />
          ))}
        </Group>
      )}
      {own.length === 0 && (
        <p className="mb-6 rounded-lg bg-neutral-900 px-4 py-3 text-sm text-neutral-400">
          За тобой пока нет персонажей в этой кампании. Напиши ведущему — он привяжет твоего PC.
        </p>
      )}
      {others.length > 0 && (
        <Group title={own.length > 0 ? 'Остальные' : 'Персонажи кампании'}>
          {others.map((c) => (
            <CharacterRow key={c.id} c={c} onSelect={onSelect} />
          ))}
        </Group>
      )}
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
        {title}
      </h2>
      <ul className="space-y-2">{children}</ul>
    </div>
  )
}

function CharacterRow({
  c,
  onSelect,
}: {
  c: CampaignCharacter
  onSelect: (c: CampaignCharacter) => void
}) {
  return (
    <li>
      <button
        onClick={() => onSelect(c)}
        className="flex w-full items-center gap-3 rounded-lg bg-neutral-900 px-3 py-2 text-left transition-colors hover:bg-neutral-800"
      >
        <Avatar name={c.title} keyStr={c.primaryPortraitKey} size={40} />
        <span className="font-medium">{c.title}</span>
      </button>
    </li>
  )
}

// ─────────────────────────── T009 — PC home + app launcher ───────────────────────────

export function PcHome({
  character,
  showBack,
  onBack,
  onOpenLedger,
  onOpenInventory,
  onOpenBalances,
  onOpenEquip,
  onOpenWiki,
  onOpenExpeditions,
  onOpenCraft,
}: {
  character: CampaignCharacter
  showBack: boolean
  onBack: () => void
  onOpenLedger: () => void
  onOpenInventory: () => void
  onOpenBalances?: () => void
  onOpenEquip?: () => void
  onOpenWiki?: () => void
  onOpenExpeditions?: () => void
  onOpenCraft?: () => void
}) {
  return (
    <div className="mx-auto flex h-[calc(100dvh-3rem)] max-w-sm flex-col">
      <div className="flex shrink-0 items-center justify-between">
        {showBack ? <BackLink onClick={onBack}>мои персонажи</BackLink> : <span />}
      </div>

      {/* Portrait fills the remaining height, contained — shrinks both ways so
          the screen never scrolls; the launcher stays pinned below. */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl bg-neutral-900">
        <Portrait name={character.title} keyStr={character.primaryPortraitKey} />
      </div>
      <div className="mt-2 shrink-0 text-center text-base font-semibold">{character.title}</div>

      {/* Per-PC app launcher (C-04), pinned at the bottom. Every action is a
          visible button — balances + starter were buried in a ⋮ menu before
          (nobody found them); an even flex row adapts to 3 or 4 actions. */}
      <div className="mt-3 grid shrink-0 grid-cols-3 gap-2">
        <AppButton icon="🛍" label="Деньги" onClick={onOpenLedger} />
        <AppButton icon="🎒" label="Сумка" onClick={onOpenInventory} />
        <AppButton icon="📖" label="Каталог" onClick={onOpenWiki} disabled={!onOpenWiki} />
        {onOpenExpeditions && (
          <AppButton icon="🧭" label="Вылазки" onClick={onOpenExpeditions} />
        )}
        {onOpenCraft && <AppButton icon="🛠" label="Крафт" onClick={onOpenCraft} />}
        {onOpenBalances && (
          <AppButton icon="⚖️" label="Балансы" onClick={onOpenBalances} />
        )}
        {/* «Заявки» скрыт: апрувы выключены (spec-053), pending не создаётся.
            Вернётся вместе с approval-UI, если approvals_enabled снова true. */}
        {character.isOwn && onOpenEquip && (
          <AppButton icon="🎽" label="Снаряжение" onClick={onOpenEquip} />
        )}
      </div>
    </div>
  )
}

function AppButton({
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

function WalletCard({ wallet, label }: { wallet: TgWallet; label?: string }) {
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

function FeedList({
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

function FeedRow({ r, categories }: { r: TgFeedRow; categories: Map<string, string> }) {
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

// ─────────────────────────── write sheets (T014/T015) ───────────────────────────

const FIELD =
  'w-full rounded-lg bg-neutral-800 px-3 py-2 text-neutral-100 placeholder:text-neutral-500 outline-none focus:ring-1 focus:ring-neutral-600'

// A bottom sheet. Backdrop click does NOT close (a mis-tap must not throw away a
// half-typed form — spec-055 R2); the only ways out are the explicit «← Назад»
// button and each sheet's own submit. The panel caps at 90vh and scrolls its
// content internally so a long form (напр. шаблон вылазки: награда+ростер+время)
// always fits a phone with the submit button reachable; the header stays pinned.
function Sheet({
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

function SegToggle<T extends string>({
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
function IntInput({
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

function SubmitButton({
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

/** Parse a "зм" amount field → positive gold number, or null if invalid. */
function parseGp(raw: string): number | null {
  const n = Number(raw.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

// «HH:MM» (a native <input type="time"> value) → {h, m}, or null if empty/junk.
// Used for both a вылазка's старт (minute-of-day) and its длительность (length).
function parseHHMM(raw: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim())
  if (!m) return null
  const h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  if (h > 23 || min > 59) return null
  return { h, m: min }
}

// T014 — record an expense / income for a PC.
function RecordSheet({
  campaignId,
  loopNumber,
  actorPcId,
  onClose,
  onDone,
}: {
  campaignId: string
  loopNumber: number
  actorPcId: string
  onClose: () => void
  onDone: () => void
}) {
  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const [amount, setAmount] = useState('')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const gp = parseGp(amount)
    if (gp === null) {
      setError('Введите сумму в зм')
      return
    }
    setBusy(true)
    setError(null)
    const res = await createTransaction({
      campaignId,
      actorPcId,
      kind: 'money',
      amountGp: kind === 'expense' ? -gp : gp,
      categorySlug: kind === 'expense' ? 'expense' : 'income',
      comment: comment.trim(),
      loopNumber,
      dayInLoop: 1,
      notify: true,
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onDone()
    onClose()
  }

  return (
    <Sheet title="Записать" onClose={onClose}>
      <div className="space-y-3">
        <SegToggle
          value={kind}
          onChange={setKind}
          options={[
            { value: 'expense', label: 'Расход' },
            { value: 'income', label: 'Доход' },
          ]}
        />
        <input
          className={FIELD}
          inputMode="decimal"
          placeholder="Сумма, зм"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <input
          className={FIELD}
          placeholder="Комментарий (необязательно)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      <SubmitButton busy={busy} onClick={submit}>
        {kind === 'expense' ? 'Списать' : 'Записать'}
      </SubmitButton>
    </Sheet>
  )
}

type TransferDir = 'player' | 'to-stash' | 'from-stash'

// T015 — PC↔PC money + put/take общак. Reused by the ledger («Перевод») and the
// общак screen (Положить/Забрать, via initialDir).
function TransferSheet({
  supabase,
  campaignId,
  loopNumber,
  actorPcId,
  others,
  initialDir,
  initialAsset,
  onClose,
  onDone,
}: {
  supabase: SupabaseClient
  campaignId: string
  loopNumber: number
  actorPcId: string
  others: CampaignCharacter[]
  initialDir: TransferDir
  initialAsset?: 'money' | 'item'
  onClose: () => void
  onDone: () => void
}) {
  const [asset, setAsset] = useState<'money' | 'item'>(initialAsset ?? 'money')
  const [dir, setDir] = useState<TransferDir>(initialDir)
  const [recipient, setRecipient] = useState<string>(others[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [qty, setQty] = useState('1')
  const [sourceItems, setSourceItems] = useState<{ name: string; qty: number }[] | null>(null)
  const [picked, setPicked] = useState('')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Item picker source: what you can move FROM. Putting into the общак → your
  // own holdings; taking out → the общак's holdings. Reloads on dir/asset change.
  useEffect(() => {
    if (asset !== 'item') return
    let alive = true
    ;(async () => {
      try {
        const items =
          dir === 'from-stash'
            ? await getStashItemHoldingsTg(supabase, campaignId, loopNumber)
            : await getPcItemHoldingsTg(supabase, actorPcId, loopNumber)
        if (alive) {
          setSourceItems(items)
          setPicked(items[0]?.name ?? '')
        }
      } catch {
        if (alive) {
          setSourceItems([])
          setPicked('')
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [asset, dir, supabase, campaignId, actorPcId, loopNumber])

  const switchAsset = (a: 'money' | 'item') => {
    setAsset(a)
    setError(null)
  }

  const dirOptions: { value: TransferDir; label: string }[] =
    asset === 'item'
      ? [
          { value: 'player', label: 'Игроку' },
          { value: 'to-stash', label: 'В общак' },
          { value: 'from-stash', label: 'Из общака' },
        ]
      : [
          { value: 'player', label: 'Игроку' },
          { value: 'to-stash', label: 'В общак' },
          { value: 'from-stash', label: 'Из общака' },
        ]

  const submit = async () => {
    setError(null)

    if (asset === 'item') {
      const n = Math.max(0, parseInt(qty, 10) || 0)
      if (n < 1) {
        setError('Количество ≥ 1')
        return
      }
      const name = picked
      if (!name) {
        setError('Выберите предмет')
        return
      }
      const avail = sourceItems?.find((i) => i.name === name)?.qty ?? 0
      if (n > avail) {
        setError(dir === 'from-stash' ? `В общаке только ${avail}` : `У тебя только ${avail}`)
        return
      }
      if (dir === 'player' && !recipient) {
        setError('Выберите получателя')
        return
      }
      setBusy(true)
      const payload = {
        campaignId,
        actorPcId,
        itemName: name,
        qty: n,
        comment: comment.trim(),
        loopNumber,
        dayInLoop: 1,
      }
      const res =
        dir === 'player'
          ? await createItemTransfer({
              campaignId,
              senderPcId: actorPcId,
              recipientPcId: recipient,
              itemName: name,
              qty: n,
              categorySlug: 'transfer',
              comment: comment.trim(),
              loopNumber,
              dayInLoop: 1,
              notify: true,
            })
          : dir === 'from-stash'
            ? await takeItemFromStash(payload)
            : await putItemIntoStash(payload)
      setBusy(false)
      if (!res.ok) {
        setError(res.error)
        return
      }
      onDone()
      onClose()
      return
    }

    // money
    const gp = parseGp(amount)
    if (gp === null) {
      setError('Введите сумму в зм')
      return
    }
    if (dir === 'player' && !recipient) {
      setError('Выберите получателя')
      return
    }
    setBusy(true)
    const base = {
      campaignId,
      actorPcId,
      amountGp: gp,
      comment: comment.trim(),
      loopNumber,
      dayInLoop: 1,
    }
    const res =
      dir === 'player'
        ? await createTransfer({
            campaignId,
            senderPcId: actorPcId,
            recipientPcId: recipient,
            amountGp: gp,
            categorySlug: 'transfer',
            comment: comment.trim(),
            loopNumber,
            dayInLoop: 1,
            notify: true,
          })
        : dir === 'to-stash'
          ? await putMoneyIntoStash(base)
          : await takeMoneyFromStash(base)
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onDone()
    onClose()
  }

  return (
    <Sheet title="Перевод" onClose={onClose}>
      <div className="space-y-3">
        <SegToggle
          value={asset}
          onChange={switchAsset}
          options={[
            { value: 'money', label: 'Деньги' },
            { value: 'item', label: 'Предмет' },
          ]}
        />
        <SegToggle value={dir} onChange={setDir} options={dirOptions} />

        {dir === 'player' &&
          (others.length > 0 ? (
            <select
              className={FIELD}
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            >
              {others.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-neutral-500">Нет других персонажей.</p>
          ))}

        {asset === 'money' ? (
          <input
            className={FIELD}
            inputMode="decimal"
            placeholder="Сумма, зм"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        ) : (
          <>
            {sourceItems === null ? (
              <p className="text-sm text-neutral-500">Загрузка…</p>
            ) : sourceItems.length === 0 ? (
              <p className="text-sm text-neutral-500">
                {dir === 'from-stash' ? 'В общаке нет предметов.' : 'У тебя нет предметов.'}
              </p>
            ) : (
              <select className={FIELD} value={picked} onChange={(e) => setPicked(e.target.value)}>
                {sourceItems.map((i) => (
                  <option key={i.name} value={i.name}>
                    {i.name} (×{i.qty})
                  </option>
                ))}
              </select>
            )}
            <input
              className={FIELD}
              inputMode="numeric"
              placeholder="Количество"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </>
        )}

        <input
          className={FIELD}
          placeholder="Комментарий (необязательно)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      <SubmitButton busy={busy} onClick={submit}>
        Перевести
      </SubmitButton>
    </Sheet>
  )
}

// ─────────────────────────── T011 — Ledger screen ───────────────────────────

type LedgerData = {
  wallet: TgWallet
  rows: TgFeedRow[]
  nextCursor: string | null
  categories: Map<string, string>
}

export function LedgerScreen({
  supabase,
  campaignId,
  loopNumber,
  character,
  others,
  onBack,
  onOpenStash,
  refreshKey,
}: {
  supabase: SupabaseClient
  campaignId: string
  loopNumber: number
  character: CampaignCharacter
  others: CampaignCharacter[]
  onBack: () => void
  onOpenStash: () => void
  refreshKey: number
}) {
  const [data, setData] = useState<LedgerData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<'none' | 'record' | 'transfer'>('none')

  const reload = useCallback(async () => {
    const [wallet, feed, categories] = await Promise.all([
      getWalletTg(supabase, character.id, loopNumber),
      getFeedTg(supabase, character.id, loopNumber, { limit: 25 }),
      getTxCategoriesTg(supabase, campaignId),
    ])
    setData({ wallet, rows: feed.rows, nextCursor: feed.nextCursor, categories })
  }, [supabase, campaignId, loopNumber, character.id])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [wallet, feed, categories] = await Promise.all([
          getWalletTg(supabase, character.id, loopNumber),
          getFeedTg(supabase, character.id, loopNumber, { limit: 25 }),
          getTxCategoriesTg(supabase, campaignId),
        ])
        if (alive) setData({ wallet, rows: feed.rows, nextCursor: feed.nextCursor, categories })
      } catch {
        if (alive) setError('Не удалось загрузить кошелёк.')
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase, campaignId, loopNumber, character.id, refreshKey])

  const loadMore = useCallback(async () => {
    if (!data?.nextCursor || loadingMore) return
    setLoadingMore(true)
    setMoreError(null)
    try {
      const more = await getFeedTg(supabase, character.id, loopNumber, {
        before: data.nextCursor,
        limit: 25,
      })
      setData((d) =>
        d ? { ...d, rows: [...d.rows, ...more.rows], nextCursor: more.nextCursor } : d,
      )
    } catch {
      // Feedback instead of a silently-stuck button (spec-030 UX pass).
      setMoreError('Не удалось подгрузить — нажми ещё раз.')
    } finally {
      setLoadingMore(false)
    }
  }, [data, loadingMore, supabase, character.id, loopNumber])

  return (
    <div className="mx-auto max-w-sm pb-20">
      <div className="mb-4 flex items-center justify-between">
        <BackLink onClick={onBack}>{character.title}</BackLink>
        <button
          onClick={onOpenStash}
          className="mb-4 text-sm text-neutral-400 transition-colors hover:text-neutral-200"
        >
          Общак »
        </button>
      </div>

      {error && <Centered>{error}</Centered>}
      {!error && !data && <Centered>Загрузка…</Centered>}
      {data && (
        <>
          <WalletCard wallet={data.wallet} />
          {character.isOwn && (
            <button
              onClick={() => setSheet('transfer')}
              className="mt-3 w-full rounded-lg bg-neutral-900 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-800"
            >
              Перевод
            </button>
          )}
          <div className="mt-4">
            <FeedList rows={data.rows} categories={data.categories} />
            {data.nextCursor && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="mt-3 w-full rounded-lg bg-neutral-900 py-2 text-sm text-neutral-400 transition-colors hover:bg-neutral-800 disabled:opacity-50"
              >
                {loadingMore ? 'Загрузка…' : 'Показать ещё'}
              </button>
            )}
            {moreError && (
              <p className="mt-2 text-center text-xs text-red-400">{moreError}</p>
            )}
          </div>
        </>
      )}

      {/* Write controls — own PC only (E4: view any, edit own). */}
      {character.isOwn && data && (
        <button
          onClick={() => setSheet('record')}
          aria-label="Записать"
          className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-3xl leading-none text-white shadow-lg transition-colors hover:bg-blue-500"
        >
          ＋
        </button>
      )}
      {sheet === 'record' && (
        <RecordSheet
          campaignId={campaignId}
          loopNumber={loopNumber}
          actorPcId={character.id}
          onClose={() => setSheet('none')}
          onDone={() => void reload()}
        />
      )}
      {sheet === 'transfer' && (
        <TransferSheet
          supabase={supabase}
          campaignId={campaignId}
          loopNumber={loopNumber}
          actorPcId={character.id}
          others={others}
          initialDir="player"
          onClose={() => setSheet('none')}
          onDone={() => void reload()}
        />
      )}
    </div>
  )
}

// ─────────────────────────── T012 — Общак screen ───────────────────────────

export function StashScreen({
  supabase,
  campaignId,
  loopNumber,
  categories,
  character,
  others,
  onBack,
  refreshKey,
}: {
  supabase: SupabaseClient
  campaignId: string
  loopNumber: number
  categories: Map<string, string>
  character: CampaignCharacter
  others: CampaignCharacter[]
  onBack: () => void
  refreshKey: number
}) {
  const [data, setData] = useState<{ wallet: TgWallet; recent: TgFeedRow[] } | null>(null)
  const [resources, setResources] = useState<StashResourceHoldingTg[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<'none' | 'to-stash' | 'from-stash'>('none')
  const [sellBusyId, setSellBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const [stash, res] = await Promise.all([
      getStashTg(supabase, campaignId, loopNumber),
      getStashResourceHoldingsTg(supabase, campaignId, loopNumber),
    ])
    setData({ wallet: stash.wallet, recent: stash.recent })
    setResources(res)
  }, [supabase, campaignId, loopNumber])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [stash, res] = await Promise.all([
          getStashTg(supabase, campaignId, loopNumber),
          getStashResourceHoldingsTg(supabase, campaignId, loopNumber),
        ])
        if (alive) {
          setData({ wallet: stash.wallet, recent: stash.recent })
          setResources(res)
        }
      } catch {
        if (alive) setError('Не удалось загрузить общак.')
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase, campaignId, loopNumber, refreshKey])

  // Sell a resource from the общак at its nominal → success тост «+N зм» + reload.
  // The transient toast lives in an event-handler chain (not an effect), so it
  // doesn't trip react-hooks/set-state-in-effect.
  const sell = async (r: StashResourceHoldingTg, qty: number) => {
    setError(null)
    setSellBusyId(r.itemNodeId)
    const res = await sellStashResource({
      campaignId,
      itemNodeId: r.itemNodeId,
      qty: Math.min(qty, r.qty),
      loopNumber,
      dayInLoop: 1,
    })
    setSellBusyId(null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setToast(`+${res.soldGp} зм`)
    window.setTimeout(() => setToast(null), 2500)
    await reload()
  }

  return (
    <div className="mx-auto max-w-sm pb-6">
      <BackLink onClick={onBack}>назад</BackLink>
      <h1 className="mb-3 text-lg font-semibold">Общак</h1>
      {error && <Centered>{error}</Centered>}
      {!error && !data && <Centered>Загрузка…</Centered>}
      {data && (
        <>
          <WalletCard wallet={data.wallet} />
          {character.isOwn && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => setSheet('to-stash')}
                className="rounded-lg bg-neutral-900 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-800"
              >
                Положить
              </button>
              <button
                onClick={() => setSheet('from-stash')}
                className="rounded-lg bg-neutral-900 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-800"
              >
                Забрать
              </button>
            </div>
          )}
          {resources.length > 0 && (
            <div className="mt-4">
              <h2 className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
                Ресурсы
              </h2>
              <div className="space-y-1">
                {resources.map((r) => (
                  <ResourceSellRow
                    key={`${r.itemNodeId}-${r.qty}`}
                    r={r}
                    busy={sellBusyId === r.itemNodeId}
                    onSell={(qty) => void sell(r, qty)}
                  />
                ))}
              </div>
            </div>
          )}
          <div className="mt-4">
            <h2 className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
              Движения
            </h2>
            <FeedList rows={data.recent} categories={categories} />
          </div>
        </>
      )}
      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
          <div className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
            {toast}
          </div>
        </div>
      )}
      {sheet !== 'none' && (
        <TransferSheet
          supabase={supabase}
          campaignId={campaignId}
          loopNumber={loopNumber}
          actorPcId={character.id}
          others={others}
          initialDir={sheet}
          onClose={() => setSheet('none')}
          onDone={() => void reload()}
        />
      )}
    </div>
  )
}

/**
 * One sellable resource row in the общак: «{name} ×{qty} · {price} зм/шт» + a qty
 * field (default = the full remaining stock) + a «Продать» button. Keyed by
 * (id, qty) upstream so a sale that changes the stock remounts the row, resetting
 * the qty field back to the new full remainder.
 */
function ResourceSellRow({
  r,
  busy,
  onSell,
}: {
  r: StashResourceHoldingTg
  busy: boolean
  onSell: (qty: number) => void
}) {
  const [qty, setQty] = useState(r.qty)
  return (
    <div className="flex items-center gap-2 rounded-lg bg-neutral-900 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-neutral-100">{r.name}</div>
        <div className="text-xs text-neutral-500">
          ×{r.qty} · {r.priceGp} зм/шт
        </div>
      </div>
      <IntInput
        className="w-14 rounded-md bg-neutral-800 px-2 py-1 text-right text-sm text-neutral-100"
        value={qty}
        onCommit={setQty}
      />
      <button
        onClick={() => onSell(qty)}
        disabled={busy}
        className="shrink-0 rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
      >
        {busy ? '…' : 'Продать'}
      </button>
    </div>
  )
}

// ─────────────────────────── spec-052 — inventory (US1/US3) ───────────────────────────

// Spec-053. Shared under a buy total: the «оставить на руках» field (only for
// свои+общак) and a live balance preview «баланс → после». The client mirrors
// the server via the same pure computeShortfall, so what it shows is what the
// server will do. Balances are loaded by the parent (walletGp / stashGp).
function FundingPreview({
  funding,
  totalGp,
  walletGp,
  stashGp,
  keep,
  onKeep,
}: {
  funding: 'pc' | 'pc_with_stash' | 'stash'
  totalGp: number | null
  walletGp: number | null
  stashGp: number | null
  keep: string
  onKeep: (v: string) => void
}) {
  const keepGp = funding === 'pc_with_stash' ? Math.max(0, parseGp(keep) ?? 0) : 0
  const preview = (() => {
    if (totalGp == null || walletGp == null) return null
    if (funding === 'pc') {
      return { own: [walletGp, walletGp - totalGp] as const, stash: null, short: 0 }
    }
    if (funding === 'stash') {
      const s = stashGp ?? 0
      return { own: null, stash: [s, s - totalGp] as const, short: 0 }
    }
    const s = stashGp ?? 0
    const sf = computeShortfall(walletGp, totalGp, s, keepGp)
    const ownSpend = totalGp - sf.toBorrow
    return {
      own: [walletGp, walletGp - ownSpend] as const,
      stash: [s, s - sf.toBorrow] as const,
      short: sf.remainderNegative,
    }
  })()
  const arrow = (from: number, to: number) => (
    <span className="font-mono tabular-nums text-neutral-300">
      {formatGp(from)} →{' '}
      <span className={to < 0 ? 'text-red-400' : 'text-neutral-100'}>{formatGp(to)}</span>
    </span>
  )
  return (
    <>
      {funding === 'pc_with_stash' && (
        <input
          className={FIELD}
          inputMode="decimal"
          placeholder="Оставить на руках, зм (необязательно)"
          value={keep}
          onChange={(e) => onKeep(e.target.value)}
        />
      )}
      {preview && (
        <div className="rounded-lg bg-neutral-900 px-3 py-2 text-xs">
          {preview.own && (
            <div className="flex justify-between">
              <span className="text-neutral-400">Свои</span>
              {arrow(preview.own[0], preview.own[1])}
            </div>
          )}
          {preview.stash && (
            <div className="mt-0.5 flex justify-between">
              <span className="text-neutral-400">Общак</span>
              {arrow(preview.stash[0], preview.stash[1])}
            </div>
          )}
          {preview.short > 0 && (
            <p className="mt-1 text-red-400">
              Не хватает {formatGp(preview.short)} даже с общаком
            </p>
          )}
        </div>
      )}
    </>
  )
}

// T017 — buy a catalog item for gold (US2). Search → preview price → pick qty +
// funding source → createPurchase. Excludes «нельзя купить» + priceless items.
function BuySheet({
  supabase,
  campaignId,
  loopNumber,
  buyerPcId,
  onClose,
  onDone,
}: {
  supabase: SupabaseClient
  campaignId: string
  loopNumber: number
  buyerPcId: string
  onClose: () => void
  onDone: () => void
}) {
  const [config, setConfig] = useState<Awaited<
    ReturnType<typeof getCampaignBuyConfigTg>
  > | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<BuyableItemTg[]>([])
  const [picked, setPicked] = useState<BuyableItemTg | null>(null)
  const [qty, setQty] = useState('1')
  const [funding, setFunding] = useState<'pc' | 'pc_with_stash' | 'stash'>('pc')
  const [keep, setKeep] = useState('')
  const [walletGp, setWalletGp] = useState<number | null>(null)
  const [stashGp, setStashGp] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const c = await getCampaignBuyConfigTg(supabase, campaignId)
        if (alive) setConfig(c)
      } catch {
        /* preview just won't render; createPurchase still validates server-side */
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase, campaignId])

  // Balances for the «баланс → после» preview (spec-053). Best-effort.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [w, s] = await Promise.all([
          getWalletTg(supabase, buyerPcId, loopNumber),
          getStashTg(supabase, campaignId, loopNumber),
        ])
        if (alive) {
          setWalletGp(w.aggregateGp)
          setStashGp(s.wallet.aggregateGp)
        }
      } catch {
        /* preview is optional */
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase, campaignId, buyerPcId, loopNumber])

  useEffect(() => {
    const q = query.trim()
    if (!q) return // stale results are hidden by the render guard below
    let alive = true
    const t = setTimeout(async () => {
      try {
        const r = await searchBuyableItemsTg(supabase, campaignId, q)
        if (alive) setResults(r)
      } catch {
        if (alive) setResults([])
      }
    }, 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [query, supabase, campaignId])

  const n = Math.max(0, parseInt(qty, 10) || 0)
  const unitGp =
    picked && config
      ? resolveBuyUnitPriceGp({
          priceGp: picked.priceGp,
          categorySlug: picked.categorySlug,
          rarity: normalizeRarity(picked.rarity),
          defaults: config.defaults,
          policy: config.policy,
        })
      : null
  const totalGp = unitGp != null ? unitGp * Math.max(1, n) : null

  const submit = async () => {
    setError(null)
    if (!picked) {
      setError('Выберите предмет')
      return
    }
    if (n < 1) {
      setError('Количество ≥ 1')
      return
    }
    if (unitGp == null) {
      setError('У предмета нет цены — покупка недоступна')
      return
    }
    setBusy(true)
    try {
      const res = await createPurchase({
        campaignId,
        buyerPcId,
        itemNodeId: picked.id,
        qty: n,
        fundingSource: funding,
        keepGp: funding === 'pc_with_stash' ? Math.max(0, parseGp(keep) ?? 0) : undefined,
        loopNumber,
        dayInLoop: 1,
        notify: true,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      onDone()
      onClose()
    } catch {
      setError('Не удалось купить — попробуй ещё раз.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title="Купить" onClose={onClose}>
      <div className="space-y-3">
        {!picked ? (
          <>
            <input
              className={FIELD}
              placeholder="Поиск предмета…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            {query.trim() !== '' && results.length > 0 && (
              <div className="max-h-60 overflow-y-auto rounded-lg bg-neutral-900">
                {results.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => {
                      setPicked(it)
                      setError(null)
                    }}
                    className="block w-full border-b border-neutral-800 px-3 py-2 text-left text-sm text-neutral-100 last:border-0 hover:bg-neutral-800"
                  >
                    {it.title}
                  </button>
                ))}
              </div>
            )}
            {query.trim() !== '' && results.length === 0 && (
              <p className="text-sm text-neutral-500">Ничего не найдено.</p>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg bg-neutral-900 px-3 py-2">
              <span className="text-sm text-neutral-100">{picked.title}</span>
              <button
                onClick={() => {
                  setPicked(null)
                  setError(null)
                }}
                className="text-xs text-neutral-400 hover:text-neutral-200"
              >
                сменить
              </button>
            </div>

            {unitGp == null ? (
              <p className="text-sm text-amber-400">
                У этого предмета нет цены — купить нельзя.
              </p>
            ) : (
              <>
                <input
                  className={FIELD}
                  inputMode="numeric"
                  placeholder="Количество"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
                <SegToggle
                  value={funding}
                  onChange={setFunding}
                  options={[
                    { value: 'pc', label: 'За свои' },
                    { value: 'pc_with_stash', label: 'Свои+общак' },
                    { value: 'stash', label: 'Из общака' },
                  ]}
                />
                <div className="rounded-lg bg-neutral-900 px-3 py-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Цена за шт.</span>
                    <span className="font-mono tabular-nums text-neutral-200">
                      {formatGp(unitGp)}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between">
                    <span className="text-neutral-400">Итого</span>
                    <span className="font-mono tabular-nums text-neutral-100">
                      {totalGp != null ? formatGp(totalGp) : '—'}
                    </span>
                  </div>
                </div>
                <FundingPreview
                  funding={funding}
                  totalGp={totalGp}
                  walletGp={walletGp}
                  stashGp={stashGp}
                  keep={keep}
                  onKeep={setKeep}
                />
              </>
            )}
          </>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      {picked && unitGp != null && (
        <SubmitButton busy={busy} onClick={submit}>
          Купить
        </SubmitButton>
      )}
    </Sheet>
  )
}

export function InventoryScreen({
  supabase,
  campaignId,
  loopNumber,
  character,
  others,
  onOpenSets,
  onBack,
  refreshKey,
}: {
  supabase: SupabaseClient
  campaignId: string
  loopNumber: number
  character: CampaignCharacter
  others: CampaignCharacter[]
  onOpenSets: () => void
  onBack: () => void
  refreshKey: number
}) {
  const [rows, setRows] = useState<PcInventoryRowTg[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<'none' | 'move' | 'buy'>('none')
  const [togglingName, setTogglingName] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const inv = await getPcInventoryTg(supabase, campaignId, character.id, loopNumber)
    setRows(inv)
  }, [supabase, campaignId, character.id, loopNumber])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const inv = await getPcInventoryTg(
          supabase,
          campaignId,
          character.id,
          loopNumber,
        )
        if (alive) setRows(inv)
      } catch {
        if (alive) setError('Не удалось загрузить инвентарь.')
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase, campaignId, character.id, loopNumber, refreshKey])

  const carried = (rows ?? []).filter((r) => !r.equipped)
  const equipped = (rows ?? []).filter((r) => r.equipped)
  const ATTUNE_CAP = 3
  const attunedCount = (rows ?? []).filter(
    (r) => r.equipped && r.requiresAttunement,
  ).length

  const toggleEquip = async (row: PcInventoryRowTg) => {
    setError(null)
    setTogglingName(row.name)
    const res = await setEquipped({
      campaignId,
      pcId: character.id,
      itemName: row.name,
      loopNumber,
      equipped: !row.equipped,
    })
    setTogglingName(null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    await reload()
  }

  return (
    <div className="mx-auto max-w-sm pb-6">
      <BackLink onClick={onBack}>назад</BackLink>
      <h1 className="mb-3 text-lg font-semibold">Сумка — {character.title}</h1>
      {error && <Centered>{error}</Centered>}
      {!error && !rows && <Centered>Загрузка…</Centered>}
      {rows && (
        <>
          {character.isOwn && (
            <div className="mb-4 grid grid-cols-3 gap-2">
              <button
                onClick={() => setSheet('buy')}
                className="rounded-lg bg-neutral-900 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-800"
              >
                Купить
              </button>
              <button
                onClick={onOpenSets}
                className="rounded-lg bg-neutral-900 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-800"
              >
                Наборы
              </button>
              <button
                onClick={() => setSheet('move')}
                className="rounded-lg bg-neutral-900 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-800"
              >
                Переместить
              </button>
            </div>
          )}
          {attunedCount > ATTUNE_CAP && (
            <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              Настроено {attunedCount} из {ATTUNE_CAP} — превышен лимит (5e:
              максимум 3 предмета с настройкой). Это просто предупреждение.
            </div>
          )}
          {rows.length === 0 ? (
            <Centered>Пусто. Предметы появятся после покупок и переводов.</Centered>
          ) : (
            <div className="space-y-4">
              {equipped.length > 0 && (
                <InventorySection title="Надето">
                  {equipped.map((r) => (
                    <InventoryRow
                      key={r.name}
                      row={r}
                      onToggleEquip={
                        character.isOwn ? () => void toggleEquip(r) : undefined
                      }
                      busy={togglingName === r.name}
                    />
                  ))}
                </InventorySection>
              )}
              <InventorySection title="В сумке">
                {carried.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-neutral-500">
                    — всё надето —
                  </div>
                ) : (
                  carried.map((r) => (
                    <InventoryRow
                      key={r.name}
                      row={r}
                      onToggleEquip={
                        character.isOwn ? () => void toggleEquip(r) : undefined
                      }
                      busy={togglingName === r.name}
                    />
                  ))
                )}
              </InventorySection>
            </div>
          )}
        </>
      )}
      {sheet === 'move' && (
        <TransferSheet
          supabase={supabase}
          campaignId={campaignId}
          loopNumber={loopNumber}
          actorPcId={character.id}
          others={others}
          initialDir="to-stash"
          initialAsset="item"
          onClose={() => setSheet('none')}
          onDone={() => void reload()}
        />
      )}
      {sheet === 'buy' && (
        <BuySheet
          supabase={supabase}
          campaignId={campaignId}
          loopNumber={loopNumber}
          buyerPcId={character.id}
          onClose={() => setSheet('none')}
          onDone={() => void reload()}
        />
      )}
    </div>
  )
}

function InventorySection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h2 className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
        {title}
      </h2>
      <div className="overflow-hidden rounded-lg bg-neutral-900">{children}</div>
    </div>
  )
}

function InventoryRow({
  row,
  onToggleEquip,
  busy,
}: {
  row: PcInventoryRowTg
  onToggleEquip?: () => void
  busy?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-neutral-800 px-3 py-2 last:border-0">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm text-neutral-100">{row.name}</span>
        {row.requiresAttunement && (
          <span title="Требует настройки" className="shrink-0 text-xs text-amber-400/80">
            ✦
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-mono text-sm tabular-nums text-neutral-400">
          ×{row.qty}
        </span>
        {onToggleEquip && (
          <button
            onClick={onToggleEquip}
            disabled={busy}
            className="rounded-md bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300 transition-colors hover:bg-neutral-700 disabled:opacity-50"
          >
            {busy ? '…' : row.equipped ? 'Снять' : 'Надеть'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────── spec-052 — «Мои заявки» (US1) ───────────────────────────

export function RequestsScreen({
  supabase,
  pcId,
  pcTitle,
  userId,
  categories,
  onBack,
  refreshKey,
}: {
  supabase: SupabaseClient
  pcId: string
  pcTitle: string
  userId: string
  categories: Map<string, string>
  onBack: () => void
  refreshKey: number
}) {
  const [rows, setRows] = useState<TgFeedRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setRows(await getMyPendingTg(supabase, pcId))
    } catch {
      setError('Не удалось загрузить заявки.')
    }
  }, [supabase, pcId])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const r = await getMyPendingTg(supabase, pcId)
        if (alive) setRows(r)
      } catch {
        if (alive) setError('Не удалось загрузить заявки.')
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase, pcId, refreshKey])

  // One entry per transfer (dedupe the sender/recipient legs by group).
  const seen = new Set<string>()
  const entries = (rows ?? []).filter((r) => {
    if (r.kind === 'transfer' && r.transferGroupId) {
      if (seen.has(r.transferGroupId)) return false
      seen.add(r.transferGroupId)
    }
    return true
  })

  const cancel = async (r: TgFeedRow) => {
    setError(null)
    setBusyId(r.id)
    const res =
      r.kind === 'transfer' && r.transferGroupId
        ? await deleteTransfer(r.transferGroupId)
        : await deleteTransaction(r.id)
    setBusyId(null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    await reload()
  }

  return (
    <div className="mx-auto max-w-sm pb-6">
      <BackLink onClick={onBack}>назад</BackLink>
      <h1 className="mb-3 text-lg font-semibold">Мои заявки — {pcTitle}</h1>
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
      {!rows && <Centered>Загрузка…</Centered>}
      {rows && entries.length === 0 && <Centered>Нет заявок на рассмотрении.</Centered>}
      {entries.length > 0 && (
        <div className="overflow-hidden rounded-lg bg-neutral-900">
          {entries.map((r) => (
            <RequestRow
              key={r.id}
              row={r}
              categories={categories}
              canCancel={r.authorUserId === userId}
              busy={busyId === r.id}
              onCancel={() => void cancel(r)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function RequestRow({
  row,
  categories,
  canCancel,
  busy,
  onCancel,
}: {
  row: TgFeedRow
  categories: Map<string, string>
  canCancel: boolean
  busy: boolean
  onCancel: () => void
}) {
  const label =
    row.kind === 'item'
      ? `${row.itemName ?? '—'} ×${row.itemQty}`
      : formatSignedGp(row.signedGp)
  return (
    <div className="flex items-center justify-between gap-2 border-b border-neutral-800 px-3 py-2 last:border-0">
      <div className="min-w-0">
        <div className="truncate text-sm text-neutral-100">{label}</div>
        <div className="truncate text-xs text-neutral-500">
          {categories.get(row.categorySlug) ?? row.categorySlug}
          {row.comment ? ` · ${row.comment}` : ''}
        </div>
      </div>
      {canCancel ? (
        <button
          onClick={onCancel}
          disabled={busy}
          className="shrink-0 rounded-md bg-neutral-800 px-2.5 py-1 text-xs text-red-300 transition-colors hover:bg-neutral-700 disabled:opacity-50"
        >
          {busy ? '…' : 'Отменить'}
        </button>
      ) : (
        <span className="shrink-0 text-xs text-amber-400/70">ждёт</span>
      )}
    </div>
  )
}

// ─────────────────────────── spec-052 — sets (US4) ───────────────────────────

export function SetsScreen({
  supabase,
  campaignId,
  loopNumber,
  buyerPc,
  userId,
  role,
  onBack,
  refreshKey,
}: {
  supabase: SupabaseClient
  campaignId: string
  loopNumber: number
  buyerPc: CampaignCharacter
  userId: string
  role: TgRole
  onBack: () => void
  refreshKey: number
}) {
  const [sets, setSets] = useState<CampaignSetTg[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<
    | { mode: 'none' }
    | { mode: 'create' }
    | { mode: 'edit'; set: CampaignSetTg }
    | { mode: 'buy'; set: CampaignSetTg }
  >({ mode: 'none' })
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setSets(await getCampaignSetsTg(supabase, campaignId))
    } catch {
      setError('Не удалось загрузить наборы.')
    }
  }, [supabase, campaignId])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const s = await getCampaignSetsTg(supabase, campaignId)
        if (alive) setSets(s)
      } catch {
        if (alive) setError('Не удалось загрузить наборы.')
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase, campaignId, refreshKey])

  const canManage = (s: CampaignSetTg) =>
    role === 'owner' || role === 'dm' || s.ownerUserId === userId

  const doDelete = async (id: string) => {
    setError(null)
    setBusyId(id)
    const res = await deleteSet({ campaignId, setId: id })
    setBusyId(null)
    setConfirmDelete(null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    await reload()
  }

  return (
    <div className="mx-auto max-w-sm pb-6">
      <BackLink onClick={onBack}>назад</BackLink>
      <h1 className="mb-1 text-lg font-semibold">Наборы</h1>
      <p className="mb-3 text-xs text-neutral-500">Покупатель: {buyerPc.title}</p>
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
      <button
        onClick={() => setSheet({ mode: 'create' })}
        className="mb-4 w-full rounded-lg bg-neutral-900 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-800"
      >
        + Новый набор
      </button>
      {!sets && <Centered>Загрузка…</Centered>}
      {sets && sets.length === 0 && <Centered>Пока нет наборов.</Centered>}
      {sets && sets.length > 0 && (
        <div className="space-y-2">
          {sets.map((s) => (
            <div key={s.id} className="rounded-lg bg-neutral-900 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm text-neutral-100">{s.title}</span>
                <span className="shrink-0 text-xs text-neutral-500">
                  {s.items.length} поз.
                </span>
              </div>
              <div className="mt-1 truncate text-xs text-neutral-500">
                {s.items.map((i) => `${i.name}×${i.qty}`).join(', ') || '—'}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setSheet({ mode: 'buy', set: s })}
                  className="rounded-md bg-neutral-700 px-2 py-0.5 text-xs text-neutral-100 transition-colors hover:bg-neutral-600"
                >
                  Купить
                </button>
                {canManage(s) && (
                  <>
                    <button
                      onClick={() => setSheet({ mode: 'edit', set: s })}
                      className="rounded-md bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300 transition-colors hover:bg-neutral-700"
                    >
                      Изменить
                    </button>
                    {confirmDelete === s.id ? (
                      <button
                        onClick={() => void doDelete(s.id)}
                        disabled={busyId === s.id}
                        className="rounded-md bg-red-900/40 px-2 py-0.5 text-xs text-red-300 disabled:opacity-50"
                      >
                        {busyId === s.id ? '…' : 'Точно удалить?'}
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(s.id)}
                        className="rounded-md bg-neutral-800 px-2 py-0.5 text-xs text-red-300/80 transition-colors hover:bg-neutral-700"
                      >
                        Удалить
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {(sheet.mode === 'create' || sheet.mode === 'edit') && (
        <SetEditSheet
          supabase={supabase}
          campaignId={campaignId}
          existing={sheet.mode === 'edit' ? sheet.set : null}
          onClose={() => setSheet({ mode: 'none' })}
          onDone={() => void reload()}
        />
      )}
      {sheet.mode === 'buy' && (
        <SetBuySheet
          supabase={supabase}
          campaignId={campaignId}
          loopNumber={loopNumber}
          buyerPcId={buyerPc.id}
          set={sheet.set}
          onClose={() => setSheet({ mode: 'none' })}
          onDone={() => void reload()}
        />
      )}
    </div>
  )
}

/** Shared working-copy editor for a set's item list (used by edit + buy). */
function SetItemsEditor({
  supabase,
  campaignId,
  items,
  setItems,
}: {
  supabase: SupabaseClient
  campaignId: string
  items: SetItem[]
  setItems: React.Dispatch<React.SetStateAction<SetItem[]>>
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<BuyableItemTg[]>([])

  useEffect(() => {
    const q = query.trim()
    if (!q) return
    let alive = true
    const t = setTimeout(async () => {
      try {
        const r = await searchBuyableItemsTg(supabase, campaignId, q)
        if (alive) setResults(r)
      } catch {
        if (alive) setResults([])
      }
    }, 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [query, supabase, campaignId])

  const addItem = (it: BuyableItemTg) => {
    setItems((prev) => {
      const idx = prev.findIndex((p) => p.itemNodeId === it.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 }
        return next
      }
      return [...prev, { itemNodeId: it.id, name: it.title, qty: 1 }]
    })
    setQuery('')
    setResults([])
  }
  const removeItem = (id: string) =>
    setItems((prev) => prev.filter((p) => p.itemNodeId !== id))

  return (
    <>
      {items.length > 0 && (
        <div className="rounded-lg bg-neutral-900">
          {items.map((it) => (
            <div
              key={it.itemNodeId}
              className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2 last:border-0"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-neutral-100">
                {it.name}
              </span>
              <IntInput
                className="w-14 rounded-md bg-neutral-800 px-2 py-1 text-right text-sm text-neutral-100"
                value={it.qty}
                onCommit={(q) =>
                  setItems((prev) =>
                    prev.map((p) => (p.itemNodeId === it.itemNodeId ? { ...p, qty: q } : p)),
                  )
                }
              />
              <button
                onClick={() => removeItem(it.itemNodeId)}
                className="text-xs text-neutral-500 hover:text-red-300"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <input
        className={FIELD}
        placeholder="Добавить предмет…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query.trim() !== '' && results.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-lg bg-neutral-900">
          {results.map((it) => (
            <button
              key={it.id}
              onClick={() => addItem(it)}
              className="block w-full border-b border-neutral-800 px-3 py-2 text-left text-sm text-neutral-100 last:border-0 hover:bg-neutral-800"
            >
              {it.title}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

function SetEditSheet({
  supabase,
  campaignId,
  existing,
  onClose,
  onDone,
}: {
  supabase: SupabaseClient
  campaignId: string
  existing: CampaignSetTg | null
  onClose: () => void
  onDone: () => void
}) {
  const [title, setTitle] = useState(existing?.title ?? '')
  const [items, setItems] = useState<SetItem[]>(
    existing?.items.map((i) => ({
      itemNodeId: i.itemNodeId,
      name: i.name,
      qty: i.qty,
    })) ?? [],
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    if (!title.trim()) {
      setError('Введите название')
      return
    }
    if (items.length === 0) {
      setError('Добавьте хотя бы один предмет')
      return
    }
    setBusy(true)
    const res = existing
      ? await updateSet({ campaignId, setId: existing.id, title: title.trim(), items })
      : await createSet({ campaignId, title: title.trim(), items })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onDone()
    onClose()
  }

  return (
    <Sheet title={existing ? 'Изменить набор' : 'Новый набор'} onClose={onClose}>
      <div className="space-y-3">
        <input
          className={FIELD}
          placeholder="Название набора"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <SetItemsEditor
          supabase={supabase}
          campaignId={campaignId}
          items={items}
          setItems={setItems}
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      <SubmitButton busy={busy} onClick={submit}>
        {existing ? 'Сохранить' : 'Создать'}
      </SubmitButton>
    </Sheet>
  )
}

// Edit-on-buy (C-19): buy a set with an editable working copy. Two exits — a
// one-off buy of the edited list (buyItems, no persist) or save-as a new set
// (createSet). The source set is never overwritten.
function SetBuySheet({
  supabase,
  campaignId,
  loopNumber,
  buyerPcId,
  set,
  onClose,
  onDone,
}: {
  supabase: SupabaseClient
  campaignId: string
  loopNumber: number
  buyerPcId: string
  set: CampaignSetTg
  onClose: () => void
  onDone: () => void
}) {
  const [items, setItems] = useState<SetItem[]>(
    set.items.map((i) => ({ itemNodeId: i.itemNodeId, name: i.name, qty: i.qty })),
  )
  const [funding, setFunding] = useState<'pc' | 'pc_with_stash' | 'stash'>('pc')
  const [keep, setKeep] = useState('')
  const [busy, setBusy] = useState<'none' | 'buy' | 'save'>('none')
  const [error, setError] = useState<string | null>(null)
  const [showSaveAs, setShowSaveAs] = useState(false)
  const [saveTitle, setSaveTitle] = useState(`${set.title} (копия)`)
  const [config, setConfig] = useState<Awaited<
    ReturnType<typeof getCampaignBuyConfigTg>
  > | null>(null)
  const [attrsById, setAttrsById] = useState<Map<string, BuyableItemTg>>(new Map())
  const [walletGp, setWalletGp] = useState<number | null>(null)
  const [stashGp, setStashGp] = useState<number | null>(null)

  // Config + balances once (spec-053 preview).
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [c, w, s] = await Promise.all([
          getCampaignBuyConfigTg(supabase, campaignId),
          getWalletTg(supabase, buyerPcId, loopNumber),
          getStashTg(supabase, campaignId, loopNumber),
        ])
        if (alive) {
          setConfig(c)
          setWalletGp(w.aggregateGp)
          setStashGp(s.wallet.aggregateGp)
        }
      } catch {
        /* preview is optional; buyItems prices authoritatively */
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase, campaignId, buyerPcId, loopNumber])

  // Prices for the current item ids → client-side set total (buyItems prices
  // authoritatively on the server). Reloads as the list is edited.
  const idsKey = items
    .map((i) => i.itemNodeId)
    .sort()
    .join(',')
  useEffect(() => {
    let alive = true
    const ids = idsKey ? idsKey.split(',') : []
    ;(async () => {
      try {
        const rows = await getBuyableItemsByIdsTg(supabase, campaignId, ids)
        if (alive) setAttrsById(new Map(rows.map((r) => [r.id, r])))
      } catch {
        if (alive) setAttrsById(new Map())
      }
    })()
    return () => {
      alive = false
    }
  }, [idsKey, supabase, campaignId])

  const totalGp =
    config && items.length > 0 && items.every((it) => attrsById.has(it.itemNodeId))
      ? items.reduce((sum, it) => {
          const a = attrsById.get(it.itemNodeId)!
          const unit = resolveBuyUnitPriceGp({
            priceGp: a.priceGp,
            categorySlug: a.categorySlug,
            rarity: normalizeRarity(a.rarity),
            defaults: config.defaults,
            policy: config.policy,
          })
          return unit == null ? sum : sum + unit * it.qty
        }, 0)
      : null

  const dirty =
    items.length !== set.items.length ||
    items.some((it, i) => {
      const o = set.items[i]
      return !o || o.itemNodeId !== it.itemNodeId || o.qty !== it.qty
    })

  const buyNow = async () => {
    setError(null)
    if (items.length === 0) {
      setError('Список пуст')
      return
    }
    setBusy('buy')
    const res = await buyItems({
      campaignId,
      items,
      buyerPcId,
      fundingSource: funding,
      keepGp: funding === 'pc_with_stash' ? Math.max(0, parseGp(keep) ?? 0) : undefined,
      loopNumber,
      dayInLoop: 1,
      comment: `Набор: ${set.title}`,
      // Clean set → «взят набор «title»»; edited list → ad-hoc buy, no title.
      setTitle: dirty ? undefined : set.title,
    })
    setBusy('none')
    if (!res.ok) {
      setError(res.error)
      return
    }
    onDone()
    onClose()
  }

  const saveAs = async () => {
    setError(null)
    if (!saveTitle.trim()) {
      setError('Введите название нового набора')
      return
    }
    if (items.length === 0) {
      setError('Список пуст')
      return
    }
    setBusy('save')
    const res = await createSet({ campaignId, title: saveTitle.trim(), items })
    setBusy('none')
    if (!res.ok) {
      setError(res.error)
      return
    }
    onDone()
    onClose()
  }

  return (
    <Sheet title={`Купить: ${set.title}`} onClose={onClose}>
      <div className="space-y-3">
        <SetItemsEditor
          supabase={supabase}
          campaignId={campaignId}
          items={items}
          setItems={setItems}
        />
        <SegToggle
          value={funding}
          onChange={setFunding}
          options={[
            { value: 'pc', label: 'За свои' },
            { value: 'pc_with_stash', label: 'Свои+общак' },
            { value: 'stash', label: 'Из общака' },
          ]}
        />
        <FundingPreview
          funding={funding}
          totalGp={totalGp}
          walletGp={walletGp}
          stashGp={stashGp}
          keep={keep}
          onKeep={setKeep}
        />
        {dirty && (
          <p className="text-xs text-amber-400/80">
            Список изменён — это разовая правка, исходный набор не меняется.
          </p>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      <SubmitButton busy={busy === 'buy'} onClick={buyNow}>
        Купить ({items.length} поз.)
      </SubmitButton>
      <div className="mt-2">
        {showSaveAs ? (
          <div className="space-y-2">
            <input
              className={FIELD}
              placeholder="Название нового набора"
              value={saveTitle}
              onChange={(e) => setSaveTitle(e.target.value)}
            />
            <button
              onClick={() => void saveAs()}
              disabled={busy === 'save'}
              className="w-full rounded-lg bg-neutral-800 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-700 disabled:opacity-50"
            >
              {busy === 'save' ? '…' : 'Сохранить как новый набор'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowSaveAs(true)}
            className="w-full text-center text-xs text-neutral-400 hover:text-neutral-200"
          >
            Сохранить изменения как новый набор…
          </button>
        )}
      </div>
    </Sheet>
  )
}

// ─────────────────────────── spec-055 — вылазки ───────────────────────────

/** A single editable item line (name + qty), optionally linked to a catalog
 *  node. Used by the вылазка sheets for default consumables, run consumables,
 *  and rewards. Free-typed names are allowed (US3 — new-item-as-text): the
 *  server prices only linked catalog items, free text contributes 0 зм. */
type ExpItemLine = { itemNodeId: string | null; name: string; qty: number }

/** Typeahead over the campaign catalog (searchCampaignItemsTg — every item, not
 *  just buyable, since rewards land in the общак regardless) with a free-text
 *  fallback: whatever you typed can be added as an unlinked line. Mirrors the
 *  shape of SetItemsEditor; kept separate because вылазка lines allow
 *  itemNodeId=null (free text) and non-catalog names. */
function ExpItemsEditor({
  supabase,
  campaignId,
  items,
  setItems,
  placeholder,
}: {
  supabase: SupabaseClient
  campaignId: string
  items: ExpItemLine[]
  setItems: React.Dispatch<React.SetStateAction<ExpItemLine[]>>
  placeholder: string
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ id: string; title: string }[]>([])

  useEffect(() => {
    const q = query.trim()
    if (!q) return
    let alive = true
    const t = setTimeout(async () => {
      try {
        const r = await searchCampaignItemsTg(supabase, campaignId, q)
        if (alive) setResults(r)
      } catch {
        if (alive) setResults([])
      }
    }, 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [query, supabase, campaignId])

  const addCatalog = (it: { id: string; title: string }) => {
    setItems((prev) => {
      const idx = prev.findIndex((p) => p.itemNodeId === it.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 }
        return next
      }
      return [...prev, { itemNodeId: it.id, name: it.title, qty: 1 }]
    })
    setQuery('')
    setResults([])
  }
  const addFreeText = () => {
    const name = query.trim()
    if (!name) return
    setItems((prev) => [...prev, { itemNodeId: null, name, qty: 1 }])
    setQuery('')
    setResults([])
  }
  const removeAt = (i: number) =>
    setItems((prev) => prev.filter((_, idx) => idx !== i))

  return (
    <>
      {items.length > 0 && (
        <div className="rounded-lg bg-neutral-900">
          {items.map((it, i) => (
            <div
              key={`${it.itemNodeId ?? 'txt'}-${i}`}
              className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2 last:border-0"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-neutral-100">
                {it.name}
                {!it.itemNodeId && (
                  <span className="ml-1 text-xs text-neutral-500">(без цены)</span>
                )}
              </span>
              <IntInput
                className="w-14 rounded-md bg-neutral-800 px-2 py-1 text-right text-sm text-neutral-100"
                value={it.qty}
                onCommit={(q) =>
                  setItems((prev) =>
                    prev.map((p, idx) => (idx === i ? { ...p, qty: q } : p)),
                  )
                }
              />
              <button
                onClick={() => removeAt(i)}
                className="text-xs text-neutral-500 hover:text-red-300"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <input
        className={FIELD}
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            addFreeText()
          }
        }}
      />
      {query.trim() !== '' && (
        <div className="max-h-48 overflow-y-auto rounded-lg bg-neutral-900">
          {results.map((it) => (
            <button
              key={it.id}
              onClick={() => addCatalog(it)}
              className="block w-full border-b border-neutral-800 px-3 py-2 text-left text-sm text-neutral-100 last:border-0 hover:bg-neutral-800"
            >
              {it.title}
            </button>
          ))}
          <button
            onClick={addFreeText}
            className="block w-full px-3 py-2 text-left text-xs text-neutral-400 hover:bg-neutral-800"
          >
            + Добавить «{query.trim()}» как есть
          </button>
        </div>
      )}
    </>
  )
}

// A reward «ресурс» = имя + номинал (spec-055 доработки, T2). Distinct from a
// plain reward item (ExpItemsEditor): a price is what turns a line into a
// resource, so on submit ExpeditionRunSheet find-or-creates a 'resource' catalog
// item for it. Kept separate from ExpItemsEditor so the shared items/free-text
// picker is untouched.
type ResourceRewardLine = { name: string; priceGp: number; qty: number }

function ResourceRewardEditor({
  items,
  setItems,
}: {
  items: ResourceRewardLine[]
  setItems: React.Dispatch<React.SetStateAction<ResourceRewardLine[]>>
}) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')

  const add = () => {
    const nm = name.trim()
    const p = parseGp(price)
    if (!nm || p === null) return // a resource needs a name AND a positive номинал
    setItems((prev) => [...prev, { name: nm, priceGp: p, qty: 1 }])
    setName('')
    setPrice('')
  }
  const removeAt = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i))

  return (
    <>
      {items.length > 0 && (
        <div className="mb-2 rounded-lg bg-neutral-900">
          {items.map((it, i) => (
            <div
              key={`${it.name}-${i}`}
              className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2 last:border-0"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-neutral-100">
                {it.name}
                <span className="ml-1 text-xs text-neutral-500">{it.priceGp} зм/шт</span>
              </span>
              <IntInput
                className="w-14 rounded-md bg-neutral-800 px-2 py-1 text-right text-sm text-neutral-100"
                value={it.qty}
                onCommit={(q) =>
                  setItems((prev) => prev.map((p, idx) => (idx === i ? { ...p, qty: q } : p)))
                }
              />
              <button
                onClick={() => removeAt(i)}
                className="text-xs text-neutral-500 hover:text-red-300"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          className={FIELD + ' flex-1'}
          placeholder="Ресурс (напр. «Сердце ивы»)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <input
          className="w-24 rounded-lg bg-neutral-800 px-3 py-2 text-neutral-100 outline-none placeholder:text-neutral-500 focus:ring-1 focus:ring-neutral-600"
          inputMode="decimal"
          placeholder="зм/шт"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
      </div>
      <button
        onClick={add}
        className="mt-1 w-full rounded-lg bg-neutral-800 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-neutral-700"
      >
        ＋ Добавить ресурс
      </button>
    </>
  )
}

/**
 * Resolve a reward payload the same way for both вылазка sheets (шаблон + прогон):
 * turn each «ресурс с номиналом» line into a permanent catalog item (category
 * 'resource', deduped by title via createResourceItem) and merge them into the
 * plain reward items with the resolved node id. One place → шаблон и прогон не
 * дублируют логику (spec-055 R2).
 */
async function resolveRewardItems(
  campaignId: string,
  rewardItems: ExpItemLine[],
  resourceRewards: ResourceRewardLine[],
): Promise<
  | { ok: true; items: { name: string; itemNodeId: string | null; qty: number }[] }
  | { ok: false; error: string }
> {
  const resolved: { name: string; itemNodeId: string; qty: number }[] = []
  for (const rr of resourceRewards) {
    const created = await createResourceItem({
      campaignId,
      name: rr.name,
      priceGp: rr.priceGp,
    })
    if (!created.ok) return { ok: false, error: created.error }
    resolved.push({ name: created.name, itemNodeId: created.itemNodeId, qty: rr.qty })
  }
  return {
    ok: true,
    items: [
      ...rewardItems.map((r) => ({ name: r.name, itemNodeId: r.itemNodeId, qty: r.qty })),
      ...resolved,
    ],
  }
}

/** Reward block shared by both вылазка sheets: деньги + предметы + ресурсы (с
 *  номиналом). Прогон spends/credits it now; шаблон stores it as the default the
 *  run form pre-fills. Resource lines are resolved to catalog items on submit via
 *  resolveRewardItems, not here (spec-055 R2). */
function RewardEditor({
  supabase,
  campaignId,
  money,
  setMoney,
  items,
  setItems,
  resources,
  setResources,
}: {
  supabase: SupabaseClient
  campaignId: string
  money: string
  setMoney: (v: string) => void
  items: ExpItemLine[]
  setItems: React.Dispatch<React.SetStateAction<ExpItemLine[]>>
  resources: ResourceRewardLine[]
  setResources: React.Dispatch<React.SetStateAction<ResourceRewardLine[]>>
}) {
  return (
    <>
      <input
        className={FIELD}
        inputMode="decimal"
        placeholder="Деньги, зм (необязательно)"
        value={money}
        onChange={(e) => setMoney(e.target.value)}
      />
      <div className="mt-2">
        <div className="mb-1 px-1 text-[11px] uppercase tracking-wide text-neutral-600">
          Предметы
        </div>
        <ExpItemsEditor
          supabase={supabase}
          campaignId={campaignId}
          items={items}
          setItems={setItems}
          placeholder="Добавить предмет-награду…"
        />
      </div>
      <div className="mt-2">
        <div className="mb-1 px-1 text-[11px] uppercase tracking-wide text-neutral-600">
          Ресурсы (с номиналом)
        </div>
        <ResourceRewardEditor items={resources} setItems={setResources} />
      </div>
    </>
  )
}

/** Старт (minute-of-day via <input type="time">) + длительность (ч/м; часы без
 *  верхней границы — вылазка может быть многодневной). Returns two <label>s to
 *  drop into a flex row. Shared by прогон + шаблон time sections; day-in-loop
 *  stays local to the run form (spec-055 R2). */
function StartDurationFields({
  startStr,
  setStartStr,
  durH,
  setDurH,
  durM,
  setDurM,
}: {
  startStr: string
  setStartStr: (v: string) => void
  durH: number
  setDurH: (n: number) => void
  durM: number
  setDurM: (n: number) => void
}) {
  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="px-0.5 text-[11px] text-neutral-500">Старт</span>
        <input
          type="time"
          className="rounded-md bg-neutral-800 px-2 py-1.5 text-center text-sm text-neutral-100 outline-none [color-scheme:dark] focus:ring-1 focus:ring-neutral-600"
          value={startStr}
          onChange={(e) => setStartStr(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="px-0.5 text-[11px] text-neutral-500">Длительность</span>
        <div className="flex items-center gap-1">
          <IntInput
            className="w-12 rounded-md bg-neutral-800 px-2 py-1.5 text-center text-sm text-neutral-100"
            value={durH}
            onCommit={setDurH}
          />
          <span className="text-xs text-neutral-500">ч</span>
          <IntInput
            className="w-12 rounded-md bg-neutral-800 px-2 py-1.5 text-center text-sm text-neutral-100"
            value={durM}
            onCommit={setDurM}
          />
          <span className="text-xs text-neutral-500">м</span>
        </div>
      </label>
    </>
  )
}

/** Compact multi-select of campaign PCs → the вылазка's пачка. A collapsed
 *  trigger (names/counter) opens a dark bottom-sheet with a name filter and
 *  checkbox rows; selected float to the top, own PCs first. Same props as before
 *  (Set<string>) so both run form and template roster share it (spec-055 R2 — по
 *  паттерну components/participants-picker.tsx, но в /tg-тёмной теме, не белой).
 *  The full list is a prop (already loaded), so no lazy fetch here. */
function ParticipantPicker({
  characters,
  selected,
  setSelected,
}: {
  characters: CampaignCharacter[]
  selected: Set<string>
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')

  const ordered = [...characters].sort(
    (a, b) => Number(b.isOwn) - Number(a.isOwn) || a.title.localeCompare(b.title, 'ru'),
  )
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const q = filter.trim().toLowerCase()
  const filtered = q ? ordered.filter((c) => c.title.toLowerCase().includes(q)) : ordered
  const selectedRows = filtered.filter((c) => selected.has(c.id))
  const unselectedRows = filtered.filter((c) => !selected.has(c.id))

  const count = selected.size
  const label = (() => {
    if (count === 0) return 'Выбрать участников'
    if (count <= 3) {
      const names = ordered.filter((c) => selected.has(c.id)).map((c) => c.title)
      if (names.length === count) return names.join(', ')
    }
    return `Участников: ${count}`
  })()

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-2 rounded-lg bg-neutral-800 px-3 py-2 text-left text-sm transition-colors hover:bg-neutral-700"
      >
        <span className={`min-w-0 truncate ${count === 0 ? 'text-neutral-500' : 'text-neutral-100'}`}>
          {label}
        </span>
        <span className="shrink-0 text-neutral-500">▾</span>
      </button>

      {open && (
        <>
          {/* Backdrop above the host Sheet (z-50) — tap to close the picker only. */}
          <div
            className="fixed inset-0 z-[70] bg-black/60"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className="fixed inset-x-0 bottom-0 z-[71] mx-auto flex max-h-[80vh] w-full max-w-sm flex-col rounded-t-2xl bg-neutral-900"
            role="dialog"
            aria-label="Выбор участников"
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              <div className="text-sm font-medium text-neutral-200">
                Участники · {count}/{ordered.length}
              </div>
              <div className="flex items-center gap-3">
                {count > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelected(new Set())}
                    className="text-xs text-neutral-500 transition-colors hover:text-neutral-300"
                  >
                    Очистить
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-sm text-neutral-300 transition-colors hover:text-neutral-100"
                >
                  Готово
                </button>
              </div>
            </div>
            <div className="px-4 pb-2">
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Поиск по имени…"
                className={FIELD}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
              {ordered.length === 0 && (
                <div className="px-3 py-3 text-sm text-neutral-500">В кампании нет персонажей.</div>
              )}
              {ordered.length > 0 && filtered.length === 0 && (
                <div className="px-3 py-3 text-sm text-neutral-500">Ничего не найдено.</div>
              )}
              {selectedRows.length > 0 && (
                <>
                  <div className="px-2 pt-1 text-[11px] uppercase tracking-wide text-neutral-600">
                    Выбрано
                  </div>
                  {selectedRows.map((c) => (
                    <ParticipantRow key={c.id} c={c} checked onToggle={() => toggle(c.id)} />
                  ))}
                  {unselectedRows.length > 0 && (
                    <div className="mt-2 px-2 pb-1 text-[11px] uppercase tracking-wide text-neutral-600">
                      Остальные
                    </div>
                  )}
                </>
              )}
              {unselectedRows.map((c) => (
                <ParticipantRow key={c.id} c={c} checked={false} onToggle={() => toggle(c.id)} />
              ))}
            </div>
          </div>
        </>
      )}
    </>
  )
}

function ParticipantRow({
  c,
  checked,
  onToggle,
}: {
  c: CampaignCharacter
  checked: boolean
  onToggle: () => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 hover:bg-neutral-800">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-4 w-4 accent-blue-600"
      />
      <span className="min-w-0 flex-1 truncate text-sm text-neutral-100">{c.title}</span>
      {c.isOwn && <span className="shrink-0 text-[11px] text-neutral-500">мой</span>}
    </label>
  )
}

// Menu of available expeditions (FR-001) — the feature's main screen. Any member
// curates it (add); author or DM edits/deletes. Tap a row → run it (prefilled).
export function ExpeditionsScreen({
  supabase,
  campaignId,
  loopNumber,
  characters,
  userId,
  role,
  onBack,
  refreshKey,
}: {
  supabase: SupabaseClient
  campaignId: string
  loopNumber: number
  characters: CampaignCharacter[]
  userId: string
  role: TgRole
  onBack: () => void
  refreshKey: number
}) {
  const [expeditions, setExpeditions] = useState<ExpeditionTg[] | null>(null)
  const [runs, setRuns] = useState<ExpeditionRunTg[] | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<
    | { mode: 'none' }
    | { mode: 'create' }
    | { mode: 'edit'; exp: ExpeditionTg }
    | { mode: 'run'; exp: ExpeditionTg | null }
  >({ mode: 'none' })
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setExpeditions(await listExpeditions(supabase, campaignId))
    } catch {
      setError('Не удалось загрузить вылазки.')
    }
  }, [supabase, campaignId])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const e = await listExpeditions(supabase, campaignId)
        if (alive) setExpeditions(e)
      } catch {
        if (alive) setError('Не удалось загрузить вылазки.')
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase, campaignId, refreshKey])

  // History is lazy — only fetched once the player opens it (keeps the menu light).
  useEffect(() => {
    if (!showHistory) return
    let alive = true
    ;(async () => {
      try {
        const r = await listExpeditionRuns(supabase, campaignId)
        if (alive) setRuns(r)
      } catch {
        if (alive) setRuns([])
      }
    })()
    return () => {
      alive = false
    }
  }, [showHistory, supabase, campaignId, refreshKey])

  const canManage = (e: ExpeditionTg) =>
    role === 'owner' || role === 'dm' || e.createdBy === userId

  const doDelete = async (id: string) => {
    setError(null)
    setBusyId(id)
    const res = await deleteExpedition({ id, campaignId })
    setBusyId(null)
    setConfirmDelete(null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    await reload()
  }

  const byId = new Map(characters.map((c) => [c.id, c]))

  return (
    <div className="mx-auto max-w-sm pb-6">
      <BackLink onClick={onBack}>назад</BackLink>
      <h1 className="mb-1 text-lg font-semibold">Вылазки</h1>
      <p className="mb-3 text-xs text-neutral-500">
        Выбери вылазку, чтобы сходить. Расходники спишутся с общака, награда — в общак.
      </p>
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setSheet({ mode: 'run', exp: null })}
          className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
        >
          🧭 Сходить
        </button>
        <button
          onClick={() => setSheet({ mode: 'create' })}
          className="flex-1 rounded-lg bg-neutral-900 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-800"
        >
          ＋ Вылазка
        </button>
      </div>
      {!expeditions && <Centered>Загрузка…</Centered>}
      {expeditions && expeditions.length === 0 && (
        <Centered>Пока нет вылазок в меню.</Centered>
      )}
      {expeditions && expeditions.length > 0 && (
        <div className="space-y-2">
          {expeditions.map((e) => (
            <div key={e.id} className="rounded-lg bg-neutral-900 px-3 py-2">
              <button
                onClick={() => setSheet({ mode: 'run', exp: e })}
                className="block w-full text-left"
              >
                <div className="truncate text-sm text-neutral-100">{e.title}</div>
                {e.description && (
                  <div className="mt-0.5 truncate text-xs text-neutral-500">
                    {e.description}
                  </div>
                )}
                {e.defaultConsumables.length > 0 && (
                  <div className="mt-0.5 truncate text-xs text-neutral-600">
                    расходники: {e.defaultConsumables.map((c) => `${c.name}×${c.qty}`).join(', ')}
                  </div>
                )}
              </button>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setSheet({ mode: 'run', exp: e })}
                  className="rounded-md bg-neutral-700 px-2 py-0.5 text-xs text-neutral-100 transition-colors hover:bg-neutral-600"
                >
                  Сходить
                </button>
                {canManage(e) && (
                  <>
                    <button
                      onClick={() => setSheet({ mode: 'edit', exp: e })}
                      className="rounded-md bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300 transition-colors hover:bg-neutral-700"
                    >
                      Изменить
                    </button>
                    {confirmDelete === e.id ? (
                      <button
                        onClick={() => void doDelete(e.id)}
                        disabled={busyId === e.id}
                        className="rounded-md bg-red-900/40 px-2 py-0.5 text-xs text-red-300 disabled:opacity-50"
                      >
                        {busyId === e.id ? '…' : 'Точно удалить?'}
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(e.id)}
                        className="rounded-md bg-neutral-800 px-2 py-0.5 text-xs text-red-300/80 transition-colors hover:bg-neutral-700"
                      >
                        Удалить
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* History (SC-004 audit) — compact, lazy. */}
      <button
        onClick={() => setShowHistory((v) => !v)}
        className="mt-6 w-full text-center text-xs text-neutral-400 hover:text-neutral-200"
      >
        {showHistory ? 'Скрыть историю' : 'История вылазок…'}
      </button>
      {showHistory && (
        <div className="mt-2">
          {!runs && <Centered>Загрузка…</Centered>}
          {runs && runs.length === 0 && (
            <p className="px-1 py-4 text-sm text-neutral-500">Пока не ходили.</p>
          )}
          {runs && runs.length > 0 && (
            <ul className="space-y-1">
              {runs.map((r) => {
                const who = r.participantNodeIds
                  .map((id) => byId.get(id)?.title)
                  .filter(Boolean)
                  .join(', ')
                const gains = [
                  r.rewardMoneyGp > 0 ? `+${r.rewardMoneyGp} зм` : null,
                  ...r.rewardItems.map((i) => `+${i.name}×${i.qty}`),
                ].filter(Boolean)
                return (
                  <li key={r.id} className="rounded-lg bg-neutral-900 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-neutral-300">
                        {who || 'без участников'}
                      </span>
                      <span className="shrink-0 text-xs text-neutral-600">
                        {dayLabel(r.loopNumber, r.dayInLoop)}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-neutral-500">
                      {gains.length > 0 ? gains.join(', ') : 'без добычи'}
                      {r.consumablesCostGp > 0 ? ` · −${r.consumablesCostGp} зм расходники` : ''}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {(sheet.mode === 'create' || sheet.mode === 'edit') && (
        <ExpeditionAddSheet
          supabase={supabase}
          campaignId={campaignId}
          characters={characters}
          existing={sheet.mode === 'edit' ? sheet.exp : null}
          onClose={() => setSheet({ mode: 'none' })}
          onDone={() => void reload()}
        />
      )}
      {sheet.mode === 'run' && (
        <ExpeditionRunSheet
          supabase={supabase}
          campaignId={campaignId}
          loopNumber={loopNumber}
          characters={characters}
          expedition={sheet.exp}
          onClose={() => setSheet({ mode: 'none' })}
          onDone={() => void reload()}
        />
      )}
    </div>
  )
}

// Create / edit a menu template (FR-001). Now stores the FULL default set the run
// form pre-fills (spec-055 R2): название, описание, ростер, расходники, награда
// (деньги+предметы+ресурсы) и время (старт+длительность). All are defaults, not
// locks — the run form lets the player edit every one.
function ExpeditionAddSheet({
  supabase,
  campaignId,
  characters,
  existing,
  onClose,
  onDone,
}: {
  supabase: SupabaseClient
  campaignId: string
  characters: CampaignCharacter[]
  existing: ExpeditionTg | null
  onClose: () => void
  onDone: () => void
}) {
  const [title, setTitle] = useState(existing?.title ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [roster, setRoster] = useState<Set<string>>(
    () => new Set(existing?.defaultParticipantNodeIds ?? []),
  )
  const [consumables, setConsumables] = useState<ExpItemLine[]>(
    existing?.defaultConsumables.map((c) => ({
      itemNodeId: c.itemNodeId,
      name: c.name,
      qty: c.qty,
    })) ?? [],
  )
  const [rewardItems, setRewardItems] = useState<ExpItemLine[]>(
    existing?.rewardItems.map((r) => ({
      itemNodeId: r.itemNodeId ?? null,
      name: r.name,
      qty: r.qty,
    })) ?? [],
  )
  const [rewardMoney, setRewardMoney] = useState(
    existing && existing.rewardMoneyGp > 0 ? String(existing.rewardMoneyGp) : '',
  )
  const [resourceRewards, setResourceRewards] = useState<ResourceRewardLine[]>([])
  // Time defaults: старт всегда валиден (type="time"); длительность 0 → null
  // («без дефолта»), the run form then falls back to its own 2ч.
  const [startStr, setStartStr] = useState(
    existing?.defaultStartMinute != null ? minuteToHHMM(existing.defaultStartMinute) : '08:00',
  )
  const [durH, setDurH] = useState(
    existing?.defaultDurationMinute != null ? Math.floor(existing.defaultDurationMinute / 60) : 2,
  )
  const [durM, setDurM] = useState(
    existing?.defaultDurationMinute != null ? existing.defaultDurationMinute % 60 : 0,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    if (!title.trim()) {
      setError('Введите название')
      return
    }
    const start = parseHHMM(startStr)
    if (!start) {
      setError('Укажите время старта в формате ЧЧ:ММ')
      return
    }
    setBusy(true)

    // Resources → catalog items + merge into reward items (shared with the run form).
    const resolved = await resolveRewardItems(campaignId, rewardItems, resourceRewards)
    if (!resolved.ok) {
      setBusy(false)
      setError(resolved.error)
      return
    }

    const durationMinute = Math.max(0, durH) * 60 + Math.max(0, durM)
    const common = {
      title: title.trim(),
      description: description.trim(),
      defaultParticipantNodeIds: [...roster],
      defaultConsumables: consumables,
      rewardMoneyGp: parseGp(rewardMoney) ?? 0,
      rewardItems: resolved.items,
      defaultStartMinute: hhmmToMinute(start.h, start.m),
      defaultDurationMinute: durationMinute > 0 ? durationMinute : null,
    }
    const res = existing
      ? await updateExpedition({ id: existing.id, campaignId, ...common })
      : await addExpedition({ campaignId, ...common })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onDone()
    onClose()
  }

  return (
    <Sheet title={existing ? 'Изменить вылазку' : 'Новая вылазка'} onClose={onClose}>
      <div className="space-y-3">
        <input
          className={FIELD}
          placeholder="Название (напр. «Лес»)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          className={FIELD}
          placeholder="Описание (необязательно)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div>
          <div className="mb-1 px-1 text-xs text-neutral-500">Кто ходит по умолчанию</div>
          <ParticipantPicker characters={characters} selected={roster} setSelected={setRoster} />
        </div>
        <div>
          <div className="mb-1 px-1 text-xs text-neutral-500">Расходники по умолчанию</div>
          <ExpItemsEditor
            supabase={supabase}
            campaignId={campaignId}
            items={consumables}
            setItems={setConsumables}
            placeholder="Добавить расходник…"
          />
        </div>
        <div>
          <div className="mb-1 px-1 text-xs text-neutral-500">Награда по умолчанию — в общак</div>
          <RewardEditor
            supabase={supabase}
            campaignId={campaignId}
            money={rewardMoney}
            setMoney={setRewardMoney}
            items={rewardItems}
            setItems={setRewardItems}
            resources={resourceRewards}
            setResources={setResourceRewards}
          />
        </div>
        <div>
          <div className="mb-1 px-1 text-xs text-neutral-500">Время по умолчанию</div>
          <div className="flex items-end gap-2">
            <StartDurationFields
              startStr={startStr}
              setStartStr={setStartStr}
              durH={durH}
              setDurH={setDurH}
              durM={durM}
              setDurM={setDurM}
            />
          </div>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      <SubmitButton busy={busy} onClick={submit}>
        {existing ? 'Сохранить' : 'Создать'}
      </SubmitButton>
    </Sheet>
  )
}

// The core: a ход вылазки (FR-001a). Multi-select пачка + consumables + reward
// (money + items) + target + date → runExpedition (auto-approved). Prefills from
// the chosen menu template's defaults; `expedition=null` is an ad-hoc вылазка.
function ExpeditionRunSheet({
  supabase,
  campaignId,
  loopNumber,
  characters,
  expedition,
  onClose,
  onDone,
}: {
  supabase: SupabaseClient
  campaignId: string
  loopNumber: number
  characters: CampaignCharacter[]
  expedition: ExpeditionTg | null
  onClose: () => void
  onDone: () => void
}) {
  // Every field pre-fills from the chosen template's defaults (spec-055 R2) and
  // stays fully editable — «дефолты, не локи». `expedition=null` (ad-hoc) falls
  // back to the sensible bare defaults.
  const [participants, setParticipants] = useState<Set<string>>(() => {
    // Template roster if it has one, else the caller's own PCs (common: «я сходил»).
    const roster = expedition?.defaultParticipantNodeIds ?? []
    if (roster.length > 0) return new Set(roster)
    return new Set(characters.filter((c) => c.isOwn).map((c) => c.id))
  })
  const [target, setTarget] = useState(expedition?.title ?? '')
  const [consumables, setConsumables] = useState<ExpItemLine[]>(
    expedition?.defaultConsumables.map((c) => ({
      itemNodeId: c.itemNodeId,
      name: c.name,
      qty: c.qty,
    })) ?? [],
  )
  const [rewardItems, setRewardItems] = useState<ExpItemLine[]>(
    expedition?.rewardItems.map((r) => ({
      itemNodeId: r.itemNodeId ?? null,
      name: r.name,
      qty: r.qty,
    })) ?? [],
  )
  const [rewardMoney, setRewardMoney] = useState(
    expedition && expedition.rewardMoneyGp > 0 ? String(expedition.rewardMoneyGp) : '',
  )
  const [resourceRewards, setResourceRewards] = useState<ResourceRewardLine[]>([])
  // День петли — per-run (шаблон время-суток запоминает, а день выбирают каждый раз).
  const [day, setDay] = useState(1)
  // Window (spec-055): старт = минута дня (clock <input type="time">, 0..23:59);
  // длительность = длина в часах+минутах. Часы БЕЗ верхней границы — вылазка
  // может быть многодневной («День X → День Y»), поэтому не type="time".
  const [startStr, setStartStr] = useState(
    expedition?.defaultStartMinute != null ? minuteToHHMM(expedition.defaultStartMinute) : '08:00',
  )
  const [durH, setDurH] = useState(
    expedition?.defaultDurationMinute != null
      ? Math.floor(expedition.defaultDurationMinute / 60)
      : 2,
  )
  const [durM, setDurM] = useState(
    expedition?.defaultDurationMinute != null ? expedition.defaultDurationMinute % 60 : 0,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    if (!target.trim()) {
      setError('Укажите цель вылазки')
      return
    }
    if (participants.size === 0) {
      setError('Выберите хотя бы одного участника')
      return
    }
    // Window: день + старт HH:MM + длительность HH:MM. Gate client-side with the
    // same pure validator the action re-checks, so a bad window never submits.
    const start = parseHHMM(startStr)
    if (!start) {
      setError('Укажите время старта в формате ЧЧ:ММ')
      return
    }
    const startMinute = hhmmToMinute(start.h, start.m)
    const durationMinute = Math.max(0, durH) * 60 + Math.max(0, durM)
    const win = validateExpeditionWindow({ day, startMinute, durationMinute })
    if (!win.ok) {
      setError(win.error)
      return
    }

    setBusy(true)

    // Resources → catalog items + merge into reward items (shared with the шаблон form).
    const resolved = await resolveRewardItems(campaignId, rewardItems, resourceRewards)
    if (!resolved.ok) {
      setBusy(false)
      setError(resolved.error)
      return
    }

    const res = await runExpedition({
      campaignId,
      expeditionId: expedition?.id ?? null,
      participantNodeIds: [...participants],
      target: target.trim(),
      loopNumber,
      dayInLoop: day,
      startMinute,
      durationMinute,
      consumables: consumables.map((c) => ({
        itemNodeId: c.itemNodeId,
        name: c.name,
        qty: c.qty,
      })),
      rewardMoneyGp: parseGp(rewardMoney) ?? 0,
      rewardItems: resolved.items,
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onDone()
    onClose()
  }

  return (
    <Sheet
      title={expedition ? `Вылазка: ${expedition.title}` : 'Новая вылазка'}
      onClose={onClose}
    >
      <div className="space-y-3">
        <div>
          <div className="mb-1 px-1 text-xs text-neutral-500">Кто ходил</div>
          <ParticipantPicker
            characters={characters}
            selected={participants}
            setSelected={setParticipants}
          />
        </div>
        <div>
          <div className="mb-1 px-1 text-xs text-neutral-500">Цель</div>
          <input
            className={FIELD}
            placeholder="Куда ходили (напр. «Лес»)"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </div>
        <div>
          <div className="mb-1 px-1 text-xs text-neutral-500">
            Расходники (спишутся с общака)
          </div>
          <ExpItemsEditor
            supabase={supabase}
            campaignId={campaignId}
            items={consumables}
            setItems={setConsumables}
            placeholder="Добавить расходник…"
          />
        </div>
        <div>
          <div className="mb-1 px-1 text-xs text-neutral-500">Награда — в общак</div>
          <RewardEditor
            supabase={supabase}
            campaignId={campaignId}
            money={rewardMoney}
            setMoney={setRewardMoney}
            items={rewardItems}
            setItems={setRewardItems}
            resources={resourceRewards}
            setResources={setResourceRewards}
          />
        </div>
        <div>
          <div className="mb-1 px-1 text-xs text-neutral-500">Когда</div>
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="px-0.5 text-[11px] text-neutral-500">День (1–{LOOP_DAYS})</span>
              <IntInput
                className="w-16 rounded-md bg-neutral-800 px-2 py-1.5 text-center text-sm text-neutral-100"
                value={day}
                onCommit={setDay}
              />
            </label>
            <StartDurationFields
              startStr={startStr}
              setStartStr={setStartStr}
              durH={durH}
              setDurH={setDurH}
              durM={durM}
              setDurM={setDurM}
            />
          </div>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      <SubmitButton busy={busy} onClick={submit}>
        Готово
      </SubmitButton>
    </Sheet>
  )
}

// ─────────────────────────── spec-056 — Крафт ───────────────────────────

// Catalog rarity → display label (те же английские ярлыки, что на десктопе —
// items-grouping RARITY_LABELS; map не экспортирован, локальная копия).
const CRAFT_RARITY_LABEL: Record<string, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  'very-rare': 'Very Rare',
  legendary: 'Legendary',
  artifact: 'Artifact',
}

// Разбор → схема: редкость схемы = редкость предмета + 1 ступень (spec-056 §3).
// legendary и вне-табличные (artifact, null) → null = кастомная схема; её цену
// крафта резолвит строка «Кастомная» craft_settings либо override на схеме.
const NEXT_RARITY: Record<string, RarityKey> = {
  common: 'uncommon',
  uncommon: 'rare',
  rare: 'very-rare',
  'very-rare': 'legendary',
}

function nextRarity(raw: string | null): RarityKey | null {
  return raw ? (NEXT_RARITY[raw] ?? null) : null
}

// Крафт-цена схемы — ЗЕРКАЛО серверного резолва (runCraft, plan-056 «Резолв
// цены крафта»): (1) override на схеме → (2) строка редкости ЦЕЛИ → (3)
// «Кастомная» строка, когда цели нет или её редкость вне таблицы. Редкость
// самой СХЕМЫ сюда не подставляется — сервер её не смотрит, а превью обязано
// совпадать с тем, что реально спишется.
function craftCostFor(
  schema: CraftSchemaTg,
  settings: CraftSettings,
): { workCostGp: number; minPartyLevel: number | null } {
  const row = craftRowFor(settings, craftRarityKey(schema.target?.rarity ?? null))
  return {
    workCostGp: schema.craftCostOverrideGp ?? row.workCostGp,
    minPartyLevel: row.minPartyLevel,
  }
}

/** Дефолт часов per-крафтер: поровну, округляя ВВЕРХ до 0.5 (T11). */
function roundUpHalf(h: number): number {
  return Math.ceil(h * 2) / 2
}

/** Часы для показа: до 2 знаков, без хвостовых нулей ("1.5", "2"). */
function fmtHours(h: number): string {
  return String(Math.round(h * 100) / 100)
}

// Экран «Крафт» (T10, образец ExpeditionsScreen): список известных схем
// кампании + разбор предмета + история прогонов (лениво). Настройки крафта
// приезжают тем же каналом, что цены покупки (client-read campaigns.settings);
// party_level — с текущей петли. Без уровня партии экран показывает плашку и
// не даёт открыть форму прогона (сервер это ре-чекает в runCraft).
export function CraftScreen({
  supabase,
  campaignId,
  loopNumber,
  characters,
  onBack,
  refreshKey,
}: {
  supabase: SupabaseClient
  campaignId: string
  loopNumber: number
  characters: CampaignCharacter[]
  onBack: () => void
  refreshKey: number
}) {
  const [schemas, setSchemas] = useState<CraftSchemaTg[] | null>(null)
  const [settings, setSettings] = useState<CraftSettings | null>(null)
  const [partyLevel, setPartyLevel] = useState<number | null>(null)
  const [runs, setRuns] = useState<CraftRunTg[] | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [sheet, setSheet] = useState<
    | { mode: 'none' }
    | { mode: 'run'; schema: CraftSchemaTg }
    | { mode: 'disassemble' }
  >({ mode: 'none' })

  const reload = useCallback(async () => {
    try {
      const [s, cfg, lvl] = await Promise.all([
        listSchemas(supabase, campaignId),
        getCraftSettingsTg(supabase, campaignId),
        getCurrentPartyLevelTg(supabase, campaignId),
      ])
      setSchemas(s)
      setSettings(cfg)
      setPartyLevel(lvl)
    } catch {
      setError('Не удалось загрузить крафт.')
    }
  }, [supabase, campaignId])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [s, cfg, lvl] = await Promise.all([
          listSchemas(supabase, campaignId),
          getCraftSettingsTg(supabase, campaignId),
          getCurrentPartyLevelTg(supabase, campaignId),
        ])
        if (alive) {
          setSchemas(s)
          setSettings(cfg)
          setPartyLevel(lvl)
        }
      } catch {
        if (alive) setError('Не удалось загрузить крафт.')
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase, campaignId, refreshKey])

  // History is lazy — only fetched once opened (keeps the menu light, как у вылазок).
  useEffect(() => {
    if (!showHistory) return
    let alive = true
    ;(async () => {
      try {
        const r = await listCraftRuns(supabase, campaignId)
        if (alive) setRuns(r)
      } catch {
        if (alive) setRuns([])
      }
    })()
    return () => {
      alive = false
    }
  }, [showHistory, supabase, campaignId, refreshKey])

  // Транзиентный тост успеха — в цепочке обработчика, не в эффекте (паттерн
  // StashScreen.sell; react-hooks/set-state-in-effect не задет).
  const showToast = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2500)
  }

  const byId = new Map(characters.map((c) => [c.id, c]))
  const loaded = schemas !== null && settings !== null
  const rate =
    settings && partyLevel != null ? rateForPb(settings, pbForLevel(partyLevel)) : null

  return (
    <div className="mx-auto max-w-sm pb-6">
      <BackLink onClick={onBack}>назад</BackLink>
      <h1 className="mb-1 text-lg font-semibold">Крафт</h1>
      <p className="mb-3 text-xs text-neutral-500">
        Выбери схему, чтобы скрафтить. Деньги спишутся с общака, изделие — в общак или
        персонажу.
      </p>
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      {loaded && partyLevel == null && (
        <p className="mb-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
          ДМ не задал уровень партии — крафт недоступен.
        </p>
      )}
      {loaded && partyLevel != null && rate != null && (
        <p className="mb-3 rounded-lg bg-neutral-900 px-3 py-2 text-xs text-neutral-400">
          Уровень партии {partyLevel} · БМ +{pbForLevel(partyLevel)} · ставка {rate} зм/ч
          на крафтера
        </p>
      )}

      <button
        onClick={() => setSheet({ mode: 'disassemble' })}
        className="mb-4 w-full rounded-lg bg-neutral-900 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-800"
      >
        🔩 Разобрать предмет
      </button>

      {!loaded && !error && <Centered>Загрузка…</Centered>}
      {loaded && schemas.length === 0 && (
        <Centered>Пока нет известных схем. Разбери предмет, чтобы открыть схему.</Centered>
      )}
      {loaded && schemas.length > 0 && (
        <div className="space-y-2">
          {schemas.map((s) => {
            const { workCostGp, minPartyLevel } = craftCostFor(s, settings)
            const needH = rate != null ? requiredRateHours(workCostGp, rate) : null
            const levelBlocked =
              minPartyLevel != null && partyLevel != null && partyLevel < minPartyLevel
            return (
              <button
                key={s.id}
                onClick={() => setSheet({ mode: 'run', schema: s })}
                disabled={partyLevel == null}
                className="block w-full rounded-lg bg-neutral-900 px-3 py-2 text-left transition-colors hover:bg-neutral-800 disabled:opacity-60 disabled:hover:bg-neutral-900"
              >
                <div className="truncate text-sm text-neutral-100">{s.name}</div>
                <div className="mt-0.5 truncate text-xs text-neutral-500">
                  {s.target
                    ? `→ ${s.target.name}` +
                      (s.target.rarity
                        ? ` · ${CRAFT_RARITY_LABEL[s.target.rarity] ?? s.target.rarity}`
                        : '') +
                      (s.target.requiresAttunement ? ' 🧩' : '')
                    : 'цель не указана — имя изделия спросим при крафте'}
                </div>
                <div className="mt-0.5 text-xs text-neutral-600">
                  крафт: {workCostGp} зм
                  {needH != null && Number.isFinite(needH)
                    ? ` · ~${fmtHours(needH)} ч работы`
                    : ''}
                </div>
                {levelBlocked && (
                  <div className="mt-0.5 text-xs text-amber-400/80">
                    доступно с уровня партии {minPartyLevel}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* History — compact, lazy (как у вылазок). */}
      <button
        onClick={() => setShowHistory((v) => !v)}
        className="mt-6 w-full text-center text-xs text-neutral-400 hover:text-neutral-200"
      >
        {showHistory ? 'Скрыть историю' : 'История крафта…'}
      </button>
      {showHistory && (
        <div className="mt-2">
          {!runs && <Centered>Загрузка…</Centered>}
          {runs && runs.length === 0 && (
            <p className="px-1 py-4 text-sm text-neutral-500">Пока не крафтили.</p>
          )}
          {runs && runs.length > 0 && (
            <ul className="space-y-1">
              {runs.map((r) => {
                const who = r.participants
                  .map((p) => {
                    const name = byId.get(p.nodeId)?.title
                    return name ? `${name} (${fmtHours(p.hours)} ч)` : null
                  })
                  .filter(Boolean)
                  .join(', ')
                const recipient = r.recipientNodeId
                  ? byId.get(r.recipientNodeId)?.title
                  : null
                return (
                  <li key={r.id} className="rounded-lg bg-neutral-900 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-neutral-300">
                        {r.outputItemName || 'изделие'}
                        {recipient ? ` → ${recipient}` : ''}
                      </span>
                      <span className="shrink-0 text-xs text-neutral-600">
                        {dayLabel(r.loopNumber, r.dayInLoop)}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-neutral-500">
                      {who || 'без крафтеров'}
                      {r.investedGp > 0 ? ` · −${r.investedGp} зм` : ''}
                      {r.startMinute != null ? ` · с ${minuteToHHMM(r.startMinute)}` : ''}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {sheet.mode === 'run' && settings && partyLevel != null && (
        <CraftRunSheet
          campaignId={campaignId}
          loopNumber={loopNumber}
          characters={characters}
          schema={sheet.schema}
          settings={settings}
          partyLevel={partyLevel}
          onClose={() => setSheet({ mode: 'none' })}
          onDone={(name) => {
            showToast(`🛠 ${name} — готово`)
            void reload()
          }}
        />
      )}
      {sheet.mode === 'disassemble' && (
        <DisassembleSheet
          supabase={supabase}
          campaignId={campaignId}
          loopNumber={loopNumber}
          onClose={() => setSheet({ mode: 'none' })}
          onToast={showToast}
          onRefresh={() => void reload()}
        />
      )}
      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
          <div className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
            {toast}
          </div>
        </div>
      )}
    </div>
  )
}

// Форма прогона крафта (T11, Sheet-паттерн R2). Всё редактируемо: крафтеры
// (компактный ParticipantPicker), часы per-крафтер (дефолт — требуемые часы
// поровну, вверх до 0.5; нетронутые инпуты живут на живом дефолте и
// перераспределяются при смене состава), день+старт, получатель. Превью
// «Σ ч × ставка = зм из зм» зеркалит серверный гейт 4 (missingCraftHours).
function CraftRunSheet({
  campaignId,
  loopNumber,
  characters,
  schema,
  settings,
  partyLevel,
  onClose,
  onDone,
}: {
  campaignId: string
  loopNumber: number
  characters: CampaignCharacter[]
  schema: CraftSchemaTg
  settings: CraftSettings
  partyLevel: number
  onClose: () => void
  onDone: (outputName: string) => void
}) {
  const rate = rateForPb(settings, pbForLevel(partyLevel))
  const { workCostGp, minPartyLevel } = craftCostFor(schema, settings)
  const requiredH = requiredRateHours(workCostGp, rate) // Infinity при ставке 0

  const [crafters, setCrafters] = useState<Set<string>>(
    () => new Set(characters.filter((c) => c.isOwn).map((c) => c.id)),
  )
  // Только РУЧНЫЕ правки часов; отсутствие ключа = живой дефолт «поровну».
  const [hoursEdits, setHoursEdits] = useState<Record<string, string>>({})
  // Fallback-имя изделия для схем без линка на цель (runCraft требует его).
  const [targetLabel, setTargetLabel] = useState(() =>
    schema.target ? '' : schema.name.replace(/^Схема:\s*/i, ''),
  )
  const [day, setDay] = useState(1)
  const [startStr, setStartStr] = useState('08:00')
  const [recipientMode, setRecipientMode] = useState<'stash' | 'pc'>('stash')
  const [recipientId, setRecipientId] = useState(characters[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selected = characters.filter((c) => crafters.has(c.id))
  // Мин. 0.5 ч, чтобы бесплатный крафт (workCost 0) не слал нулевые часы,
  // которые сервер отбрасывает (cleanCraftParticipants).
  const defaultShare =
    selected.length > 0 && Number.isFinite(requiredH)
      ? Math.max(0.5, roundUpHalf(requiredH / selected.length))
      : 0
  const hoursFor = (id: string): number | null => {
    const raw = hoursEdits[id]
    if (raw === undefined) return defaultShare > 0 ? defaultShare : null
    return parseGp(raw) // положительное число с точкой/запятой — тот же парс, что суммы
  }
  const totalH =
    Math.round(selected.reduce((sum, c) => sum + (hoursFor(c.id) ?? 0), 0) * 100) / 100
  const investedGp = Math.round(totalH * rate * 100) / 100
  const missingH = missingCraftHours({ workCostGp, ratePerHour: rate, totalHours: totalH })

  const submit = async () => {
    setError(null)
    if (selected.length === 0) {
      setError('Выберите хотя бы одного крафтера')
      return
    }
    const participants: { nodeId: string; hours: number }[] = []
    for (const c of selected) {
      const h = hoursFor(c.id)
      if (h == null || h <= 0) {
        setError(`Укажите часы: ${c.title}`)
        return
      }
      participants.push({ nodeId: c.id, hours: h })
    }
    const outputName = schema.target?.name ?? targetLabel.trim()
    if (!outputName) {
      setError('У схемы нет целевого предмета — укажите, что крафтим')
      return
    }
    const start = parseHHMM(startStr)
    if (!start) {
      setError('Укажите время старта в формате ЧЧ:ММ')
      return
    }
    if (day < 1 || day > LOOP_DAYS) {
      setError(`День — от 1 до ${LOOP_DAYS}`)
      return
    }
    if (recipientMode === 'pc' && !recipientId) {
      setError('Выберите получателя изделия')
      return
    }
    setBusy(true)
    const res = await runCraft({
      campaignId,
      schemaItemNodeId: schema.id,
      targetLabel: schema.target ? undefined : outputName,
      loopNumber,
      dayInLoop: day,
      startMinute: hhmmToMinute(start.h, start.m),
      participants,
      recipientNodeId: recipientMode === 'pc' ? recipientId : null,
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onDone(outputName)
    onClose()
  }

  return (
    <Sheet title={`Крафт: ${schema.target?.name ?? schema.name}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="rounded-lg bg-neutral-900 px-3 py-2 text-xs text-neutral-400">
          {schema.target && (
            <div className="truncate">
              {schema.target.name}
              {schema.target.rarity
                ? ` · ${CRAFT_RARITY_LABEL[schema.target.rarity] ?? schema.target.rarity}`
                : ''}
              {schema.target.requiresAttunement ? ' 🧩 настройка' : ''}
            </div>
          )}
          <div>
            Рабочая цена: <span className="text-neutral-200">{workCostGp} зм</span> · ставка{' '}
            {rate} зм/ч
            {Number.isFinite(requiredH) ? ` · надо ${fmtHours(requiredH)} ч` : ''}
          </div>
          {minPartyLevel != null && partyLevel < minPartyLevel && (
            <div className="mt-0.5 text-amber-400/80">
              Нужен уровень партии {minPartyLevel} (сейчас {partyLevel})
            </div>
          )}
        </div>

        {!schema.target && (
          <div>
            <div className="mb-1 px-1 text-xs text-neutral-500">Что крафтим</div>
            <input
              className={FIELD}
              placeholder="Название изделия"
              value={targetLabel}
              onChange={(e) => setTargetLabel(e.target.value)}
            />
          </div>
        )}

        <div>
          <div className="mb-1 px-1 text-xs text-neutral-500">Крафтеры</div>
          <ParticipantPicker
            characters={characters}
            selected={crafters}
            setSelected={setCrafters}
          />
        </div>

        {selected.length > 0 && (
          <div>
            <div className="mb-1 px-1 text-xs text-neutral-500">Часы на каждого</div>
            <div className="space-y-1">
              {selected.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2 rounded-lg bg-neutral-900 px-3 py-1.5"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-neutral-100">
                    {c.title}
                  </span>
                  <input
                    className="w-16 rounded-md bg-neutral-800 px-2 py-1 text-right text-sm text-neutral-100 outline-none focus:ring-1 focus:ring-neutral-600"
                    inputMode="decimal"
                    value={hoursEdits[c.id] ?? fmtHours(defaultShare)}
                    onChange={(e) =>
                      setHoursEdits((prev) => ({ ...prev, [c.id]: e.target.value }))
                    }
                  />
                  <span className="shrink-0 text-xs text-neutral-500">ч</span>
                </label>
              ))}
            </div>
            <p
              className={
                'mt-1 px-1 text-xs ' + (missingH > 0 ? 'text-red-400' : 'text-neutral-500')
              }
            >
              Σ {fmtHours(totalH)} ч × {rate} зм/ч = {investedGp} зм из {workCostGp} зм
              {missingH > 0 &&
                (missingH === Infinity
                  ? ' — ставка 0 зм/ч, крафт невозможен'
                  : ` — не хватает ${fmtHours(missingH)} ч`)}
            </p>
          </div>
        )}

        <div>
          <div className="mb-1 px-1 text-xs text-neutral-500">Когда</div>
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="px-0.5 text-[11px] text-neutral-500">День (1–{LOOP_DAYS})</span>
              <IntInput
                className="w-16 rounded-md bg-neutral-800 px-2 py-1.5 text-center text-sm text-neutral-100"
                value={day}
                onCommit={setDay}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="px-0.5 text-[11px] text-neutral-500">Старт</span>
              <input
                type="time"
                className="rounded-md bg-neutral-800 px-2 py-1.5 text-center text-sm text-neutral-100 outline-none [color-scheme:dark] focus:ring-1 focus:ring-neutral-600"
                value={startStr}
                onChange={(e) => setStartStr(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div>
          <div className="mb-1 px-1 text-xs text-neutral-500">Изделие — кому</div>
          <SegToggle
            value={recipientMode}
            onChange={setRecipientMode}
            options={[
              { value: 'stash', label: 'В общак' },
              { value: 'pc', label: 'Персонажу' },
            ]}
          />
          {recipientMode === 'pc' && (
            <select
              className={FIELD + ' mt-2'}
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
            >
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      <SubmitButton busy={busy} onClick={submit}>
        Скрафтить
      </SubmitButton>
    </Sheet>
  )
}

// Разбор предмета (T12): предмет общака (net qty>0, резолвится в каталожную
// ноду — иначе disassembleItem нечем адресовать) → подтверждение →
// disassembleItem → предложение создать схему изделия (префилл: «Схема: X»,
// линк на предмет, редкость +1) с опциональной ценой покупки — или пропустить.
function DisassembleSheet({
  supabase,
  campaignId,
  loopNumber,
  onClose,
  onToast,
  onRefresh,
}: {
  supabase: SupabaseClient
  campaignId: string
  loopNumber: number
  onClose: () => void
  onToast: (msg: string) => void
  onRefresh: () => void
}) {
  const [items, setItems] = useState<StashCraftableItemTg[] | null>(null)
  const [confirm, setConfirm] = useState<StashCraftableItemTg | null>(null)
  // Успешно разобранный предмет → фаза «создать схему» с префиллом.
  const [made, setMade] = useState<StashCraftableItemTg | null>(null)
  const [schemaName, setSchemaName] = useState('')
  const [priceStr, setPriceStr] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const list = await listDisassemblableStashItemsTg(supabase, campaignId, loopNumber)
        if (alive) setItems(list)
      } catch {
        if (alive) setItems([])
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase, campaignId, loopNumber])

  const doDisassemble = async (item: StashCraftableItemTg) => {
    setError(null)
    setBusy(true)
    const res = await disassembleItem({
      campaignId,
      itemNodeId: item.itemNodeId,
      loopNumber,
      dayInLoop: 1,
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onRefresh() // предмет уже списан — экран за шитом обновляется сразу
    setMade(item)
    setSchemaName(`Схема: ${item.name}`)
  }

  const doCreateSchema = async () => {
    if (!made) return
    setError(null)
    const name = schemaName.trim()
    if (!name) {
      setError('Укажите название схемы')
      return
    }
    let priceGp: number | null = null
    if (priceStr.trim() !== '') {
      priceGp = parseGp(priceStr)
      if (priceGp === null) {
        setError('Цена — положительное число в зм')
        return
      }
    }
    setBusy(true)
    const res = await createSchemaItem({
      campaignId,
      name,
      targetItemNodeId: made.itemNodeId,
      priceGp,
      rarity: nextRarity(made.rarity),
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onToast(`Схема готова: ${res.name}`)
    onRefresh()
    onClose()
  }

  const madeRarity = made ? nextRarity(made.rarity) : null

  return (
    <Sheet
      title={made ? 'Новая схема' : confirm ? 'Разобрать предмет?' : 'Разбор предмета'}
      onClose={onClose}
    >
      {made ? (
        <div className="space-y-3">
          <p className="text-sm text-neutral-300">
            «{made.name}» разобран (−1 из общака). Создать схему изделия?
          </p>
          <div className="rounded-lg bg-neutral-900 px-3 py-2 text-xs text-neutral-500">
            Редкость схемы:{' '}
            {madeRarity ? CRAFT_RARITY_LABEL[madeRarity] : 'кастомная'} (редкость предмета
            +1)
          </div>
          <input
            className={FIELD}
            placeholder="Название схемы"
            value={schemaName}
            onChange={(e) => setSchemaName(e.target.value)}
          />
          <input
            className={FIELD}
            inputMode="decimal"
            placeholder="Цена покупки схемы, зм (необязательно)"
            value={priceStr}
            onChange={(e) => setPriceStr(e.target.value)}
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <SubmitButton busy={busy} onClick={() => void doCreateSchema()}>
            Создать схему
          </SubmitButton>
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-neutral-800 py-2 text-sm text-neutral-400 transition-colors hover:bg-neutral-700"
          >
            Пропустить
          </button>
        </div>
      ) : confirm ? (
        <div className="space-y-3">
          <p className="text-sm text-neutral-300">
            «{confirm.name}» будет уничтожен (−1 из общака), взамен откроется крафт его
            схемы (редкость +1).
          </p>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <SubmitButton busy={busy} onClick={() => void doDisassemble(confirm)}>
            Разобрать
          </SubmitButton>
          <button
            onClick={() => setConfirm(null)}
            className="w-full rounded-lg bg-neutral-800 py-2 text-sm text-neutral-400 transition-colors hover:bg-neutral-700"
          >
            Отмена
          </button>
        </div>
      ) : (
        <>
          <p className="mb-3 text-xs text-neutral-500">
            Предметы в общаке этой петли. Разбор уничтожает предмет и открывает крафт его
            схемы.
          </p>
          {items === null && <p className="py-4 text-sm text-neutral-500">Загрузка…</p>}
          {items && items.length === 0 && (
            <p className="py-4 text-sm text-neutral-500">
              В общаке нет предметов из каталога — разобрать нечего.
            </p>
          )}
          {items && items.length > 0 && (
            <div className="space-y-1">
              {items.map((i) => (
                <button
                  key={i.itemNodeId}
                  onClick={() => {
                    setError(null)
                    setConfirm(i)
                  }}
                  className="flex w-full items-center gap-2 rounded-lg bg-neutral-900 px-3 py-2 text-left transition-colors hover:bg-neutral-800"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-neutral-100">
                    {i.name}
                  </span>
                  <span className="shrink-0 text-xs text-neutral-500">
                    ×{i.qty}
                    {i.rarity ? ` · ${CRAFT_RARITY_LABEL[i.rarity] ?? i.rarity}` : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        </>
      )}
    </Sheet>
  )
}

// ─────────────────────────── T025 — all-PC balances ───────────────────────────

export function BalancesScreen({
  supabase,
  campaignId,
  loopNumber,
  characters,
  onBack,
  onSelect,
  refreshKey,
}: {
  supabase: SupabaseClient
  campaignId: string
  loopNumber: number
  characters: CampaignCharacter[]
  onBack: () => void
  onSelect: (c: CampaignCharacter) => void
  refreshKey: number
}) {
  const [data, setData] = useState<{ rows: TgBalanceRow[]; stashGp: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await getAllBalancesTg(
          supabase,
          campaignId,
          loopNumber,
          characters.map((c) => ({ id: c.id, title: c.title, isOwn: c.isOwn })),
        )
        if (alive) setData(res)
      } catch {
        if (alive) setError('Не удалось загрузить балансы.')
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase, campaignId, loopNumber, characters, refreshKey])

  const ordered = data
    ? [...data.rows].sort(
        (a, b) => Number(b.isOwn) - Number(a.isOwn) || a.title.localeCompare(b.title, 'ru'),
      )
    : []
  const byId = new Map(characters.map((c) => [c.id, c]))

  return (
    <div className="mx-auto max-w-sm pb-6">
      <BackLink onClick={onBack}>персонажи</BackLink>
      <h1 className="mb-3 text-lg font-semibold">Балансы · п{loopNumber}</h1>
      {error && <Centered>{error}</Centered>}
      {!error && !data && <Centered>Загрузка…</Centered>}
      {data && (
        <ul className="space-y-1">
          <li className="flex items-center justify-between rounded-lg bg-neutral-900 px-3 py-2">
            <span className="text-neutral-300">Общак</span>
            <span className="font-mono tabular-nums text-neutral-200">{formatGp(data.stashGp)}</span>
          </li>
          {ordered.map((row) => {
            const c = byId.get(row.id)
            return (
              <li key={row.id}>
                <button
                  onClick={() => c && onSelect(c)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-neutral-900"
                >
                  <span className={row.isOwn ? 'font-medium' : 'text-neutral-300'}>{row.title}</span>
                  <span className="font-mono tabular-nums text-neutral-300">
                    {formatGp(row.aggregateGp)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ─────────────────────────── T026/T027 — starter equipment ───────────────────────────

type EquipRow =
  | { clientId: string; type: 'item'; itemName: string; itemNodeId?: string; qty: number }
  | { clientId: string; type: 'money'; amountGp: number }

export function StarterEquipScreen({
  supabase,
  campaignId,
  loopNumber,
  character,
  onBack,
  refreshKey,
}: {
  supabase: SupabaseClient
  campaignId: string
  loopNumber: number
  character: CampaignCharacter
  onBack: () => void
  refreshKey: number
}) {
  const [rows, setRows] = useState<EquipRow[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ q: string; items: { id: string; title: string }[] }>({
    q: '',
    items: [],
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<number | null>(null)
  // feedback #4: current inventory + once-per-loop credit
  const [holdings, setHoldings] = useState<{ name: string; qty: number }[] | null>(null)
  const [creditTaken, setCreditTaken] = useState<boolean | null>(null)
  const [creditBusy, setCreditBusy] = useState(false)
  const [creditMsg, setCreditMsg] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [h, taken] = await Promise.all([
          getPcItemHoldingsTg(supabase, character.id, loopNumber),
          hasLoopCreditTg(supabase, campaignId, character.id, loopNumber),
        ])
        if (alive) {
          setHoldings(h)
          setCreditTaken(taken)
        }
      } catch {
        if (alive) {
          setHoldings([])
          setCreditTaken(false)
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase, campaignId, character.id, loopNumber, refreshKey])

  // Debounced catalog typeahead. Results are tagged with the query they belong
  // to, so a changed query shows nothing stale until the new search resolves.
  useEffect(() => {
    const q = query.trim()
    if (!q) return
    let alive = true
    const t = setTimeout(async () => {
      try {
        const r = await searchCampaignItemsTg(supabase, campaignId, q, 8)
        if (alive) setResults({ q, items: r })
      } catch {
        if (alive) setResults({ q, items: [] })
      }
    }, 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [query, supabase, campaignId])

  const shownResults = results.q === query.trim() ? results.items : []

  const addCatalogItem = (it: { id: string; title: string }) => {
    setRows((rs) => [
      ...rs,
      { clientId: crypto.randomUUID(), type: 'item', itemName: it.title, itemNodeId: it.id, qty: 1 },
    ])
    setQuery('')
  }
  const addFreeItem = () => {
    const name = query.trim()
    if (!name) return
    setRows((rs) => [
      ...rs,
      { clientId: crypto.randomUUID(), type: 'item', itemName: name, qty: 1 },
    ])
    setQuery('')
  }
  const addMoney = () =>
    setRows((rs) => [...rs, { clientId: crypto.randomUUID(), type: 'money', amountGp: 0 }])
  const removeRow = (id: string) => setRows((rs) => rs.filter((r) => r.clientId !== id))

  const takeCredit = async () => {
    if (creditTaken !== false || creditBusy) return
    setCreditBusy(true)
    setCreditMsg(null)
    const res = await takeLoopCredit(campaignId, character.id, loopNumber)
    setCreditBusy(false)
    if (!res.ok) {
      setCreditMsg(res.error)
      if (res.error.includes('уже взят')) setCreditTaken(true)
      return
    }
    setCreditTaken(true)
    setCreditMsg(`Кредит взят: +${LOOP_CREDIT_GP} ЗМ`)
  }

  const submit = async () => {
    if (rows.length === 0) {
      setError('Добавьте хотя бы одну позицию')
      return
    }
    const items = rows.filter(
      (r): r is Extract<EquipRow, { type: 'item' }> => r.type === 'item',
    )
    const monies = rows.filter(
      (r): r is Extract<EquipRow, { type: 'money' }> => r.type === 'money',
    )
    if (items.some((r) => !r.itemName.trim() || r.qty < 1)) {
      setError('У предмета нужны название и количество')
      return
    }
    if (monies.some((r) => !(r.amountGp > 0))) {
      setError('У денег нужна сумма больше нуля')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await submitBatch({
      campaignId,
      rows: [
        ...items.map((r) => ({
          clientId: r.clientId,
          kind: 'item' as const,
          actorPcId: character.id,
          itemName: r.itemName.trim(),
          itemNodeId: r.itemNodeId,
          itemQty: r.qty,
          categorySlug: 'loot',
          comment: 'Стартовое снаряжение',
          loopNumber,
          dayInLoop: 1,
        })),
        ...monies.map((r) => ({
          clientId: r.clientId,
          kind: 'money' as const,
          actorPcId: character.id,
          amountGp: r.amountGp,
          categorySlug: 'income',
          comment: 'Стартовое золото',
          loopNumber,
          dayInLoop: 1,
        })),
      ],
    })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setSubmitted(rows.length)
    } catch {
      setError('Не удалось сохранить — попробуй ещё раз.')
    } finally {
      setBusy(false)
    }
  }

  if (submitted !== null) {
    return (
      <div className="mx-auto max-w-sm">
        <BackLink onClick={onBack}>{character.title}</BackLink>
        <Centered>
          <div>
            <div className="text-4xl">✓</div>
            <p className="mt-3">
              Записано: {submitted}. Уже в листе.
            </p>
            <button
              onClick={() => {
                setSubmitted(null)
                setRows([])
              }}
              className="mt-4 rounded-lg bg-neutral-800 px-4 py-2 text-sm text-neutral-200 transition-colors hover:bg-neutral-700"
            >
              Собрать ещё
            </button>
          </div>
        </Centered>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-sm pb-6">
      <BackLink onClick={onBack}>{character.title}</BackLink>
      <h1 className="text-lg font-semibold">Стартовое снаряжение</h1>
      <p className="mb-3 text-xs text-neutral-500">
        Собери список — он применится сразу.
      </p>

      <div className="relative">
        <input
          className={FIELD}
          placeholder="Найти предмет в каталоге…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query.trim() && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg bg-neutral-800 py-1 shadow-lg">
            {shownResults.map((it) => (
              <button
                key={it.id}
                onClick={() => addCatalogItem(it)}
                className="block w-full px-3 py-2 text-left text-sm text-neutral-200 transition-colors hover:bg-neutral-700"
              >
                {it.title}
              </button>
            ))}
            <button
              onClick={addFreeItem}
              className="block w-full px-3 py-2 text-left text-sm text-neutral-400 transition-colors hover:bg-neutral-700"
            >
              + добавить «{query.trim()}» (своё)
            </button>
          </div>
        )}
      </div>

      <button
        onClick={addMoney}
        className="mt-2 w-full rounded-lg bg-neutral-900 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-800"
      >
        + стартовое золото
      </button>

      <div className="mt-4 space-y-2">
        {rows.map((r) => (
          <div
            key={r.clientId}
            className="flex items-center gap-2 rounded-lg bg-neutral-900 px-3 py-2"
          >
            {r.type === 'item' ? (
              <>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {r.itemName || '—'}
                  {r.itemNodeId ? '' : ' · своё'}
                </span>
                <IntInput
                  className="w-14 rounded bg-neutral-800 px-2 py-1 text-center text-sm tabular-nums"
                  value={r.qty}
                  onCommit={(q) =>
                    setRows((rs) =>
                      rs.map((x) =>
                        x.clientId === r.clientId && x.type === 'item' ? { ...x, qty: q } : x,
                      ),
                    )
                  }
                />
              </>
            ) : (
              <>
                <span className="text-sm">Золото</span>
                <input
                  className="ml-auto w-20 rounded bg-neutral-800 px-2 py-1 text-right text-sm tabular-nums"
                  inputMode="decimal"
                  placeholder="зм"
                  value={r.amountGp || ''}
                  onChange={(e) => {
                    const v = parseGp(e.target.value) ?? 0
                    setRows((rs) =>
                      rs.map((x) =>
                        x.clientId === r.clientId && x.type === 'money'
                          ? { ...x, amountGp: v }
                          : x,
                      ),
                    )
                  }}
                />
              </>
            )}
            <button
              onClick={() => removeRow(r.clientId)}
              aria-label="Убрать"
              className="text-neutral-500 transition-colors hover:text-neutral-300"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      {rows.length > 0 && (
        <SubmitButton busy={busy} onClick={submit}>
          Записать
        </SubmitButton>
      )}

      {/* feedback #4: once-per-loop credit (no DM approval) */}
      <div className="mt-6 border-t border-neutral-800 pt-4">
        <button
          onClick={takeCredit}
          disabled={creditTaken !== false || creditBusy}
          className="w-full rounded-lg border border-neutral-700 py-2.5 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-900 disabled:opacity-50"
        >
          {creditBusy
            ? 'Беру…'
            : creditTaken
              ? `Кредит за петлю взят · +${LOOP_CREDIT_GP} ЗМ`
              : `Взять кредит · ${LOOP_CREDIT_GP} ЗМ`}
        </button>
        <p className="mt-1 px-1 text-xs text-neutral-500">
          Один раз за петлю.
        </p>
        {creditMsg && <p className="mt-1 px-1 text-xs text-neutral-400">{creditMsg}</p>}
      </div>

      {/* feedback #4: what the PC already has this loop */}
      <div className="mt-6">
        <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
          Уже есть
        </h2>
        {holdings === null ? (
          <p className="px-1 text-sm text-neutral-600">Загрузка…</p>
        ) : holdings.length === 0 ? (
          <p className="px-1 text-sm text-neutral-600">Пока пусто.</p>
        ) : (
          <ul className="space-y-1">
            {holdings.map((h) => (
              <li
                key={h.name}
                className="flex items-center justify-between rounded-lg bg-neutral-900 px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate text-neutral-200">{h.name}</span>
                <span className="ml-2 shrink-0 tabular-nums text-neutral-400">×{h.qty}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
