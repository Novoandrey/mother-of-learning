export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getCampaignBySlug } from '@/lib/campaign'
import { getMembership, requireAuth } from '@/lib/auth'
import { listCategories } from '@/lib/categories'
import CategorySettings from '@/components/category-settings'
import DefaultPricesEditor from '@/components/default-prices-editor'
import ApplyDefaultPricesButton from '@/components/apply-default-prices-button'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  return {
    title: campaign ? `Настройки предметов — ${campaign.name}` : 'Не найдено',
  }
}

/**
 * Item-catalog value-list editor — spec-015 (T030).
 *
 * Four DM-configurable taxonomies (per FR-005a/b/c/d), each rendered
 * via the existing `<CategorySettings>` component with a different
 * `scope`. The component handles soft-delete, restore, rename, and
 * inline create — only the section heading and add-button copy
 * differ per scope.
 *
 * DM/owner only: players can browse the items catalog, but the
 * taxonomy is the DM's vocabulary for the campaign world.
 */
export default async function ItemsSettingsPage({
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

  const isManager = membership.role === 'owner' || membership.role === 'dm'
  if (!isManager) {
    // Non-DM members shouldn't even see this page — items catalog is
    // browseable but the taxonomy is DM-controlled.
    redirect(`/c/${slug}/items`)
  }

  // Pull all four lists in parallel; `includeDeleted: true` so the DM
  // can restore soft-deleted entries.
  const [categories, slots, sources, availabilities] = await Promise.all([
    listCategories(campaign.id, 'item', { includeDeleted: true }),
    listCategories(campaign.id, 'item-slot', { includeDeleted: true }),
    listCategories(campaign.id, 'item-source', { includeDeleted: true }),
    listCategories(campaign.id, 'item-availability', { includeDeleted: true }),
  ])

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/c/${slug}/items`}
        className="mb-4 inline-block text-sm text-gray-400 hover:text-gray-600 transition-colors"
      >
        ← Каталог предметов
      </Link>

      <h1 className="text-2xl font-bold text-gray-900">Настройки предметов</h1>
      <p className="mt-1 mb-6 text-sm text-gray-500">
        Slug — стабильный идентификатор; используется в фильтрах URL и в
        атрибутах Образцов. Название — то, что видят игроки. Удаление мягкое:
        существующие Образцы со ссылкой на удалённое значение продолжают
        отображать его, но новые записи такой пункт уже не предлагают.
      </p>

      <div className="space-y-10">
        <Section
          title="Категории"
          subtitle="Тип предмета: оружие, броня, расходник, магический и т. д."
        >
          <CategorySettings
            campaignId={campaign.id}
            scope="item"
            initial={categories}
            canEdit={isManager}
            slugPlaceholder="напр. weapon"
            labelPlaceholder="напр. Оружие"
            addLabel="+ Добавить категорию"
          />
        </Section>

        <Section
          title="Слоты"
          subtitle="Куда предмет надевается: голова, руки, шея, кольцо и т. д."
        >
          <CategorySettings
            campaignId={campaign.id}
            scope="item-slot"
            initial={slots}
            canEdit={isManager}
            slugPlaceholder="напр. head"
            labelPlaceholder="напр. Голова"
            addLabel="+ Добавить слот"
          />
        </Section>

        <Section
          title="Источники"
          subtitle="Откуда взят: SRD, домашнее правило, авторская книга и т. д."
        >
          <CategorySettings
            campaignId={campaign.id}
            scope="item-source"
            initial={sources}
            canEdit={isManager}
            slugPlaceholder="напр. srd"
            labelPlaceholder="напр. SRD 5.1"
            addLabel="+ Добавить источник"
          />
        </Section>

        <Section
          title="Доступность"
          subtitle="Где встречается: общедоступный, эксклюзив региона, секретный и т. д."
        >
          <CategorySettings
            campaignId={campaign.id}
            scope="item-availability"
            initial={availabilities}
            canEdit={isManager}
            slugPlaceholder="напр. common"
            labelPlaceholder="напр. Общедоступный"
            addLabel="+ Добавить доступность"
          />
        </Section>

        <Section
          title="Цены по умолчанию"
          subtitle="Префилл поля «Цена» при создании Образца, в зависимости от редкости."
        >
          <DefaultPricesEditor
            campaignSlug={slug}
            initial={campaign.settings.item_default_prices}
            canEdit={isManager}
          />
          {isManager && (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <p className="mb-2 text-xs text-gray-500">
                Spec-016 — применить таблицу выше ко всем существующим
                предметам каталога. Защищены items с галочкой
                «Не использовать стандарт» в форме предмета.
              </p>
              <ApplyDefaultPricesButton slug={slug} />
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <p className="mt-0.5 mb-4 text-xs text-gray-500">{subtitle}</p>
      {children}
    </section>
  )
}
