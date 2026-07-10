'use client'

/**
 * Spec-059. DM-facing editor for scribe settings (написание свитков):
 * таблица уровень заклинания (0–9) → {норма часов, фикс-цена зм}, плюс
 * hoursPerDay / hoursPerWeek (для отображения дней/недель в логе).
 * Debounced (400ms) save via updateScribeSettings — тот же паттерн, что и
 * CraftSettingsEditor.
 *
 * Отличие от крафта: ЧАСЫ — это норма-порог (Σ часов писцов ≥ норма), а
 * ДЕНЬГИ — фикс-цена из таблицы. hoursPerDay/Week — только для показа
 * дней/недель, не гейт.
 */

import { useEffect, useRef, useState } from 'react'

import { updateScribeSettings } from '@/app/c/[slug]/settings/actions'
import {
  DEFAULT_SCRIBE_SETTINGS,
  SPELL_LEVEL_KEYS,
  type ScribeRow,
  type ScribeSettings,
  type SpellLevelKey,
} from '@/lib/scribe-settings'

/** Ярлык уровня: 0 = заговор, иначе номер. */
function levelLabel(k: SpellLevelKey): string {
  return k === '0' ? 'Заговор' : k
}

/**
 * Parse a numeric cell: '' → fallback (the shipped default), invalid or
 * negative → null (reject, keep prior value) — parseCell из CraftSettingsEditor.
 */
function parseCell(raw: string, fallback: number): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return fallback
  const n = Number(trimmed)
  return Number.isFinite(n) && n >= 0 ? n : null
}

type Props = {
  campaignSlug: string
  initial: ScribeSettings
  canEdit: boolean
}

export default function ScribeSettingsEditor({
  campaignSlug,
  initial,
  canEdit,
}: Props) {
  const [settings, setSettings] = useState<ScribeSettings>(initial)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  )
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function schedulePersist(next: ScribeSettings) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (fadeRef.current) clearTimeout(fadeRef.current)
    setStatus('saving')
    debounceRef.current = setTimeout(async () => {
      const r = await updateScribeSettings(campaignSlug, next)
      if (r.ok) {
        setStatus('saved')
        setErrorMsg(null)
        fadeRef.current = setTimeout(() => setStatus('idle'), 1500)
      } else {
        setStatus('error')
        setErrorMsg(r.error)
      }
    }, 400)
  }

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (fadeRef.current) clearTimeout(fadeRef.current)
    },
    [],
  )

  function apply(next: ScribeSettings) {
    setSettings(next)
    schedulePersist(next)
  }

  function setTableCell(level: SpellLevelKey, key: keyof ScribeRow, raw: string) {
    const v = parseCell(raw, DEFAULT_SCRIBE_SETTINGS.table[level][key])
    if (v === null) return
    apply({
      ...settings,
      table: {
        ...settings.table,
        [level]: { ...settings.table[level], [key]: v },
      },
    })
  }

  function setHoursPerDay(raw: string) {
    // Делитель для отображения дней — 0 отклоняем (parser тоже требует >0).
    const v = parseCell(raw, DEFAULT_SCRIBE_SETTINGS.hoursPerDay)
    if (v === null || v === 0) return
    apply({ ...settings, hoursPerDay: v })
  }

  function setHoursPerWeek(raw: string) {
    const v = parseCell(raw, DEFAULT_SCRIBE_SETTINGS.hoursPerWeek)
    if (v === null || v === 0) return
    apply({ ...settings, hoursPerWeek: v })
  }

  const cellCls =
    'w-24 rounded border border-gray-300 bg-white px-2 py-1 text-right font-mono text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500'
  const headCls = 'border-b border-gray-200 text-left text-xs text-gray-500'

  return (
    <div className="space-y-4">
      {/* ── Таблица: уровень → {норма часов, фикс-цена} ───────────────── */}
      <div>
        <p className="mb-2 text-xs text-gray-500">
          Часы — норма записи: суммарные часы писцов должны её достигнуть.
          Цена — фиксированная стоимость записи в зм (списывается с общака),
          не часы × ставка.
        </p>
        <div className="rounded border border-gray-200 bg-white p-3">
          <table className="w-full text-sm">
            <thead>
              <tr className={headCls}>
                <th className="py-1.5 pr-2 font-medium">Уровень</th>
                <th className="py-1.5 pr-2 text-right font-medium">Часы</th>
                <th className="py-1.5 text-right font-medium">Цена, зм</th>
              </tr>
            </thead>
            <tbody>
              {SPELL_LEVEL_KEYS.map((k) => (
                <tr key={k} className="border-b border-gray-100 last:border-b-0">
                  <td className="py-1.5 pr-2 text-gray-700">{levelLabel(k)}</td>
                  <td className="py-1.5 pr-2 text-right">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={settings.table[k].hours}
                      disabled={!canEdit}
                      onChange={(e) => setTableCell(k, 'hours', e.target.value)}
                      aria-label={`Уровень ${levelLabel(k)} — норма часов`}
                      className={cellCls}
                    />
                  </td>
                  <td className="py-1.5 text-right">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={settings.table[k].costGp}
                      disabled={!canEdit}
                      onChange={(e) => setTableCell(k, 'costGp', e.target.value)}
                      aria-label={`Уровень ${levelLabel(k)} — цена, зм`}
                      className={cellCls}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Часов в дне / неделе (для показа дней/недель) ──────────────── */}
      <div className="rounded border border-gray-200 bg-white p-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-sm text-gray-700">Часов в рабочем дне</span>
            <p className="text-xs text-gray-500">
              Для отображения нормы в днях (лог, не гейт).
            </p>
          </div>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.5"
            value={settings.hoursPerDay}
            disabled={!canEdit}
            onChange={(e) => setHoursPerDay(e.target.value)}
            aria-label="Часов в рабочем дне"
            className={cellCls}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-sm text-gray-700">Часов в рабочей неделе</span>
            <p className="text-xs text-gray-500">
              Для отображения нормы в неделях (лог, не гейт).
            </p>
          </div>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.5"
            value={settings.hoursPerWeek}
            disabled={!canEdit}
            onChange={(e) => setHoursPerWeek(e.target.value)}
            aria-label="Часов в рабочей неделе"
            className={cellCls}
          />
        </div>
      </div>

      <div className="text-xs">
        {status === 'saving' && <span className="text-gray-400">Сохранение…</span>}
        {status === 'saved' && <span className="text-green-700">✓ Сохранено</span>}
        {status === 'error' && (
          <span className="text-red-700">Ошибка: {errorMsg}</span>
        )}
      </div>
    </div>
  )
}
