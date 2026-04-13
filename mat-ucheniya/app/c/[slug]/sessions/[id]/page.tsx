export const dynamic = 'force-dynamic'

import { getCampaignBySlug } from '@/lib/campaign'
import { getSessionById, getLoops, getAllSessions, getSessionNodeTypeId } from '@/lib/loops'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import SessionForm from '@/components/session-form'
import type { Metadata } from 'next'

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

export default async function SessionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>
  searchParams: Promise<{ edit?: string }>
}) {
  const { slug, id } = await params
  const { edit } = await searchParams
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  const session = await getSessionById(id)
  if (!session) notFound()

  const loops = await getLoops(campaign.id)

  // Get edge type IDs for session form
  const supabase = await createClient()
  const sessionTypeId = await getSessionNodeTypeId(campaign.id)
  const { data: containsEdgeType } = await supabase
    .from('edge_types')
    .select('id')
    .eq('slug', 'contains')
    .eq('is_base', true)
    .single()

  const loopOptions = loops.map((l) => ({
    id: l.id,
    number: l.number,
    title: l.title,
    status: l.status,
  }))

  if (edit === '1' && sessionTypeId && containsEdgeType) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Link
            href={`/c/${slug}/sessions/${id}`}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Назад
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Редактировать сессию</h1>
        <SessionForm
          campaignId={campaign.id}
          campaignSlug={slug}
          sessionTypeId={sessionTypeId}
          containsEdgeTypeId={containsEdgeType.id}
          session={session}
          loops={loopOptions}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
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
          <div className="flex items-center gap-3 mt-1">
            {session.played_at && (
              <p className="text-sm text-gray-400">
                {new Date(session.played_at).toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            )}
            {session.game_date && (
              <p className="text-sm text-gray-400">· {session.game_date}</p>
            )}
          </div>
        </div>
        <Link
          href={`/c/${slug}/sessions/${id}?edit=1`}
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
