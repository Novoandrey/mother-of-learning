export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'

import { getCampaignBySlug } from '@/lib/campaign'
import { getMembership, requireAuth } from '@/lib/auth'
import { listCategories } from '@/lib/categories'
import { getItemById, getLinkedTransactionCount } from '@/lib/items'

import ItemFormPage from '@/components/item-form-page'

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  await requireAuth()

  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  const membership = await getMembership(campaign.id)
  if (!membership) redirect('/')
  if (membership.role !== 'owner' && membership.role !== 'dm') {
    redirect(`/c/${slug}/items/${id}`)
  }

  const item = await getItemById(campaign.id, id)
  if (!item) notFound()

  const [linkedTxCount, categories, slots, sources, availabilities] =
    await Promise.all([
      getLinkedTransactionCount(id),
      listCategories(campaign.id, 'item'),
      listCategories(campaign.id, 'item-slot'),
      listCategories(campaign.id, 'item-source'),
      listCategories(campaign.id, 'item-availability'),
    ])

  return (
    <ItemFormPage
      campaignId={campaign.id}
      campaignSlug={slug}
      itemId={id}
      linkedTxCount={linkedTxCount}
      initial={{
        title: item.title,
        categorySlug: item.categorySlug,
        rarity: item.rarity,
        priceGp: item.priceGp,
        weightLb: item.weightLb,
        slotSlug: item.slotSlug,
        sourceSlug: item.sourceSlug,
        availabilitySlug: item.availabilitySlug,
        srdSlug: item.srdSlug,
        description: item.description,
        sourceDetail: item.sourceDetail,
        useDefaultPrice: item.useDefaultPrice,
      }}
      categories={categories}
      slots={slots}
      sources={sources}
      availabilities={availabilities}
      defaultPrices={campaign.settings.item_default_prices}
    />
  )
}
