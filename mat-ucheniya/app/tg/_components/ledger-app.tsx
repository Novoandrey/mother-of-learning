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
  type TgWallet,
  type TgFeedRow,
} from '@/lib/queries/ledger-tg'
import {
  formatDenoms,
  formatGp,
  formatSignedGp,
  dayLabel,
  initialOf,
  portraitUrl,
} from './format'
import { createTransaction, createTransfer } from '@/app/actions/transactions'
import { putMoneyIntoStash, takeMoneyFromStash } from '@/app/actions/stash'

// ─────────────────────────── shared ───────────────────────────

export function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 text-center text-sm text-neutral-400">
      {children}
    </div>
  )
}

function Portrait({ name, keyStr }: { name: string; keyStr: string | null }) {
  const url = portraitUrl(keyStr)
  if (url) return <img src={url} alt={name} className="block h-auto w-full" />
  return (
    <div className="flex aspect-[3/4] w-full items-center justify-center bg-neutral-700 text-6xl font-semibold text-neutral-200">
      {initialOf(name)}
    </div>
  )
}

function Avatar({ name, keyStr, size }: { name: string; keyStr: string | null; size: number }) {
  const url = portraitUrl(keyStr)
  const style = { width: size, height: size }
  if (url)
    return (
      <img src={url} alt={name} style={style} className="shrink-0 rounded-full object-cover" />
    )
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
}: {
  characters: CampaignCharacter[]
  onSelect: (c: CampaignCharacter) => void
}) {
  const own = characters.filter((c) => c.isOwn)
  const others = characters.filter((c) => !c.isOwn)

  return (
    <div className="mx-auto max-w-sm">
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
}: {
  character: CampaignCharacter
  showBack: boolean
  onBack: () => void
  onOpenLedger: () => void
}) {
  return (
    <div className="mx-auto max-w-sm">
      {showBack && <BackLink onClick={onBack}>мои персонажи</BackLink>}

      <div className="overflow-hidden rounded-2xl bg-neutral-900">
        <Portrait name={character.title} keyStr={character.primaryPortraitKey} />
        <div className="p-4">
          <div className="text-xl font-semibold">{character.title}</div>
        </div>
      </div>

      {/* Per-PC app launcher (C-04). Ledger is the only live app today. */}
      <div className="mt-4 grid grid-cols-3 gap-3">
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
        'flex aspect-square flex-col items-center justify-center gap-1 rounded-xl text-center transition-colors ' +
        (disabled
          ? 'cursor-default bg-neutral-900/50 text-neutral-600'
          : 'bg-neutral-900 text-neutral-100 hover:bg-neutral-800')
      }
    >
      <span className="text-2xl leading-none">{icon}</span>
      {label && <span className="text-xs">{label}</span>}
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
        <div className="flex items-center gap-2">
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
  tgToken,
  actorPcId,
  onClose,
  onDone,
}: {
  campaignId: string
  loopNumber: number
  tgToken: string
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
      tgToken,
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
  campaignId,
  loopNumber,
  tgToken,
  actorPcId,
  others,
  initialDir,
  onClose,
  onDone,
}: {
  campaignId: string
  loopNumber: number
  tgToken: string
  actorPcId: string
  others: CampaignCharacter[]
  initialDir: TransferDir
  onClose: () => void
  onDone: () => void
}) {
  const [dir, setDir] = useState<TransferDir>(initialDir)
  const [recipient, setRecipient] = useState<string>(others[0]?.id ?? '')
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
    if (dir === 'player' && !recipient) {
      setError('Выберите получателя')
      return
    }
    setBusy(true)
    setError(null)
    const base = {
      campaignId,
      actorPcId,
      amountGp: gp,
      comment: comment.trim(),
      loopNumber,
      dayInLoop: 1,
      tgToken,
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
            tgToken,
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
          value={dir}
          onChange={setDir}
          options={[
            { value: 'player', label: 'Игроку' },
            { value: 'to-stash', label: 'В общак' },
            { value: 'from-stash', label: 'Из общака' },
          ]}
        />
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
  tgToken,
  others,
  onBack,
  onOpenStash,
}: {
  supabase: SupabaseClient
  campaignId: string
  loopNumber: number
  character: CampaignCharacter
  tgToken: string
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
          tgToken={tgToken}
          actorPcId={character.id}
          onClose={() => setSheet('none')}
          onDone={() => void reload()}
        />
      )}
      {sheet === 'transfer' && (
        <TransferSheet
          campaignId={campaignId}
          loopNumber={loopNumber}
          tgToken={tgToken}
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
  tgToken,
  others,
  onBack,
}: {
  supabase: SupabaseClient
  campaignId: string
  loopNumber: number
  categories: Map<string, string>
  character: CampaignCharacter
  tgToken: string
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
          campaignId={campaignId}
          loopNumber={loopNumber}
          tgToken={tgToken}
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
