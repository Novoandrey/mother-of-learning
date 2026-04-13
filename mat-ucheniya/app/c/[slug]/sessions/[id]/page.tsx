export const dynamic = 'force-dynamic'

import { getCampaignBySlug } from '@/lib/campaign'
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
  const supabase = await createClient()
  const { data: s } = await supabase
    .from('sessions')
    .select('session_number, title')
    .eq('id', id)
    .single()
  return { title: s ? `#${s.session_number} ${s.title ?? ''} — ${campaign.name}` : 'Сессия' }
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

  const supabase = await createClient()

  const { data: session } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', id)
    .eq('campaign_id', campaign.id)
    .single()

  if (!session) notFound()

  const { data: loops } = await supabase
    .from('loops')
    .select('number, title, status')
    .eq('campaign_id', campaign.id)
    .order('number', { ascending: true })

  if (edit === '1') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Link
            href={`/c/${slug}/sessions/${id}`}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Назад
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Редактировать сессию</h1>
        <SessionForm
          campaignId={campaign.id}
          campaignSlug={slug}
          session={session}
          loops={loops ?? []}
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
            {session.title ?? `Сессия ${session.session_number}`}
          </h1>
          {session.played_at && (
            <p className="mt-1 text-sm text-gray-400">
              {new Date(session.played_at).toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          )}
        </div>
        <Link
          href={`/c/${slug}/sessions/${id}?edit=1`}
          className="flex-shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Редактировать
        </Link>
      </div>

      {/* Navigation: prev / next */}
      <PrevNextNav slug={slug} session={session} campaignId={campaign.id} />

      {/* Recap */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
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
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-6">
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
  session,
  campaignId,
}: {
  slug: string
  session: { session_number: number; campaign_id: string }
  campaignId: string
}) {
  const supabase = await createClient()

  const [{ data: prev }, { data: next }] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, session_number, title')
      .eq('campaign_id', campaignId)
      .lt('session_number', session.session_number)
      .order('session_number', { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from('sessions')
      .select('id, session_number, title')
      .eq('campaign_id', campaignId)
      .gt('session_number', session.session_number)
      .order('session_number', { ascending: true })
      .limit(1)
      .single(),
  ])

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
          {prev.title ?? `Сессия ${prev.session_number}`}
        </Link>
      ) : (
        <div />
      )}
      {next && (
        <Link
          href={`/c/${slug}/sessions/${next.id}`}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          {next.title ?? `Сессия ${next.session_number}`}{' '}
          <span className="font-mono text-xs text-gray-400">#{next.session_number}</span> →
        </Link>
      )}
    </div>
  )
}
