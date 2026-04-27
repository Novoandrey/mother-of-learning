export const dynamic = 'force-dynamic'

import { getCampaignBySlug } from '@/lib/campaign'
import { getLoops, getSessionsByLoop } from '@/lib/loops'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { LoopProgressBar } from '@/components/loop-progress-bar'
import { getMembership } from '@/lib/auth'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  return { title: campaign ? `Петли — ${campaign.name}` : 'Петли' }
}

export default async function LoopsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ loop?: string }>
}) {
  const { slug } = await params
  const sp = await searchParams
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  const loops = await getLoops(campaign.id)

  // Spec-019 — DM gate for the redirect note that replaces the
  // (now-removed) loop-start-setup-banner. `getMembership` returns
  // null for unauthed/non-member; safe to call here without
  // requireAuth. We only need a boolean.
  const membership = await getMembership(campaign.id)
  const isDM = membership?.role === 'dm' || membership?.role === 'owner'

  const currentLoop = sp.loop
    ? (loops.find((l) => l.number === parseInt(sp.loop!)) ?? loops.find((l) => l.status === 'current') ?? loops[0])
    : (loops.find((l) => l.status === 'current') ?? loops[0])

  const sessions = currentLoop
    ? await getSessionsByLoop(campaign.id, currentLoop.number)
    : []

  // Chronicles for this loop
  const supabase = await createClient()
  const { data: chroniclesData } = currentLoop
    ? await supabase
        .from('chronicles')
        .select('id, title, game_date, node_id, node:nodes(id, title)')
        .eq('campaign_id', campaign.id)
        .eq('loop_number', currentLoop.number)
        .order('created_at', { ascending: false })
        .limit(10)
    : { data: [] }

  type ChronicleRow = {
    id: string
    title: string
    game_date: string | null
    node_id: string | null
    node: { id: string; title: string } | { id: string; title: string }[] | null
  }
  const chronicles: ChronicleRow[] = chroniclesData ?? []

  const statusLabel: Record<string, string> = { past: 'Завершена', current: 'Текущая', future: 'Будущая' }
  const statusColors: Record<string, string> = {
    past: 'bg-gray-100 text-gray-600',
    current: 'bg-green-100 text-green-700',
    future: 'bg-blue-100 text-blue-600',
  }

  return (
    <div className="mx-auto max-w-5xl flex gap-6">
      {/* Loop list */}
      <div className="w-44 flex-shrink-0">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Петли</p>
        <Link href={`/c/${slug}/loops/new`} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">+</Link>
      </div>
        {!loops.length && <p className="text-sm text-gray-400 italic">Нет петель</p>}
        <div className="space-y-1">
          {loops.map((loop) => (
            <Link
              key={loop.id}
              href={`/c/${slug}/loops?loop=${loop.number}`}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                currentLoop?.id === loop.id
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span className="text-gray-400 text-xs">#{loop.number}</span>
              <span className="truncate">{loop.title}</span>
            </Link>
          ))}
        </div>
        <div className="mt-4 border-t border-gray-100 pt-4">
          <Link href={`/c/${slug}/sessions`} className="block text-sm text-gray-500 hover:text-gray-900 transition-colors">
            Все сессии →
          </Link>
        </div>
      </div>

      {/* Selected loop detail */}
      <div className="flex-1 min-w-0">
        {!currentLoop ? (
          <div className="rounded-lg border border-dashed border-gray-200 py-12 text-center">
            <div className="text-4xl mb-3">🔄</div>
            <p className="text-lg font-medium text-gray-500">Петли не созданы</p>
            <Link href={`/c/${slug}/loops/new`} className="mt-2 inline-block text-sm text-blue-600 hover:text-blue-800">
              Создать первую →
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header */}
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-2xl font-bold text-gray-900">Петля {currentLoop.number}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[currentLoop.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {statusLabel[currentLoop.status] ?? currentLoop.status}
                    </span>
                  </div>
                  {currentLoop.title !== `Петля ${currentLoop.number}` && (
                    <p className="text-lg text-gray-600">{currentLoop.title}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {sessions.length > 0 && (
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-900">{sessions.length}</p>
                      <p className="text-xs text-gray-400">сессий</p>
                    </div>
                  )}
                  <Link
                    href={`/c/${slug}/catalog/${currentLoop.id}/edit`}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Редактировать
                  </Link>
                </div>
              </div>
              {currentLoop.notes && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{currentLoop.notes}</p>
                </div>
              )}
            </div>

            {/* Spec-019 — старый <LoopStartSetupBanner> снят. Apply
                стартового сетапа теперь живёт на /accounting/starter-setup
                рядом с настройками. Здесь — тонкий redirect-note для
                DM, чтобы привычка к старому месту не приводила в
                пустоту. */}
            {isDM && (
              <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                Стартовый сетап настраивается и применяется в{' '}
                <Link
                  href={`/c/${slug}/accounting/starter-setup`}
                  className="text-blue-600 hover:underline"
                >
                  Бухгалтерии
                </Link>
                .
              </p>
            )}

            {/* Progress bar (spec-009 T017). Sits between the loop header
                and the sessions list. Hidden for length_days <= 0, which
                shouldn't happen — parser falls back to 30 — but defensive. */}
            {currentLoop.length_days > 0 && (
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
                  Прогресс петли
                </h2>
                <LoopProgressBar
                  loop={currentLoop}
                  sessions={sessions}
                  campaignSlug={slug}
                />
              </div>
            )}

            {/* Sessions */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Сессии в петле</h2>
                <Link href={`/c/${slug}/sessions/new?loop=${currentLoop.number}`} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                  + Добавить
                </Link>
              </div>
              {!sessions.length ? (
                <div className="rounded-lg border border-dashed border-gray-200 py-12 text-center">
                  <p className="text-sm text-gray-400">Нет сессий для этой петли</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {sessions.map((s) => (
                    <Link
                      key={s.id}
                      href={`/c/${slug}/sessions/${s.id}`}
                      className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 hover:border-gray-300 transition-colors"
                    >
                      <span className="text-sm font-mono text-gray-400 w-8">#{s.session_number}</span>
                      <span className="flex-1 text-sm text-gray-900 font-medium truncate">{s.title}</span>
                      {s.played_at && (
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {new Date(s.played_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Chronicles */}
            {chronicles && chronicles.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Хроники</h2>
                <div className="space-y-1.5">
                  {chronicles.map((ch) => {
                    const node = Array.isArray(ch.node) ? ch.node[0] : ch.node
                    return (
                    <div key={ch.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
                      {ch.game_date && <span className="text-xs text-gray-400 flex-shrink-0 w-16">{ch.game_date}</span>}
                      <span className="flex-1 text-sm text-gray-900 font-medium truncate">{ch.title}</span>
                      {node && (
                        <Link href={`/c/${slug}/catalog/${node.id}`} className="text-xs text-blue-600 hover:underline flex-shrink-0">
                          {node.title}
                        </Link>
                      )}
                    </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
