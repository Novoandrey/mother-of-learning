import { getCampaignBySlug } from '@/lib/campaign'
import { getLoops, getAllSessions, getSessionNodeTypeId } from '@/lib/loops'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import SessionForm from '@/components/session-form'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Новая сессия' }

export default async function NewSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ loop?: string }>
}) {
  const { slug } = await params
  const { loop: loopParam } = await searchParams
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  const supabase = await createClient()

  const [loops, allSessions, sessionTypeId, containsEdgeType] = await Promise.all([
    getLoops(campaign.id),
    getAllSessions(campaign.id),
    getSessionNodeTypeId(campaign.id),
    supabase
      .from('edge_types')
      .select('id')
      .eq('slug', 'contains')
      .eq('is_base', true)
      .single(),
  ])

  if (!sessionTypeId || !containsEdgeType.data) notFound()

  const nextSessionNumber = allSessions.length > 0
    ? Math.max(...allSessions.map((s) => s.session_number)) + 1
    : 1

  const defaultLoopNumber = loopParam ? parseInt(loopParam) : undefined

  const loopOptions = loops.map((l) => ({
    id: l.id,
    number: l.number,
    title: l.title,
    status: l.status,
  }))

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Новая сессия</h1>
      <SessionForm
        campaignId={campaign.id}
        campaignSlug={slug}
        sessionTypeId={sessionTypeId}
        containsEdgeTypeId={containsEdgeType.data.id}
        loops={loopOptions}
        nextSessionNumber={nextSessionNumber}
        defaultLoopNumber={defaultLoopNumber}
      />
    </div>
  )
}
