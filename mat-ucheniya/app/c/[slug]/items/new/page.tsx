export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'

import { getCampaignBySlug } from '@/lib/campaign'
import { getMembership, requireAuth } from '@/lib/auth'
import { listCategories } from '@/lib/categories'

import ItemFormPage, { EMPTY_PAYLOAD } from '@/components/item-form-page'

export default async function NewItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { slug } = await params
  const sp = await searchParams
  await requireAuth()

  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  const membership = await getMembership(campaign.id)
  if (!membership) redirect('/')
  if (membership.role !== 'owner' && membership.role !== 'dm') {
    redirect(`/c/${slug}/items`)
  }

  const [categories, slots, sources, availabilities] = await Promise.all([
    listCategories(campaign.id, 'item'),
    listCategories(campaign.id, 'item-slot'),
    listCategories(campaign.id, 'item-source'),
    listCategories(campaign.id, 'item-availability'),
  ])

  // Prefill title when navigated from typeahead «+ Создать «X»».
  const prefillTitle =
    typeof sp.title === 'string'
      ? sp.title.trim()
      : Array.isArray(sp.title)
        ? sp.title[0]?.trim() ?? ''
        : ''

  return (
    <ItemFormPage
      campaignId={campaign.id}
      campaignSlug={slug}
      initial={{ ...EMPTY_PAYLOAD, title: prefillTitle }}
      categories={categories}
      slots={slots}
      sources={sources}
      availabilities={availabilities}
    />
  )
}
