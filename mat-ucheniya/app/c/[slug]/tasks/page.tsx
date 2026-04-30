export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getCampaignBySlug } from '@/lib/campaign'
import { getMembership, requireAuth } from '@/lib/auth'
import { Board } from './board'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  return { title: campaign ? `Задачи — ${campaign.name}` : 'Задачи' }
}

/**
 * Spec-022 «Тасктрекер» — kanban prototype embed.
 *
 * Ports the Claude Design package's `Task Tracker.html` to React. Mock
 * data is hardcoded in `types-and-data.ts`; spec-022 will replace this
 * with real graph queries during the spec-kit Implement phase.
 *
 * Source: design package h/e2Zv9lvo8GKkV4FiTp47JA · {Task Tracker.html,
 * app.jsx, pieces.jsx, drawers.jsx, data.jsx, app.css, colors_and_type.css}
 * (chat 81, 2026-04-30).
 *
 * Tweaks panel from the prototype is intentionally dropped (designer-only
 * playground). Defaults baked: density=comfortable, layout=stacked,
 * color treatment=bar, cellLimit=6, showEmptyHint=true.
 */
export default async function TasksPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  await requireAuth()
  const membership = await getMembership(campaign.id)
  if (!membership) notFound()

  return <Board />
}
