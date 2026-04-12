import { getCampaignBySlug } from '@/lib/campaign'
import { notFound } from 'next/navigation'
import { CreateNodeForm } from '@/components/create-node-form'
import Link from 'next/link'

export default async function NewNodePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  return (
    <div>
      <Link
        href={`/c/${slug}/catalog`}
        className="mb-4 inline-block text-sm text-gray-400 hover:text-gray-600"
      >
        ← Каталог
      </Link>
      <h1 className="mb-6 text-xl font-bold">Новая сущность</h1>
      <CreateNodeForm campaignId={campaign.id} campaignSlug={slug} />
    </div>
  )
}
