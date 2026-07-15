'use client'

/**
 * Шиты глаголов заклинаний таба ⚡ (spec-059) — ПЕРЕПОДГОТОВКА и КОПИРОВАНИЕ
 * в книгу. Тот же пайплайн, что action-sheets.tsx: короткая форма → превью-строка
 * → сабмит → тост. Оба — экраны 'act-*' на навигационном стеке ActionHub;
 * контракт ActionSheetProps и QUICK_ACTION_DAY переиспользуем из action-sheets
 * (не дублируем константу дня петли).
 *
 * Серверный слой — spell-verbs.ts (runReprep / runCopySpell). Числа превью
 * (цена в зм) читаются из campaigns.settings через getSpellSettingsTg + чистые
 * хелперы reprepCostGp/copyCostGp; сервер ВСЁ РАВНО пересчитывает цену и гейтит
 * уровень (maxSpellLevel(party_level)), клиентский фильтр — только для UX.
 */

import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

import { runReprep, runCopySpell } from '@/app/actions/spell-verbs'
import {
  searchSpellsTg,
  getSpellSettingsTg,
  getPcScrollHoldingsTg,
  type SpellPickTg,
  type PcScrollHoldingTg,
} from '@/lib/queries/scribe-tg'
import { getCurrentPartyLevelTg } from '@/lib/queries/craft-tg'
import { maxSpellLevel } from '@/lib/party-level'
import { reprepCostGp, copyCostGp, type SpellSettings } from '@/lib/spell-settings'
import { spellLevelLabel } from '@/lib/spell'
import { formatGp } from './format'
import { FIELD, PreviewLine, Sheet, SegToggle, SubmitButton } from './primitives'
import { QUICK_ACTION_DAY, type ActionSheetProps } from './action-sheets'

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** «−N зм» / «бесплатно» — общий хвост цены превью и тоста (заговор ур.0 → 0). */
function costTail(costGp: number | null): string {
  if (costGp == null) return ''
  return costGp === 0 ? ' · бесплатно' : ` · −${formatGp(costGp)}`
}

// ─────────────────────────── shared hooks ───────────────────────────

/**
 * Числа превью + потолок уровня заклинаний. settings → цена, maxLevel →
 * фильтр поиска. Всё best-effort: при сбое остаётся settings=null (цена в
 * превью не рисуется) и maxLevel=9 (поиск не сузит) — сервер всё равно гейтит.
 */
function useSpellConfig(supabase: SupabaseClient, campaignId: string) {
  const [settings, setSettings] = useState<SpellSettings | null>(null)
  const [partyLevel, setPartyLevel] = useState<number | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [s, pl] = await Promise.all([
          getSpellSettingsTg(supabase, campaignId),
          getCurrentPartyLevelTg(supabase, campaignId),
        ])
        if (alive) {
          setSettings(s)
          setPartyLevel(pl)
          setReady(true)
        }
      } catch {
        // превью/потолок опциональны; сервер пересчитает и проверит уровень
        if (alive) setReady(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase, campaignId])
  const maxLevel = partyLevel != null ? maxSpellLevel(partyLevel) : 9
  return { settings, maxLevel, partyLevel, ready }
}

/** Плашка потолка уровня партии (тот же ориентир, что в ScribeScreen). */
function PartyCeiling({ partyLevel, maxLevel }: { partyLevel: number; maxLevel: number }) {
  return (
    <p className="text-xs text-neutral-500">
      Уровень партии {partyLevel} · доступны заклинания до {spellLevelLabel(maxLevel)}
    </p>
  )
}

/** Амбер-блок «ДМ не задал уровень партии» — глагол недоступен (фраза для игрока). */
function NoPartyLevel({
  title,
  verb,
  onClose,
}: {
  title: string
  verb: string
  onClose: () => void
}) {
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-300">
        ДМ ещё не задал уровень партии — {verb} пока недоступно.
      </div>
    </Sheet>
  )
}

/**
 * Дебаунс-поиск заклинания по названию (250 мс, как BuySheet), фильтр
 * level ≤ maxLevel. `enabled` гасит поиск, когда ветка неактивна (копирование
 * в режиме «со свитка»). searchedQuery спарен с results — «не найдено» не мигает
 * на дебаунсе, пока не пришёл ответ по актуальному запросу.
 */
function useSpellSearch(
  supabase: SupabaseClient,
  campaignId: string,
  maxLevel: number,
  enabled: boolean,
  initialQuery = '',
) {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<SpellPickTg[]>([])
  const [searchedQuery, setSearchedQuery] = useState('')
  useEffect(() => {
    if (!enabled) return
    const q = query.trim()
    if (!q) return
    let alive = true
    const t = setTimeout(async () => {
      try {
        const r = await searchSpellsTg(supabase, campaignId, q, maxLevel)
        if (alive) {
          setResults(r)
          setSearchedQuery(q)
        }
      } catch {
        if (alive) {
          setResults([])
          setSearchedQuery(q)
        }
      }
    }, 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [enabled, query, supabase, campaignId, maxLevel])
  return { query, setQuery, results, searchedQuery }
}

// ─────────────────────────── shared bits ───────────────────────────

/** Поле поиска заклинания + выпадашка результатов + «не найдено». */
function SpellPickField({
  query,
  onQuery,
  results,
  searchedQuery,
  onPick,
  placeholder,
  autoFocus,
}: {
  query: string
  onQuery: (v: string) => void
  results: SpellPickTg[]
  searchedQuery: string
  onPick: (s: SpellPickTg) => void
  placeholder: string
  autoFocus?: boolean
}) {
  const q = query.trim()
  const settled = q !== '' && searchedQuery === q
  return (
    <>
      <input
        className={FIELD}
        placeholder={placeholder}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        autoFocus={autoFocus}
      />
      {settled && results.length > 0 && (
        <div className="max-h-60 overflow-y-auto rounded-lg bg-neutral-800">
          {results.map((s) => (
            <button
              key={s.id}
              onClick={() => onPick(s)}
              className="block w-full border-b border-neutral-700 px-3 py-2 text-left text-sm text-neutral-100 last:border-0 hover:bg-neutral-700"
            >
              {s.title} · {spellLevelLabel(s.level)}
            </button>
          ))}
        </div>
      )}
      {settled && results.length === 0 && (
        <p className="text-sm text-neutral-500">Заклинание не найдено.</p>
      )}
    </>
  )
}

/** Плашка выбранного заклинания с «сменить» (как picked-чип BuySheet). */
function PickedChip({ title, onReset }: { title: string; onReset: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-neutral-800 px-3 py-2">
      <span className="text-sm text-neutral-100">{title}</span>
      <button
        onClick={onReset}
        className="inline-flex min-h-[44px] items-center px-2 text-xs text-neutral-400 hover:text-neutral-200"
      >
        сменить
      </button>
    </div>
  )
}

/** Источник денег: кошелёк активного PC (дефолт) или общак. */
function FundingToggle({
  value,
  onChange,
}: {
  value: 'pc' | 'stash'
  onChange: (v: 'pc' | 'stash') => void
}) {
  return (
    <SegToggle
      value={value}
      onChange={onChange}
      options={[
        { value: 'pc', label: 'Кошелёк' },
        { value: 'stash', label: 'Общак' },
      ]}
    />
  )
}

// ─────────────────────────── 🔄 Переподготовка ───────────────────────────
// house-механика: меняем подготовленное заклинание на новое, деньги — с кошелька
// PC (дефолт) или общака. Старое заклинание — необязательный нарратив. Уровень
// нового ≤ maxSpellLevel(party_level) (фильтр поиска; сервер гейтит повторно).

export function ReprepSheet({ app, prefill, onClose, onDone }: ActionSheetProps) {
  const { supabase, campaignId, loopNumber, activePc } = app
  const { settings, maxLevel, partyLevel, ready } = useSpellConfig(supabase, campaignId)
  const search = useSpellSearch(supabase, campaignId, maxLevel, true, str(prefill?.query))
  const [picked, setPicked] = useState<SpellPickTg | null>(null)
  const [oldName, setOldName] = useState(() => str(prefill?.oldSpellName))
  const [funding, setFunding] = useState<'pc' | 'stash'>('pc')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Уровень партии не задан ДМ → глагол недоступен (как ScribeScreen блокирует вход).
  if (ready && partyLevel == null) {
    return <NoPartyLevel title="🔄 Переподготовка" verb="переподготовка" onClose={onClose} />
  }

  const oldPart = oldName.trim() ? `${oldName.trim()} → ` : ''
  const costGp = settings && picked ? reprepCostGp(settings, picked.level) : null
  const line = picked
    ? `🔄 ${oldPart}${picked.title} (${spellLevelLabel(picked.level)})${costTail(costGp)}`
    : null

  const submit = async () => {
    setError(null)
    if (!picked) {
      setError('Выберите новое заклинание')
      return
    }
    setBusy(true)
    const res = await runReprep({
      campaignId,
      actorPcId: activePc.id,
      newSpellNodeId: picked.id,
      oldSpellName: oldName.trim() || undefined,
      loopNumber,
      dayInLoop: QUICK_ACTION_DAY,
      funding,
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onDone(
      `🔄 ${oldPart}${picked.title} (${spellLevelLabel(picked.level)})${costTail(res.costGp)}`,
    )
    onClose()
  }

  return (
    <Sheet title="🔄 Переподготовка" onClose={onClose}>
      <div className="space-y-3">
        {partyLevel != null && <PartyCeiling partyLevel={partyLevel} maxLevel={maxLevel} />}
        {picked ? (
          <PickedChip
            title={`${picked.title} · ${spellLevelLabel(picked.level)}`}
            onReset={() => {
              setPicked(null)
              setError(null)
            }}
          />
        ) : (
          <SpellPickField
            query={search.query}
            onQuery={search.setQuery}
            results={search.results}
            searchedQuery={search.searchedQuery}
            onPick={(s) => {
              setPicked(s)
              setError(null)
            }}
            placeholder="Поиск нового заклинания…"
            autoFocus
          />
        )}

        {picked && (
          <>
            <input
              className={FIELD}
              placeholder="Старое заклинание (необязательно)"
              value={oldName}
              onChange={(e) => setOldName(e.target.value)}
            />
            <FundingToggle value={funding} onChange={setFunding} />
          </>
        )}
      </div>
      {line && <PreviewLine text={line} />}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      {picked && (
        <SubmitButton busy={busy} onClick={submit}>
          Переподготовить
        </SubmitButton>
      )}
    </Sheet>
  )
}

// ─────────────────────────── 📖 Копирование ───────────────────────────
// RAW волшебника: переписать заклинание в книгу. «Со свитка» — свиток из сумки
// PC уничтожается, заклинание+уровень берутся из него. «Из книги» — переписываем
// у кого-то (нарратив), заклинание из базы. Деньги — кошелёк PC или общак.

export function CopySheet({ app, prefill, onClose, onDone }: ActionSheetProps) {
  const { supabase, campaignId, loopNumber, activePc } = app
  const { settings, maxLevel, partyLevel, ready } = useSpellConfig(supabase, campaignId)
  const [mode, setMode] = useState<'scroll-to-book' | 'book-to-book'>('scroll-to-book')

  // Со свитка: свитки из инвентаря PC (null = грузятся).
  const [scrolls, setScrolls] = useState<PcScrollHoldingTg[] | null>(null)
  const [scrollId, setScrollId] = useState('')

  // Из книги: поиск заклинания (активен только в этом режиме) + «у кого».
  const search = useSpellSearch(
    supabase,
    campaignId,
    maxLevel,
    mode === 'book-to-book',
    str(prefill?.query),
  )
  const [pickedSpell, setPickedSpell] = useState<SpellPickTg | null>(null)
  const [sourceName, setSourceName] = useState(() => str(prefill?.sourceName))

  const [funding, setFunding] = useState<'pc' | 'stash'>('pc')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Источник свитков один — сумка активного PC (net qty > 0, категория 'scroll').
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const list = await getPcScrollHoldingsTg(supabase, campaignId, activePc.id, loopNumber)
        if (alive) {
          setScrolls(list)
          setScrollId((p) =>
            p && list.some((s) => s.itemNodeId === p) ? p : (list[0]?.itemNodeId ?? ''),
          )
        }
      } catch {
        if (alive) setScrolls([])
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase, campaignId, activePc.id, loopNumber])

  // Уровень партии не задан ДМ → глагол недоступен.
  if (ready && partyLevel == null) {
    return <NoPartyLevel title="📖 Копирование" verb="копирование" onClose={onClose} />
  }

  const scroll = scrolls?.find((s) => s.itemNodeId === scrollId) ?? null
  const level = mode === 'scroll-to-book' ? (scroll?.level ?? null) : (pickedSpell?.level ?? null)
  const spellName =
    mode === 'scroll-to-book' ? (scroll?.name ?? '') : (pickedSpell?.title ?? '')
  const costGp = settings != null && level != null ? copyCostGp(settings, level) : null
  const suffix =
    mode === 'scroll-to-book'
      ? ' (со свитка)'
      : sourceName.trim()
        ? ` у ${sourceName.trim()}`
        : ''
  const line =
    level != null && spellName
      ? `📖 ${spellName} (${spellLevelLabel(level)})${suffix}${costTail(costGp)}`
      : null

  const canSubmit = mode === 'scroll-to-book' ? scroll != null : pickedSpell != null

  const submit = async () => {
    setError(null)
    const common = {
      campaignId,
      actorPcId: activePc.id,
      loopNumber,
      dayInLoop: QUICK_ACTION_DAY,
      funding,
    }
    // Один сабмит для обоих режимов; различаются лишь идентификацией источника
    // (свиток vs заклинание из базы). Собираем payload заранее — иначе на пустой
    // выбор ругаемся до setBusy.
    const payload =
      mode === 'scroll-to-book'
        ? scroll
          ? { ...common, copyMode: 'scroll-to-book' as const, scrollItemNodeId: scroll.itemNodeId }
          : null
        : pickedSpell
          ? {
              ...common,
              copyMode: 'book-to-book' as const,
              spellNodeId: pickedSpell.id,
              sourceName: sourceName.trim() || undefined,
            }
          : null
    if (!payload) {
      setError(mode === 'scroll-to-book' ? 'Выберите свиток' : 'Выберите заклинание')
      return
    }
    setBusy(true)
    const res = await runCopySpell(payload)
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    const consumed = mode === 'scroll-to-book' ? ' · свиток израсходован' : ''
    onDone(
      `📖 ${spellName} (${spellLevelLabel(level ?? 0)})${costTail(res.costGp)}${consumed}`,
    )
    onClose()
  }

  return (
    <Sheet title="📖 Копирование" onClose={onClose}>
      <div className="space-y-3">
        {partyLevel != null && <PartyCeiling partyLevel={partyLevel} maxLevel={maxLevel} />}
        <SegToggle
          value={mode}
          onChange={(m) => {
            setMode(m)
            setError(null)
          }}
          options={[
            { value: 'scroll-to-book', label: 'Со свитка' },
            { value: 'book-to-book', label: 'Из книги' },
          ]}
        />

        {mode === 'scroll-to-book' ? (
          scrolls === null ? (
            <p className="text-sm text-neutral-500">Загрузка…</p>
          ) : scrolls.length === 0 ? (
            <p className="text-sm text-neutral-500">У тебя нет свитков для переписи.</p>
          ) : (
            <select
              className={FIELD}
              value={scrollId}
              onChange={(e) => {
                setScrollId(e.target.value)
                setError(null)
              }}
            >
              {scrolls.map((s) => (
                <option key={s.itemNodeId} value={s.itemNodeId}>
                  {s.name} ({spellLevelLabel(s.level)}, ×{s.qty})
                </option>
              ))}
            </select>
          )
        ) : pickedSpell ? (
          <PickedChip
            title={`${pickedSpell.title} · ${spellLevelLabel(pickedSpell.level)}`}
            onReset={() => {
              setPickedSpell(null)
              setError(null)
            }}
          />
        ) : (
          <SpellPickField
            query={search.query}
            onQuery={search.setQuery}
            results={search.results}
            searchedQuery={search.searchedQuery}
            onPick={(s) => {
              setPickedSpell(s)
              setError(null)
            }}
            placeholder="Поиск заклинания…"
            autoFocus
          />
        )}

        {mode === 'scroll-to-book' && scroll && (
          <p className="text-xs text-amber-400">Свиток будет израсходован (−1 из сумки).</p>
        )}

        {mode === 'book-to-book' && pickedSpell && (
          <input
            className={FIELD}
            placeholder="У кого переписываешь (необязательно)"
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
          />
        )}

        {canSubmit && <FundingToggle value={funding} onChange={setFunding} />}
      </div>
      {line && <PreviewLine text={line} />}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      {canSubmit && (
        <SubmitButton busy={busy} onClick={submit}>
          Переписать
        </SubmitButton>
      )}
    </Sheet>
  )
}
