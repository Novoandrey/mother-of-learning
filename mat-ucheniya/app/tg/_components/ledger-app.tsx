'use client'

import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CampaignCharacter } from '@/lib/queries/campaign-characters'
import {
  getWalletTg,
  getStashTg,
  searchCampaignItemsTg,
  getPcItemHoldingsTg,
  searchBuyableItemsTg,
  getBuyableItemsByIdsTg,
  getCampaignBuyConfigTg,
  getCampaignSetsTg,
  hasLoopCreditTg,
  type TgRole,
  type BuyableItemTg,
  type CampaignSetTg,
} from '@/lib/queries/ledger-tg'
import { formatGp, dayLabel } from './format'
import {
  Centered,
  Avatar,
  BackLink,
  FIELD,
  Sheet,
  SegToggle,
  IntInput,
  SubmitButton,
  parseGp,
  parseHHMM,
} from './primitives'
import { computeShortfall } from '@/lib/transaction-resolver'
import { submitBatch, takeLoopCredit } from '@/app/actions/transactions'
import {
  resolveBuyUnitPriceGp,
  normalizeRarity,
} from '@/lib/item-purchase-policy'
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
import { createResourceItem } from '@/app/actions/resources'
import {
  validateExpeditionWindow,
  hhmmToMinute,
  minuteToHHMM,
  LOOP_DAYS,
} from '@/lib/expedition-calendar'
import { LOOP_CREDIT_GP } from '@/lib/ledger-constants'

// ─────────────────────────── shared ───────────────────────────
// UI-примитивы (Sheet, поля, аватары…) вынесены в ./primitives.tsx
// (spec-058 W1) — shell и модули табов берут их оттуда.
//
// После spec-058 (снос легаси) здесь живут только экраны, до которых ещё
// можно дойти: CharacterList (pc-select в shell), SetsScreen и
// StarterEquipScreen (мосты legacy-sets/legacy-equip из MoreSheet),
// ExpeditionsScreen и CraftScreen (пуш-экраны таба Партия) + их шиты.

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
      <h1 className="mb-3 text-lg font-semibold">Персонажи</h1>
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

// ─────────────────────────── spec-053 — funding preview ───────────────────────────

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

  // Транзиентный тост успеха — в цепочке обработчика, не в эффекте
  // (react-hooks/set-state-in-effect не задет).
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
