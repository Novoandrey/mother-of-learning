'use client'

/**
 * Telegram Mini App — вики заклинаний (spec-059, SC-002). Список справочника
 * заклinaний (группировка по уровню) → нода: статблок (уровень/школа/время/…)
 * + сегмент-тоггл редакции 2014/2024 → markdown-тело. По образцу wiki-app:
 * dark-native, свой мини-рендерер markdown (десктопные light-компоненты на
 * neutral-950 не переиспользуются).
 *
 * Только чтение: правок тела в /tg нет (в отличие от wiki-app, где статьи
 * редактируются) — заклинания это засеянный справочник.
 */

import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import {
  getSpellNodes,
  getSpellNode,
  type SpellListItemTg,
  type SpellNodeTg,
} from '@/lib/queries/spells-tg'
import { spellLevelLabel } from '@/lib/spell'
import { BackLink, Centered, SegToggle } from './primitives'

type Edition = '2014' | '2024'

// Заголовок группы уровня: заговоры (0) отдельно; null-уровень — в «Прочее».
function levelHeading(level: number | null): string {
  if (level === null) return 'Прочее'
  return level === 0 ? 'Заговоры' : `${level} уровень`
}

// ─────────────────────────── list screen ───────────────────────────

export function SpellListScreen({
  supabase,
  campaignId,
  onSelect,
  onBack,
}: {
  supabase: SupabaseClient
  campaignId: string
  onSelect: (item: SpellListItemTg) => void
  onBack: () => void
}) {
  const [items, setItems] = useState<SpellListItemTg[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const rows = await getSpellNodes(supabase, campaignId)
        if (alive) setItems(rows)
      } catch {
        if (alive) setError('Не удалось загрузить справочник.')
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase, campaignId])

  const shown = useMemo(() => {
    if (!items) return []
    const q = query.trim().toLocaleLowerCase('ru')
    if (!q) return items
    return items.filter((it) => it.title.toLocaleLowerCase('ru').includes(q))
  }, [items, query])

  // Группируем отсортированный (по уровню, названию) массив по уровню.
  const groups = useMemo(() => {
    const out: { level: number | null; items: SpellListItemTg[] }[] = []
    for (const s of shown) {
      const last = out[out.length - 1]
      if (last && last.level === s.level) last.items.push(s)
      else out.push({ level: s.level, items: [s] })
    }
    return out
  }, [shown])

  return (
    <div className="mx-auto max-w-sm pb-6">
      <BackLink onClick={onBack}>назад</BackLink>
      <h1 className="mb-3 text-lg font-semibold">Заклинания</h1>

      <input
        className="mb-4 w-full rounded-lg bg-neutral-800 px-3 py-2 text-neutral-100 placeholder:text-neutral-500 outline-none focus:ring-1 focus:ring-neutral-600"
        placeholder="Поиск по названию…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {error && <Centered>{error}</Centered>}
      {!error && !items && <Centered>Загрузка…</Centered>}
      {items && shown.length === 0 && (
        <p className="px-1 py-6 text-sm text-neutral-500">
          {query.trim() ? 'Ничего не нашлось.' : 'Справочник пуст.'}
        </p>
      )}
      {groups.map((g) => (
        <div key={g.level ?? 'other'} className="mb-4">
          <div className="px-1 pb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
            {levelHeading(g.level)}
          </div>
          <ul className="space-y-2">
            {g.items.map((it) => (
              <li key={it.id}>
                <button
                  onClick={() => onSelect(it)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg bg-neutral-900 px-3 py-2 text-left transition-colors hover:bg-neutral-800"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{it.title}</span>
                  {it.level !== null && (
                    <span className="shrink-0 rounded-full bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-400">
                      {spellLevelLabel(it.level)}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────── node screen ───────────────────────────

export function SpellNodeScreen({
  supabase,
  nodeId,
  title,
  onBack,
}: {
  supabase: SupabaseClient
  nodeId: string
  /** Название из строки списка — показываем сразу, до загрузки тела. */
  title: string
  onBack: () => void
}) {
  // Keyed on nodeId родителем → новая нода перемонтирует компонент с чистым
  // стейтом (без reset в эффекте — set-state-in-effect lint это запрещает).
  const [spell, setSpell] = useState<SpellNodeTg | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [edition, setEdition] = useState<Edition>('2014')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const s = await getSpellNode(supabase, nodeId)
        if (alive) setSpell(s)
      } catch {
        if (alive) setError('Не удалось загрузить заклинание.')
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase, nodeId])

  const hasV2024 = !!spell && spell.content2024.trim().length > 0
  const body = spell
    ? edition === '2024' && hasV2024
      ? spell.content2024
      : spell.content
    : ''

  return (
    <div className="mx-auto max-w-sm pb-10">
      <BackLink onClick={onBack}>заклинания</BackLink>
      <h1 className="mb-3 min-w-0 truncate text-lg font-semibold">
        {spell?.title ?? title}
      </h1>

      {error && <Centered>{error}</Centered>}
      {!error && !spell && <Centered>Загрузка…</Centered>}
      {spell && (
        <>
          <StatBlock spell={spell} />
          {hasV2024 && (
            <div className="mb-4">
              <SegToggle
                value={edition}
                onChange={setEdition}
                options={[
                  { value: '2014', label: 'Редакция 2014' },
                  { value: '2024', label: 'Редакция 2024' },
                ]}
              />
            </div>
          )}
          <Article content={body} />
        </>
      )}
    </div>
  )
}

/** Тёмный статблок: чипы (уровень/школа/концентрация/ритуал) + строки полей. */
function StatBlock({ spell }: { spell: SpellNodeTg }) {
  const chips: string[] = []
  if (spell.level !== null) chips.push(spellLevelLabel(spell.level))
  if (spell.school) chips.push(spell.school)
  if (spell.concentration) chips.push('концентрация')
  if (spell.ritual) chips.push('ритуал')

  const rows: [string, string][] = (
    [
      ['Время', spell.castingTime],
      ['Дистанция', spell.range],
      ['Компоненты', spell.components],
      ['Длительность', spell.duration],
      ['Классы', spell.classes],
      ['Источник', spell.source],
    ] as [string, string][]
  ).filter(([, v]) => v.trim() !== '')

  return (
    <div className="mb-4 rounded-2xl bg-neutral-900 p-4">
      {chips.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span
              key={c}
              className="rounded-full bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-300"
            >
              {c}
            </span>
          ))}
        </div>
      )}
      {rows.length > 0 && (
        <dl className="space-y-1.5">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-2 text-sm">
              <dt className="w-24 shrink-0 text-neutral-500">{k}</dt>
              <dd className="min-w-0 flex-1 text-neutral-200">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

/** Markdown-тело заклинания, тёмная проза. Заклинания это справочный текст —
 *  без [[wikilinks]] (в отличие от wiki-app Article). */
function Article({ content }: { content: string }) {
  if (!content.trim()) {
    return (
      <p className="px-1 py-4 text-sm italic text-neutral-500">Описание пока пустое.</p>
    )
  }
  return (
    <div className="prose prose-invert prose-sm max-w-none prose-headings:text-neutral-100 prose-a:text-blue-400 prose-strong:text-neutral-100">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}
