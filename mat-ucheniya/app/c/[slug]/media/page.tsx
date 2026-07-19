export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { MediaLibrary } from '@/components/media-library'
import { MediaUploadForm } from '@/components/media-upload-form'
import { getMembership } from '@/lib/auth'
import { getCampaignBySlug } from '@/lib/campaign'
import { isMediaManager } from '@/lib/media'
import { getCampaignMediaAssets } from '@/lib/queries/media'
import { createClient } from '@/lib/supabase/server'

export default async function MediaPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  const [membership, supabase] = await Promise.all([
    getMembership(campaign.id),
    createClient(),
  ])
  if (!membership) notFound()

  const assets = await getCampaignMediaAssets(supabase, campaign.id)
  const canManage = isMediaManager(membership.role)

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-gray-900">Медиатека</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          Общая библиотека изображений кампании. Один файл можно будет использовать
          в портретах, фонах и картах без повторной загрузки.
        </p>
      </header>

      {canManage && <MediaUploadForm campaignId={campaign.id} />}
      <MediaLibrary assets={assets} canManage={canManage} />
    </div>
  )
}
