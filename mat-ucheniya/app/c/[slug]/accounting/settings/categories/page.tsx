export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getCampaignBySlug } from '@/lib/campaign'
import { getMembership, requireAuth } from '@/lib/auth'
import { listCategories } from '@/lib/categories'
import CategorySettings from '@/components/category-settings'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  return {
    title: campaign ? `Категории транзакций — ${campaign.name}` : 'Не найдено',
  }
}

export default async function CategorySettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const [campaign] = await Promise.all([
    getCampaignBySlug(slug),
    requireAuth(),
  ])
  if (!campaign) notFound()

  const membership = await getMembership(campaign.id)
  if (!membership) redirect('/')

  const canEdit = membership.role === 'owner' || membership.role === 'dm'
  // Include soft-deleted so DMs can restore them; non-editors still see
  // the full list, but the UI hides write controls.
  const categories = await listCategories(campaign.id, 'transaction', {
    includeDeleted: true,
  })

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/c/${slug}/accounting`}
        className="mb-4 inline-block text-sm text-gray-400 hover:text-gray-600 transition-colors"
      >
        ← Бухгалтерия
      </Link>

      <h1 className="text-2xl font-bold text-gray-900">Категории транзакций</h1>
      <p className="mt-1 mb-6 text-sm text-gray-500">
        Slug — стабильный идентификатор; используется в ссылках и фильтрах.
        Название — то, что видят игроки в выпадающем списке. Удаление мягкое:
        прошлые транзакции сохраняют свою категорию, но она исчезает из
        выбора для новых записей.
      </p>

      <CategorySettings
        campaignId={campaign.id}
        scope="transaction"
        initial={categories}
        canEdit={canEdit}
      />
    </div>
  )
}
