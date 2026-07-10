'use client'

/**
 * Экран «Свитки» (spec-059) — /tg-флоу написания свитков. Клон CraftScreen +
 * CraftRunSheet из ledger-app.tsx, но экономика ИНАЯ (см. lib/scribe.ts):
 *
 *  · Главный экран — это ПОИСК заклинания (не список схем): дебаунс-запрос
 *    searchSpellsTg с фильтром level ≤ maxSpellLevel(party_level текущей петли).
 *    Без уровня партии — плашка и блок (сервер это ре-чекает в runScribe).
 *  · Выбор заклинания → ScribeRunSheet: писцы (мультиселект ParticipantPicker),
 *    часы per-PC (дефолт поровну), день + опц. старт, получатель (общак|PC).
 *  · Часы — ПОРОГ: Σ(часов писцов) ≥ норма таблицы для уровня. Деньги — ФИКС-
 *    цена уровня из таблицы (НЕ часы×ставка, как в крафте).
 *
 * ParticipantPicker/ParticipantRow — КОПИЯ из ledger-app.tsx: там они не
 * экспортированы, а ledger-app трогать нельзя (интеграцию в party-tab делает
 * Andrey). Копия дословная, чтобы поведение пикера совпадало с крафтом/вылазками.
 */

import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CampaignCharacter } from '@/lib/queries/campaign-characters'
import {
  getScribeSettingsTg,
  searchSpellsTg,
  listScribeRuns,
  type SpellPickTg,
  type ScribeRunTg,
} from '@/lib/queries/scribe-tg'
import { getCurrentPartyLevelTg } from '@/lib/queries/craft-tg'
import { getStashTg } from '@/lib/queries/ledger-tg'
import { maxSpellLevel } from '@/lib/party-level'
import { scribeRowFor, type ScribeSettings } from '@/lib/scribe-settings'
import { missingScribeHours } from '@/lib/scribe'
import { spellLevelLabel } from '@/lib/spell'
import { runScribe } from '@/app/actions/scribe'
import { LOOP_DAYS } from '@/lib/expedition-calendar'
import { dayLabel, formatGp } from './format'
import {
  Centered,
  BackLink,
  FIELD,
  Sheet,
  SegToggle,
  IntInput,
  SubmitButton,
  parseGp,
  parseHHMM,
  hhmmToMinute,
  minuteToHHMM,
} from './primitives'

// ─────────────────────────── local helpers ───────────────────────────

/** Дефолт часов per-писец: поровну, округляя ВВЕРХ до 0.5 (как крафт, T11). */
function roundUpHalf(h: number): number {
  return Math.ceil(h * 2) / 2
}

/** Часы для показа: до 2 знаков, без хвостовых нулей ("1.5", "2"). */
function fmtHours(h: number): string {
  return String(Math.round(h * 100) / 100)
}

// ─────────────────────────── экран ───────────────────────────

// Экран «Свитки» (образец CraftScreen): поиск заклинания + форма прогона +
// история (лениво). Настройки и party_level приезжают тем же каналом, что и в
// крафте (client-read campaigns.settings + текущая петля). Без уровня партии
// экран показывает плашку и не даёт искать/писать (runScribe это ре-чекает).
export function ScribeScreen({
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
  const [settings, setSettings] = useState<ScribeSettings | null>(null)
  const [partyLevel, setPartyLevel] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SpellPickTg[]>([])
  // Запрос, которому соответствует текущий results — чтобы «Ничего не найдено»
  // не мигало во время набора/дебаунса (пока не пришёл ответ на актуальный q).
  const [resultsFor, setResultsFor] = useState('')
  const [runs, setRuns] = useState<ScribeRunTg[] | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [localRefresh, setLocalRefresh] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [sheet, setSheet] = useState<{ mode: 'none' } | { mode: 'run'; spell: SpellPickTg }>({
    mode: 'none',
  })

  // Настройки + уровень партии — один Promise.all при монтировании и на refreshKey.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [cfg, lvl] = await Promise.all([
          getScribeSettingsTg(supabase, campaignId),
          getCurrentPartyLevelTg(supabase, campaignId),
        ])
        if (alive) {
          setSettings(cfg)
          setPartyLevel(lvl)
        }
      } catch {
        if (alive) setError('Не удалось загрузить свитки.')
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase, campaignId, refreshKey])

  // Поиск заклинаний с дебаунсом 250мс (паттерн BuySheet/SetItemsEditor). Фильтр
  // уровня ≤ maxSpellLevel(partyLevel) — зеркало серверного гейта в runScribe.
  // Заговоры (0) всегда проходят фильтр. setState — только внутри отложенного
  // колбэка (react-hooks/set-state-in-effect не задет: синхронного setState нет).
  useEffect(() => {
    const q = query.trim()
    if (!q || partyLevel == null) return
    const maxLevel = maxSpellLevel(partyLevel)
    let alive = true
    const t = setTimeout(async () => {
      try {
        const r = await searchSpellsTg(supabase, campaignId, q, maxLevel)
        if (alive) {
          setResults(r)
          setResultsFor(q)
        }
      } catch {
        if (alive) {
          setResults([])
          setResultsFor(q)
        }
      }
    }, 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [query, partyLevel, supabase, campaignId])

  // История — лениво, только когда открыта (localRefresh перезагружает её после
  // успешной записи, refreshKey — при внешнем обновлении).
  useEffect(() => {
    if (!showHistory) return
    let alive = true
    ;(async () => {
      try {
        const r = await listScribeRuns(supabase, campaignId)
        if (alive) setRuns(r)
      } catch {
        if (alive) setRuns([])
      }
    })()
    return () => {
      alive = false
    }
  }, [showHistory, supabase, campaignId, refreshKey, localRefresh])

  // Транзиентный тост успеха — в цепочке обработчика, не в эффекте
  // (react-hooks/set-state-in-effect не задет).
  const showToast = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2500)
  }

  const byId = new Map(characters.map((c) => [c.id, c]))
  const maxLevel = partyLevel != null ? maxSpellLevel(partyLevel) : null
  // Результаты рисуем только когда пришёл ответ на АКТУАЛЬНЫЙ запрос — иначе во
  // время 250мс дебаунса висели бы строки прошлого запроса и тап открывал бы не
  // то заклинание (self-review spec-059). Зеркалит `settled` из SpellPickField.
  const searchSettled = resultsFor === query.trim()

  return (
    <div className="mx-auto max-w-sm pb-6">
      <BackLink onClick={onBack}>назад</BackLink>
      <h1 className="mb-1 text-lg font-semibold">Свитки</h1>
      <p className="mb-3 text-xs text-neutral-500">
        Найди заклинание и запиши свиток. Писцы вкладывают часы, фикс-цена спишется с
        общака, свиток — в общак или персонажу.
      </p>
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      {!settings && !error && <Centered>Загрузка…</Centered>}

      {settings && partyLevel == null && (
        <p className="mb-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
          Задайте уровень партии в редактировании петли — без него свитки недоступны.
        </p>
      )}

      {settings && partyLevel != null && maxLevel != null && (
        <>
          <p className="mb-2 rounded-lg bg-neutral-900 px-3 py-2 text-xs text-neutral-400">
            Уровень партии {partyLevel} · доступны заклинания до {maxLevel} ур.
          </p>
          <input
            className={FIELD}
            placeholder="Найти заклинание…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query.trim() !== '' && (
            <div className="mt-2">
              {searchSettled && results.length > 0 ? (
                <div className="space-y-2">
                  {results.map((s) => {
                    const row = scribeRowFor(settings, s.level)
                    return (
                      <button
                        key={s.id}
                        onClick={() => setSheet({ mode: 'run', spell: s })}
                        className="block w-full rounded-lg bg-neutral-900 px-3 py-2 text-left transition-colors hover:bg-neutral-800"
                      >
                        <div className="truncate text-sm text-neutral-100">{s.title}</div>
                        <div className="mt-0.5 text-xs text-neutral-500">
                          {spellLevelLabel(s.level)} · {fmtHours(row.hours)} ч · {row.costGp} зм
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                // Пусто показываем только когда пришёл ответ на АКТУАЛЬНЫЙ запрос
                // (иначе — идёт дебаунс/поиск, ничего не рисуем, чтобы не мигать).
                searchSettled && (
                  <p className="px-1 py-3 text-sm text-neutral-500">
                    Ничего не найдено — проверьте название или уровень.
                  </p>
                )
              )}
            </div>
          )}
        </>
      )}

      {/* История — компактно, лениво (как у крафта). */}
      <button
        onClick={() => setShowHistory((v) => !v)}
        className="mt-6 w-full text-center text-xs text-neutral-400 hover:text-neutral-200"
      >
        {showHistory ? 'Скрыть историю' : 'История свитков…'}
      </button>
      {showHistory && (
        <div className="mt-2">
          {!runs && <Centered>Загрузка…</Centered>}
          {runs && runs.length === 0 && (
            <p className="px-1 py-4 text-sm text-neutral-500">Пока не писали свитков.</p>
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
                        {r.outputScrollName || 'свиток'}
                        {recipient ? ` → ${recipient}` : ''}
                      </span>
                      <span className="shrink-0 text-xs text-neutral-600">
                        {dayLabel(r.loopNumber, r.dayInLoop)}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-neutral-500">
                      {who || 'без писцов'}
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

      {sheet.mode === 'run' && settings && (
        <ScribeRunSheet
          supabase={supabase}
          campaignId={campaignId}
          loopNumber={loopNumber}
          characters={characters}
          spell={sheet.spell}
          settings={settings}
          onClose={() => setSheet({ mode: 'none' })}
          onDone={(name) => {
            showToast(`🪶 Свиток «${name}» — готово`)
            setLocalRefresh((v) => v + 1)
          }}
        />
      )}
      {toast && (
        <div className="fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4">
          <div className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
            {toast}
          </div>
        </div>
      )}
    </div>
  )
}

// Форма прогона записи (Sheet-паттерн R2 — не закрывается по бэкдропу). Всё
// редактируемо: писцы (компактный ParticipantPicker), часы per-писец (дефолт —
// норма поровну, вверх до 0.5; нетронутые инпуты живут на живом дефолте и
// перераспределяются при смене состава), день+старт, получатель. Превью
// «Σ ч из нормы» зеркалит серверный гейт 3 (missingScribeHours). Деньги —
// ФИКС-цена уровня (row.costGp), не редактируется и не зависит от часов.
function ScribeRunSheet({
  supabase,
  campaignId,
  loopNumber,
  characters,
  spell,
  settings,
  onClose,
  onDone,
}: {
  supabase: SupabaseClient
  campaignId: string
  loopNumber: number
  characters: CampaignCharacter[]
  spell: SpellPickTg
  settings: ScribeSettings
  onClose: () => void
  onDone: (spellName: string) => void
}) {
  const row = scribeRowFor(settings, spell.level)
  const requiredH = row.hours
  const costGp = Math.round(row.costGp * 100) / 100
  const label = spellLevelLabel(spell.level)

  const [scribes, setScribes] = useState<Set<string>>(
    () => new Set(characters.filter((c) => c.isOwn).map((c) => c.id)),
  )
  // Только РУЧНЫЕ правки часов; отсутствие ключа = живой дефолт «поровну».
  const [hoursEdits, setHoursEdits] = useState<Record<string, string>>({})
  const [day, setDay] = useState(1)
  const [startStr, setStartStr] = useState('08:00')
  const [recipientMode, setRecipientMode] = useState<'stash' | 'pc'>('stash')
  const [recipientId, setRecipientId] = useState(characters[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stashGp, setStashGp] = useState<number | null>(null)

  // Остаток общака — показываем, чтобы не отлупать после заполнения формы на
  // дорогих свитках (ux-аудит spec-059). Best-effort; сервер проверяет покрытие.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const s = await getStashTg(supabase, campaignId, loopNumber)
        if (alive) setStashGp(s.wallet.aggregateGp)
      } catch {
        /* остаток опционален */
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase, campaignId, loopNumber])

  const selected = characters.filter((c) => scribes.has(c.id))
  // Мин. 0.5 ч, чтобы норма 0 (если ДМ так настроил) всё равно давала писцу
  // положительные часы — сервер отбрасывает нулевые (cleanScribeParticipants).
  const defaultShare =
    selected.length > 0 ? Math.max(0.5, roundUpHalf(requiredH / selected.length)) : 0
  const hoursFor = (id: string): number | null => {
    const raw = hoursEdits[id]
    if (raw === undefined) return defaultShare > 0 ? defaultShare : null
    return parseGp(raw) // положительное число с точкой/запятой — тот же парс, что суммы
  }
  const totalH =
    Math.round(selected.reduce((sum, c) => sum + (hoursFor(c.id) ?? 0), 0) * 100) / 100
  const missingH = missingScribeHours(requiredH, totalH)

  const submit = async () => {
    setError(null)
    if (selected.length === 0) {
      setError('Выберите хотя бы одного писца')
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
    if (missingH > 0) {
      setError(`Не хватает ${fmtHours(missingH)} ч до нормы записи`)
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
      setError('Выберите получателя свитка')
      return
    }
    setBusy(true)
    const res = await runScribe({
      campaignId,
      spellNodeId: spell.id,
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
    onDone(spell.title)
    onClose()
  }

  return (
    <Sheet title={`Свиток: ${spell.title}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="rounded-lg bg-neutral-900 px-3 py-2 text-xs text-neutral-400">
          Свиток: <span className="text-neutral-200">{spell.title}</span> ({label}) ·{' '}
          {fmtHours(requiredH)} ч · −{costGp} зм
        </div>
        {stashGp != null && (
          <p
            className={
              'px-1 text-xs ' +
              (stashGp + 1e-9 < costGp ? 'text-amber-400' : 'text-neutral-500')
            }
          >
            В общаке: {formatGp(stashGp)}
            {stashGp + 1e-9 < costGp ? ' — не хватит на свиток' : ''}
          </p>
        )}

        <div>
          <div className="mb-1 px-1 text-xs text-neutral-500">Писцы</div>
          <ParticipantPicker
            characters={characters}
            selected={scribes}
            setSelected={setScribes}
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
              Σ {fmtHours(totalH)} ч из {fmtHours(requiredH)} ч
              {missingH > 0 ? ` — не хватает ${fmtHours(missingH)} ч` : ''}
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
          <div className="mb-1 px-1 text-xs text-neutral-500">Свиток — кому</div>
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
        Записать свиток
      </SubmitButton>
    </Sheet>
  )
}

// ─────────────────────────── ParticipantPicker (копия) ───────────────────────────

/** Компактный мультиселект PC кампании → писцы. Свёрнутый триггер (имена/счётчик)
 *  открывает тёмный bottom-sheet с фильтром по имени и чекбоксами; выбранные
 *  всплывают наверх, свои PC первыми. Копия из ledger-app.tsx (там не экспортирован;
 *  редактировать ledger-app нельзя). Полный список — проп (уже загружен), без
 *  ленивого фетча. Set<string> наружу — как у крафта/вылазок. */
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
    if (count === 0) return 'Выбрать писцов'
    if (count <= 3) {
      const names = ordered.filter((c) => selected.has(c.id)).map((c) => c.title)
      if (names.length === count) return names.join(', ')
    }
    return `Писцов: ${count}`
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
            aria-label="Выбор писцов"
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              <div className="text-sm font-medium text-neutral-200">
                Писцы · {count}/{ordered.length}
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
