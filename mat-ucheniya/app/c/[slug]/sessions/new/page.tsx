import { getCampaignBySlug } from '@/lib/campaign'
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

  const [{ data: loops }, { data: lastSession }] = await Promise.all([
    supabase
      .from('loops')
      .select('number, title, status')
      .eq('campaign_id', campaign.id)
      .order('number', { ascending: true }),
    supabase
      .from('sessions')
      .select('session_number')
      .eq('campaign_id', campaign.id)
      .order('session_number', { ascending: false })
      .limit(1)
      .single(),
  ])

  const nextSessionNumber = (lastSession?.session_number ?? 0) + 1
  const defaultLoopNumber = loopParam ? parseInt(loopParam) : undefined

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Новая сессия</h1>
      <SessionForm
        campaignId={campaign.id}
        campaignSlug={slug}
        loops={loops ?? []}
        nextSessionNumber={nextSessionNumber}
        defaultLoopNumber={defaultLoopNumber}
      />
    </div>
  )
}
