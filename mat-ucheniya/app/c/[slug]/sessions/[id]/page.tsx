export const dynamic = 'force-dynamic'

import { getCampaignBySlug } from '@/lib/campaign'
import { getSessionById, getAllSessions } from '@/lib/loops'
import { createClient } from '@/lib/supabase/server'
import { getMembership, requireAuth } from '@/lib/auth'
import { unwrapOne } from '@/lib/supabase/joins'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { MarkdownContent } from '@/components/markdown-content'
import { Chronicles } from '@/components/chronicles'
import { EdgeList } from '@/components/edge-list'
import { getTransactionsBySession } from '@/lib/transactions'
import { formatAmount } from '@/lib/transaction-format'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}): Promise<Metadata> {
  const { slug, id } = await params
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) return { title: 'Сессия' }
  const session = await getSessionById(id)
  return {
    title: session
      ? `#${session.session_number} ${session.title} — ${campaign.name}`
      : 'Сессия',
  }
}

function formatPlayedAt(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatDayRange(from: number | null, to: number | null): string | null {
  if (from == null || to == null) return null
  return from === to ? `День ${from}` : `Дни ${from}–${to}`
}

type Edge = {
  id: string
  type_label: string
  label: string | null
  direction: 'outgoing' | 'incoming'
  related_id: string
  related_title: string
}

type Chronicle = {
  id: string
  title: string
  content: string
  loop_number: number | null
  game_date: string | null
  created_at: string
  updated_at: string
}

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params

  const [campaign] = await Promise.all([
    getCampaignBySlug(slug),
    requireAuth(),
  ])
  if (!campaign) notFound()

  const membership = await getMembership(campaign.id)
  if (!membership) redirect('/')

  const session = await getSessionById(id)
  if (!session) notFound()

  // Parallel fetch: edges (both directions) + chronicles + session transactions.
  const supabase = await createClient()
  const [edgeRes, chroniclesRes, sessionTxs] = await Promise.all([
    supabase
      .from('edges')
      .select(
        'id, label, source_id, target_id, ' +
          'source:nodes!source_id(id, title), ' +
          'target:nodes!target_id(id, title), ' +
          'edge_type:edge_types(slug, label)',
      )
      .or(`source_id.eq.${id},target_id.eq.${id}`),
    supabase
      .from('chronicles')
      .select('id, title, content, loop_number, game_date, created_at, updated_at')
      .eq('node_id', id)
      .order('loop_number', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
    getTransactionsBySession(id),
  ])

  type EdgeRow = {
    id: string
    label: string | null
    source_id: string
    target_id: string
    source: { id: string; title: string } | Array<{ id: string; title: string }> | null
    target: { id: string; title: string } | Array<{ id: string; title: string }> | null
    edge_type: { slug: string; label: string } | Array<{ slug: string; label: string }> | null
  }

  // Exclude participated_in — those are already rendered as the
  // "Участники" row above. Other edges (custom DM-authored connections)
  // land in the generic Связи section below.
  const edges: Edge[] = ((edgeRes.data ?? []) as unknown as EdgeRow[])
    .map((e) => {
      const edgeType = unwrapOne(e.edge_type)
      const slug = edgeType?.slug ?? ''
      if (slug === 'participated_in') return null
      const direction: 'outgoing' | 'incoming' = e.source_id === id ? 'outgoing' : 'incoming'
      const related =
        direction === 'outgoing' ? unwrapOne(e.target) : unwrapOne(e.source)
      if (!related) return null
      return {
        id: e.id,
        type_label: edgeType?.label ?? slug,
        label: e.label ?? null,
        direction,
        related_id: related.id,
        related_title: related.title,
      }
    })
    .filter((x): x is Edge => x !== null)

  const chronicles = (chroniclesRes.data ?? []) as Chronicle[]

  const dayRange = formatDayRange(session.day_from, session.day_to)

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 text-sm text-gray-400">
            <Link
              href={`/c/${slug}/sessions`}
              className="hover:text-gray-600 transition-colors"
            >
              Сессии
            </Link>
            {session.loop_number && (
              <>
                <span>·</span>
                <Link
                  href={`/c/${slug}/loops?loop=${session.loop_number}`}
                  className="hover:text-gray-600 transition-colors"
                >
                  Петля {session.loop_number}
                </Link>
              </>
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            <span className="text-gray-400 font-mono text-lg mr-2">
              #{session.session_number}
            </span>
            {session.title}
          </h1>

          {/* Meta chips row */}
          {(dayRange || session.played_at || session.game_date) && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              {dayRange && (
                <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-200">
                  {dayRange}
                </span>
              )}
              {!dayRange && session.game_date && (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-200">
                  {session.game_date}
                </span>
              )}
              {session.played_at && (
                <span className="text-gray-400">
                  Сыграна {formatPlayedAt(session.played_at)}
                </span>
              )}
            </div>
          )}

          {/* Participants (T019 / US1). */}
          {session.participants.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
              <span className="text-gray-400">Участники:</span>
              {session.participants.map((p, i) => (
                <span key={p.id} className="contents">
                  <Link
                    href={`/c/${slug}/catalog/${p.id}`}
                    className="rounded px-1.5 py-0.5 text-gray-800 hover:bg-gray-100 transition-colors"
                  >
                    {p.title}
                  </Link>
                  {i < session.participants.length - 1 && (
                    <span className="text-gray-300">·</span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
        <Link
          href={`/c/${slug}/catalog/${id}/edit`}
          className="flex-shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Редактировать
        </Link>
      </div>

      {/* Navigation: prev / next */}
      <PrevNextNav slug={slug} sessionNumber={session.session_number} campaignId={campaign.id} />

      {/* Recap */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-4">
          Рекап
        </h2>
        {session.recap ? (
          <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
            {session.recap}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">Рекап не написан</p>
        )}
      </div>

      {/* DM Notes */}
      {session.dm_notes && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-600 mb-4">
            Заметки ДМа
          </h2>
          <div className="text-sm text-amber-900 whitespace-pre-wrap leading-relaxed">
            {session.dm_notes}
          </div>
        </div>
      )}

      {/* Markdown content (same component as node-detail). Empty by
          default; "+ Написать" shows up for campaign members. */}
      <MarkdownContent
        nodeId={session.id}
        initialContent={session.content}
        campaignSlug={slug}
      />

      {/* Spec-010 phase 13 (stretch): transactions attached to this session. */}
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Транзакции
          </h2>
          <Link
            href={`/c/${slug}/accounting`}
            className="text-sm text-blue-600 hover:underline"
          >
            В бухгалтерию →
          </Link>
        </div>
        {sessionTxs.length === 0 ? (
          <p className="text-sm text-gray-400">На этой сессии транзакций нет</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {sessionTxs.map((tx) => (
              <li
                key={tx.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
              >
                <div className="flex min-w-0 flex-col">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      {tx.kind === 'item'
                        ? tx.item_name ?? '—'
                        : formatAmount(tx.coins)}
                    </span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      {tx.category_label}
                    </span>
                  </div>
                  {tx.comment && (
                    <span className="truncate text-xs text-gray-500">
                      {tx.comment}
                    </span>
                  )}
                </div>
                <div className="flex-shrink-0 text-xs text-gray-400">
                  {tx.actor_pc_title ? (
                    <Link
                      href={`/c/${slug}/catalog/${tx.actor_pc_id ?? ''}`}
                      className="hover:text-blue-600"
                    >
                      {tx.actor_pc_title}
                    </Link>
                  ) : (
                    '[удалённый персонаж]'
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Letopis (chronicles tied to this session). */}
      <Chronicles
        nodeId={session.id}
        campaignId={campaign.id}
        campaignSlug={slug}
        initialChronicles={chronicles}
      />

      {/* Other relations (excluding participated_in — those are the
          Участники row above). Custom DM-authored edges surface here. */}
      {edges.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
            Связи
          </h2>
          <EdgeList
            edges={edges}
            campaignSlug={slug}
          />
        </div>
      )}
    </div>
  )
}

// Server component for prev/next navigation
async function PrevNextNav({
  slug,
  sessionNumber,
  campaignId,
}: {
  slug: string
  sessionNumber: number
  campaignId: string
}) {
  const allSessions = await getAllSessions(campaignId)

  const currentIdx = allSessions.findIndex((s) => s.session_number === sessionNumber)
  const prev = currentIdx > 0 ? allSessions[currentIdx - 1] : null
  const next = currentIdx < allSessions.length - 1 ? allSessions[currentIdx + 1] : null

  if (!prev && !next) return null

  return (
    <div className="flex items-center justify-between gap-4">
      {prev ? (
        <Link
          href={`/c/${slug}/sessions/${prev.id}`}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          ←{' '}
          <span className="font-mono text-xs text-gray-400">#{prev.session_number}</span>{' '}
          {prev.title}
        </Link>
      ) : (
        <div />
      )}
      {next && (
        <Link
          href={`/c/${slug}/sessions/${next.id}`}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          {next.title}{' '}
          <span className="font-mono text-xs text-gray-400">#{next.session_number}</span> →
        </Link>
      )}
    </div>
  )
}
