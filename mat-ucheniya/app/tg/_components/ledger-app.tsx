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
  hasLoopCreditTg,
  getStashItemHoldingsTg,
  type TgWallet,
  type TgFeedRow,
  type TgBalanceRow,
} from '@/lib/queries/ledger-tg'
import {
  formatDenoms,
  formatGp,
  formatSignedGp,
  dayLabel,
  initialOf,
  portraitUrl,
} from './format'
import {
  createTransaction,
  createTransfer,
  submitBatch,
  takeLoopCredit,
} from '@/app/actions/transactions'
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

function OverflowMenu({ items }: { items: { label: string; onClick: () => void }[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Меню"
        className="rounded-lg px-2 py-1 text-xl leading-none text-neutral-400 transition-colors hover:bg-neutral-900"
      >
        ⋮
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-lg bg-neutral-800 py-1 shadow-lg">
            {items.map((it) => (
              <button
                key={it.label}
                onClick={() => {
                  setOpen(false)
                  it.onClick()
                }}
                className="block w-full px-3 py-2 text-left text-sm text-neutral-200 transition-colors hover:bg-neutral-700"
              >
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────── T008 — character list ───────────────────────────

export function CharacterList({
  characters,
  onSelect,
  onOpenBalances,
}: {
  characters: CampaignCharacter[]
  onSelect: (c: CampaignCharacter) => void
  onOpenBalances?: () => void
}) {
  const own = characters.filter((c) => c.isOwn)
  const others = characters.filter((c) => !c.isOwn)

  return (
    <div className="mx-auto max-w-sm">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Персонажи</h1>
        {onOpenBalances && (
          <OverflowMenu items={[{ label: 'Балансы всех', onClick: onOpenBalances }]} />
        )}
      </div>
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
  onOpenBalances,
  onOpenEquip,
}: {
  character: CampaignCharacter
  showBack: boolean
  onBack: () => void
  onOpenLedger: () => void
  onOpenBalances?: () => void
  onOpenEquip?: () => void
}) {
  return (
    <div className="mx-auto flex h-[calc(100dvh-3rem)] max-w-sm flex-col">
      <div className="flex shrink-0 items-center justify-between">
        {showBack ? <BackLink onClick={onBack}>мои персонажи</BackLink> : <span />}
        {onOpenBalances && (
          <OverflowMenu
            items={[
              { label: 'Балансы всех', onClick: onOpenBalances },
              ...(character.isOwn && onOpenEquip
                ? [{ label: 'Стартовое снаряжение', onClick: onOpenEquip }]
                : []),
            ]}
          />
        )}
      </div>

      {/* Portrait fills the remaining height, contained — shrinks both ways so
          the screen never scrolls; the launcher stays pinned below. */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl bg-neutral-900">
        <Portrait name={character.title} keyStr={character.primaryPortraitKey} />
      </div>
      <div className="mt-2 shrink-0 text-center text-base font-semibold">{character.title}</div>

      {/* Per-PC app launcher (C-04), pinned at the bottom. */}
      <div className="mt-3 grid shrink-0 grid-cols-3 gap-2">
        <AppButton icon="🛍" label="Деньги" onClick={onOpenLedger} />
        <AppButton icon="📋" label="Лист" disabled />
        <AppButton icon="＋" label="" disabled />
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
        'flex flex-col items-center justify-center gap-0.5 rounded-xl py-2.5 text-center transition-colors ' +
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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-2xl bg-neutral-900 p-4 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="text-xl leading-none text-neutral-500">
            ✕
          </button>
        </div>
        {children}
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
  onClose,
  onDone,
}: {
  supabase: SupabaseClient
  campaignId: string
  loopNumber: number
  actorPcId: string
  others: CampaignCharacter[]
  initialDir: TransferDir
  onClose: () => void
  onDone: () => void
}) {
  const [asset, setAsset] = useState<'money' | 'item'>('money')
  const [dir, setDir] = useState<TransferDir>(initialDir)
  const [recipient, setRecipient] = useState<string>(others[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [itemName, setItemName] = useState('')
  const [qty, setQty] = useState('1')
  const [stashItems, setStashItems] = useState<{ name: string; qty: number }[] | null>(null)
  const [pickedItem, setPickedItem] = useState('')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load the общак's items for the "take" picker, on demand.
  useEffect(() => {
    if (asset !== 'item' || dir !== 'from-stash') return
    let alive = true
    ;(async () => {
      try {
        const items = await getStashItemHoldingsTg(supabase, campaignId, loopNumber)
        if (alive) {
          setStashItems(items)
          setPickedItem((p) => p || items[0]?.name || '')
        }
      } catch {
        if (alive) setStashItems([])
      }
    })()
    return () => {
      alive = false
    }
  }, [asset, dir, supabase, campaignId, loopNumber])

  const switchAsset = (a: 'money' | 'item') => {
    setAsset(a)
    if (a === 'item' && dir === 'player') setDir('to-stash')
    setError(null)
  }

  const dirOptions: { value: TransferDir; label: string }[] =
    asset === 'item'
      ? [
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
      if (dir === 'to-stash') {
        const name = itemName.trim()
        if (!name) {
          setError('Введите название предмета')
          return
        }
        setBusy(true)
        const res = await putItemIntoStash({
          campaignId,
          actorPcId,
          itemName: name,
          qty: n,
          comment: comment.trim(),
          loopNumber,
          dayInLoop: 1,
        })
        setBusy(false)
        if (!res.ok) {
          setError(res.error)
          return
        }
      } else {
        const name = pickedItem
        if (!name) {
          setError('Выберите предмет')
          return
        }
        const avail = stashItems?.find((i) => i.name === name)?.qty ?? 0
        if (n > avail) {
          setError(`В общаке только ${avail}`)
          return
        }
        setBusy(true)
        const res = await takeItemFromStash({
          campaignId,
          actorPcId,
          itemName: name,
          qty: n,
          comment: comment.trim(),
          loopNumber,
          dayInLoop: 1,
        })
        setBusy(false)
        if (!res.ok) {
          setError(res.error)
          return
        }
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

        {asset === 'money' &&
          dir === 'player' &&
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
            {dir === 'to-stash' ? (
              <input
                className={FIELD}
                placeholder="Название предмета"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
              />
            ) : stashItems === null ? (
              <p className="text-sm text-neutral-500">Загрузка…</p>
            ) : stashItems.length === 0 ? (
              <p className="text-sm text-neutral-500">В общаке нет предметов.</p>
            ) : (
              <select
                className={FIELD}
                value={pickedItem}
                onChange={(e) => setPickedItem(e.target.value)}
              >
                {stashItems.map((i) => (
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
}: {
  supabase: SupabaseClient
  campaignId: string
  loopNumber: number
  character: CampaignCharacter
  others: CampaignCharacter[]
  onBack: () => void
  onOpenStash: () => void
}) {
  const [data, setData] = useState<LedgerData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
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
  }, [supabase, campaignId, loopNumber, character.id])

  const loadMore = useCallback(async () => {
    if (!data?.nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const more = await getFeedTg(supabase, character.id, loopNumber, {
        before: data.nextCursor,
        limit: 25,
      })
      setData((d) =>
        d ? { ...d, rows: [...d.rows, ...more.rows], nextCursor: more.nextCursor } : d,
      )
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
}: {
  supabase: SupabaseClient
  campaignId: string
  loopNumber: number
  categories: Map<string, string>
  character: CampaignCharacter
  others: CampaignCharacter[]
  onBack: () => void
}) {
  const [data, setData] = useState<{ wallet: TgWallet; recent: TgFeedRow[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<'none' | 'to-stash' | 'from-stash'>('none')

  const reload = useCallback(async () => {
    const stash = await getStashTg(supabase, campaignId, loopNumber)
    setData({ wallet: stash.wallet, recent: stash.recent })
  }, [supabase, campaignId, loopNumber])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const stash = await getStashTg(supabase, campaignId, loopNumber)
        if (alive) setData({ wallet: stash.wallet, recent: stash.recent })
      } catch {
        if (alive) setError('Не удалось загрузить общак.')
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase, campaignId, loopNumber])

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
          <div className="mt-4">
            <h2 className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
              Движения
            </h2>
            <FeedList rows={data.recent} categories={categories} />
          </div>
        </>
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

// ─────────────────────────── T025 — all-PC balances ───────────────────────────

export function BalancesScreen({
  supabase,
  campaignId,
  loopNumber,
  characters,
  onBack,
  onSelect,
}: {
  supabase: SupabaseClient
  campaignId: string
  loopNumber: number
  characters: CampaignCharacter[]
  onBack: () => void
  onSelect: (c: CampaignCharacter) => void
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
  }, [supabase, campaignId, loopNumber, characters])

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
}: {
  supabase: SupabaseClient
  campaignId: string
  loopNumber: number
  character: CampaignCharacter
  onBack: () => void
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
  }, [supabase, campaignId, character.id, loopNumber])

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
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setSubmitted(rows.length)
  }

  if (submitted !== null) {
    return (
      <div className="mx-auto max-w-sm">
        <BackLink onClick={onBack}>{character.title}</BackLink>
        <Centered>
          <div>
            <div className="text-4xl">✓</div>
            <p className="mt-3">
              Отправлено: {submitted}. Ждёт одобрения ведущего — появится в листе после подтверждения.
            </p>
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
        Собери список — он уйдёт ведущему на одобрение.
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
                <input
                  className="w-14 rounded bg-neutral-800 px-2 py-1 text-center text-sm tabular-nums"
                  inputMode="numeric"
                  value={r.qty}
                  onChange={(e) => {
                    const q = Math.max(1, parseInt(e.target.value, 10) || 1)
                    setRows((rs) =>
                      rs.map((x) =>
                        x.clientId === r.clientId && x.type === 'item' ? { ...x, qty: q } : x,
                      ),
                    )
                  }}
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
          Отправить на одобрение
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
          Один раз за петлю, без одобрения ведущего.
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
