import { getCampaignBySlug } from '@/lib/campaign'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { CreateNodeForm } from '@/components/create-node-form'
import Link from 'next/link'
import type { Metadata } from 'next'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}): Promise<Metadata> {
  const { slug, id } = await params
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) return { title: 'Редактирование' }
  const supabase = await createClient()
  const { data: node } = await supabase
    .from('nodes')
    .select('title')
    .eq('id', id)
    .single()
  return { title: node ? `Редактировать: ${node.title} — ${campaign.name}` : 'Редактирование' }
}

export default async function EditNodePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  const supabase = await createClient()
  const { data: node } = await supabase
    .from('nodes')
    .select('id, title, fields, content, type_id')
    .eq('id', id)
    .eq('campaign_id', campaign.id)
    .single()

  if (!node) notFound()

  return (
    <div>
      <Link
        href={`/c/${slug}/catalog/${id}`}
        className="mb-4 inline-block text-sm text-gray-400 hover:text-gray-600 transition-colors"
      >
        ← Назад
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Редактирование</h1>
      <CreateNodeForm
        campaignId={campaign.id}
        campaignSlug={slug}
        editNode={{
          id: node.id,
          title: node.title,
          fields: (node.fields as Record<string, unknown>) ?? {},
          content: node.content ?? '',
          type_id: node.type_id,
        }}
      />
    </div>
  )
}
