export const dynamic = 'force-dynamic'

import { getCampaignBySlug } from '@/lib/campaign'
import { getSessionById, getAllSessions } from '@/lib/loops'
import { notFound } from 'next/navigation'
import Link from 'next/link'
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

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  const session = await getSessionById(id)
  if (!session) notFound()

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

          {/* Meta chips row: in-game day range, real-world played_at,
              game_date fallback when the new day range is absent. */}
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
