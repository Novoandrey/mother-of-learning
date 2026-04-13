export const dynamic = 'force-dynamic'

import { getCampaignBySlug } from '@/lib/campaign'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

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
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Петли</h1>
          <p className="mt-1 text-sm text-gray-500">Таймлайн, события и накопленная информация по каждой петле</p>
        </div>
      </div>

      <div className="rounded-lg border-2 border-dashed border-gray-200 bg-white py-16 text-center">
        <div className="text-4xl mb-3">🔄</div>
        <p className="text-lg font-medium text-gray-500">В разработке</p>
        <p className="mt-1 text-sm text-gray-400 max-w-md mx-auto">
          Здесь будет таймлайн петель: текущая и прошедшие, события по дням, что помнят путешественники
        </p>
      </div>
    </div>
  )
}
