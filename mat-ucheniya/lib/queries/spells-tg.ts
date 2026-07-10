/**
 * Read-side queries для /tg-вики заклинаний (spec-059, SC-002). Клиентские
 * RLS-запросы (Telegram-minted session): `nodes` SELECT member-wide. Только
 * чтение — правок тела заклинания в /tg нет.
 *
 * Поиск заклинаний по названию (searchSpellsTg) НЕ дублируем — он уже в
 * lib/queries/scribe-tg.ts (спелл-пикер глаголов). Здесь — список для вики
 * (весь справочник, сгруппируем по уровню на клиенте) и полная нода.
 *
 * Все запросы — `{ data, error }` + `if (error) throw`: молчаливый []
 * маскирует сбой под «нет данных» (грабля spec-058).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import { parseSpellLevel } from '../spell'

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

// ── Список ───────────────────────────────────────────────────────────────────

export type SpellListItemTg = { id: string; title: string; level: number | null }

/**
 * Все spell-ноды кампании, отсортированные по (уровень, название ru). Уровень
 * читаем из fields.level толерантным parseSpellLevel (jsonb-число или строка);
 * null-уровень (неизвестен) уезжает в хвост.
 */
export async function getSpellNodes(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<SpellListItemTg[]> {
  const { data, error } = await supabase
    .from('nodes')
    .select('id, title, fields, node_types!inner(slug)')
    .eq('campaign_id', campaignId)
    .eq('node_types.slug', 'spell')
    .order('title')
  if (error) throw error

  const rows = (data ?? []) as Array<{
    id: string
    title: string
    fields: Record<string, unknown> | null
  }>
  return rows
    .map((r) => ({
      id: r.id,
      title: r.title,
      level: parseSpellLevel((r.fields ?? {}).level),
    }))
    .sort((a, b) => {
      const la = a.level ?? 99
      const lb = b.level ?? 99
      if (la !== lb) return la - lb
      return a.title.localeCompare(b.title, 'ru')
    })
}

// ── Одна нода ────────────────────────────────────────────────────────────────

export type SpellNodeTg = {
  id: string
  title: string
  /** Тело редакции 2014 (markdown, всегда). */
  content: string
  /** Тело редакции 2024 (markdown, '' если нет — тогда переключатель прячется). */
  content2024: string
  level: number | null
  school: string
  castingTime: string
  range: string
  components: string
  duration: string
  concentration: boolean
  ritual: boolean
  classes: string
  source: string
}

/** Полная spell-нода: статблок из fields + оба тела редакций. */
export async function getSpellNode(
  supabase: SupabaseClient,
  nodeId: string,
): Promise<SpellNodeTg> {
  const { data, error } = await supabase
    .from('nodes')
    .select('id, title, content, fields, node_types!inner(slug)')
    .eq('id', nodeId)
    .single()
  if (error) throw error

  const r = data as {
    id: string
    title: string
    content: string | null
    fields: Record<string, unknown> | null
  }
  const f = r.fields ?? {}
  return {
    id: r.id,
    title: r.title,
    content: r.content ?? '',
    content2024: str(f.content_2024),
    level: parseSpellLevel(f.level),
    school: str(f.school),
    castingTime: str(f.casting_time),
    range: str(f.range),
    components: str(f.components),
    duration: str(f.duration),
    concentration: f.concentration === true,
    ritual: f.ritual === true,
    classes: str(f.classes),
    source: str(f.source),
  }
}
