/**
 * Общие серверные загрузчики для экономических экшенов spec-059 (scribe,
 * spell-verbs). Вынесены из app/actions/craft.ts (там они internal — 'use server'
 * файл не может экспортировать sync-хелперы и не-server-action-функции с
 * admin-параметром). craft.ts свои копии сохраняет; здесь — единый источник для
 * новых глаголов заклинаний.
 *
 * ⚠️ Server-only: импортирует createAdminClient (service role). Импортировать
 * только из серверных экшенов, НЕ из клиентских компонентов.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentLoop } from '@/lib/loops'
import { parsePartyLevel } from '@/lib/party-level'

type Admin = ReturnType<typeof createAdminClient>

/** Нода этой кампании, или null. Гейт FK-записей от чужих id. */
export async function loadCampaignNode(
  admin: Admin,
  campaignId: string,
  nodeId: string,
): Promise<{ id: string; title: string; fields: Record<string, unknown> } | null> {
  const { data } = await admin
    .from('nodes')
    .select('id, title, fields')
    .eq('id', nodeId)
    .eq('campaign_id', campaignId)
    .maybeSingle()
  if (!data) return null
  const row = data as {
    id: string
    title: string
    fields: Record<string, unknown> | null
  }
  return { id: row.id, title: row.title, fields: row.fields ?? {} }
}

/**
 * Уровень партии ТЕКУЩЕЙ петли. `null` уровень = не задан → глагол отказывает.
 * Loop read model прячет сырые fields, поэтому тянем их по id ноды петли.
 */
export async function loadCurrentPartyLevel(
  admin: Admin,
  campaignId: string,
): Promise<
  | { ok: true; partyLevel: number; loopNumber: number }
  | { ok: false; error: string }
> {
  const loop = await getCurrentLoop(campaignId)
  if (!loop) {
    return { ok: false, error: 'Не найдена текущая петля' }
  }
  const { data } = await admin
    .from('nodes')
    .select('fields')
    .eq('id', loop.id)
    .maybeSingle()
  const fields = ((data as { fields?: Record<string, unknown> } | null)?.fields ??
    {}) as Record<string, unknown>
  const partyLevel = parsePartyLevel(fields.party_level)
  if (partyLevel == null) {
    return {
      ok: false,
      error: 'Задайте уровень партии в редактировании петли',
    }
  }
  return { ok: true, partyLevel, loopNumber: loop.number }
}

/** Валидация опциональной минуты дня (целое 0..1439), как в крафте/вылазках. */
export function coerceStartMinute(
  v: number | null | undefined,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (v == null) return { ok: true, value: null }
  const n = Math.round(v)
  if (!Number.isFinite(n) || n < 0 || n > 1439) {
    return { ok: false, error: 'Минута старта — от 0 до 1439' }
  }
  return { ok: true, value: n }
}
