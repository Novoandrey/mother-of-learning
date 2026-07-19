export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { MediaLibrary } from '@/components/media-library'
import { MediaUploadForm } from '@/components/media-upload-form'
import { getMembership } from '@/lib/auth'
import { getCampaignBySlug } from '@/lib/campaign'
import { isMediaManager } from '@/lib/media'
import { getCampaignMediaPage } from '@/lib/queries/media'
import { ensureMediaWorkerStarted } from '@/lib/server/media-worker-bootstrap'
import { createClient } from '@/lib/supabase/server'

const mediaCategories = ['Все', 'Портреты', 'Карты', 'Фоны', 'Сцены'] as const

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

  await ensureMediaWorkerStarted()

  const mediaPage = await getCampaignMediaPage(supabase, campaign.id)
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

      <nav aria-label="Категории медиа" className="flex flex-wrap gap-2">
        {mediaCategories.map((category) => (
          <span
            key={category}
            aria-current={category === 'Все' ? 'page' : undefined}
            className={
              category === 'Все'
                ? 'rounded-full bg-blue-600 px-3 py-1.5 text-sm font-medium text-white'
                : 'rounded-full bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600'
            }
          >
            {category}
          </span>
        ))}
      </nav>

      {canManage && <MediaUploadForm campaignId={campaign.id} />}
      <MediaLibrary
        initialPage={mediaPage}
        campaignId={campaign.id}
        campaignSlug={campaign.slug}
        canManage={canManage}
      />
    </div>
  )
}
