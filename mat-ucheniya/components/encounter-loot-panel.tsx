/**
 * Spec-013 T016 — DM-facing encounter loot panel (server frame).
 *
 * Server component:
 *   - Loads the draft + summary + participant info.
 *   - Resolves panel state (`active` | `empty` | `drafting` | `applied`).
 *   - Renders the static frame + mounts the `<EncounterLootEditor>`
 *     client island.
 *
 * Hidden entirely when `encounter.status === 'active'` — loot only
 * makes sense after the fight is over (FR-010). Replaced by a
 * disabled placeholder with a hint.
 *
 * The "right column on lg+, below grid on smaller" device contract
 * is delivered by the parent layout via responsive classes; this
 * component is a self-contained block that fits either layout.
 */

import { getEncounterLootDraft } from '@/app/actions/encounter-loot'
import { getEncounterLootSummary } from '@/lib/queries/encounter-loot-summary'
import { createClient } from '@/lib/supabase/server'
import { getStashNode } from '@/lib/stash'

import { EncounterLootEditor } from './encounter-loot-editor'

export async function EncounterLootPanel({
  encounterId,
  campaignId,
}: {
  encounterId: string
  campaignId: string
}) {
  // Note: previously hid behind status==='active' (spec FR-010), but
  // status flipping has no UI affordance and DMs reasonably want to
  // distribute loot mid-fight. Panel always renders for DMs; the
  // "fight in progress" is conveyed by the tracker grid above.

  // Parallel loads: draft (lazy-creates), summary, participants, stash.
  const [draft, summary, participants, stash] = await Promise.all([
    getEncounterLootDraft(encounterId),
    getEncounterLootSummary(encounterId),
    loadParticipantsForPanel(encounterId),
    getStashNode(campaignId),
  ])

  if (!draft || !summary) {
    return (
      <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Не удалось загрузить данные лута. Попробуйте обновить страницу.
      </section>
    )
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">
          Распределение лута
        </h3>
        {summary.rowCount > 0 && (
          <span className="text-xs text-gray-500">
            Применено · {summary.rowCount}{' '}
            {summary.rowCount === 1 ? 'строка' : 'строк'}
          </span>
        )}
      </div>

      <EncounterLootEditor
        encounterId={encounterId}
        initialDraft={draft}
        summary={summary}
        participants={participants}
        stashAvailable={stash !== null}
      />
    </section>
  )
}

export type PanelParticipant = {
  pcNodeId: string
  title: string
  initiative: number | null
}

async function loadParticipantsForPanel(
  encounterId: string,
): Promise<PanelParticipant[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('encounter_participants')
    .select(
      'node_id, initiative, sort_order, created_at, node:nodes(id, title, type:node_types(slug))',
    )
    .eq('encounter_id', encounterId)
    .order('initiative', { ascending: false, nullsFirst: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`loadParticipantsForPanel: ${error.message}`)
  }

  type Row = {
    node_id: string | null
    initiative: number | null
    node:
      | {
          id: string
          title: string
          type: { slug: string } | { slug: string }[] | null
        }
      | {
          id: string
          title: string
          type: { slug: string } | { slug: string }[] | null
        }[]
      | null
  }

  const out: PanelParticipant[] = []
  for (const r of (data ?? []) as Row[]) {
    if (!r.node_id) continue
    const nodeWrap = Array.isArray(r.node) ? r.node[0] : r.node
    if (!nodeWrap) continue
    const typeWrap = Array.isArray(nodeWrap.type)
      ? nodeWrap.type[0]
      : nodeWrap.type
    if (typeWrap?.slug !== 'character') continue
    out.push({
      pcNodeId: nodeWrap.id,
      title: nodeWrap.title,
      initiative: r.initiative,
    })
  }
  return out
}
