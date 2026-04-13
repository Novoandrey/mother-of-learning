import { getCampaignBySlug } from '@/lib/campaign'
import { notFound } from 'next/navigation'
import { CreateNodeForm } from '@/components/create-node-form'
import Link from 'next/link'
import type { Metadata } from 'next'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  return { title: campaign ? `Новая сущность — ${campaign.name}` : 'Новая сущность' }
}

export default async function NewNodePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ type?: string }>
}) {
  const { slug } = await params
  const { type: typeParam } = await searchParams
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  return (
    <div>
      <Link
        href={`/c/${slug}/catalog`}
        className="mb-4 inline-block text-sm text-gray-400 hover:text-gray-600 transition-colors"
      >
        ← Каталог
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Новая сущность</h1>
      <CreateNodeForm
        campaignId={campaign.id}
        campaignSlug={slug}
        preselectedType={typeParam}
      />
    </div>
  )
}
