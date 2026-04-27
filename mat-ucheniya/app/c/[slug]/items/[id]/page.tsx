export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ExternalLink } from 'lucide-react'

import { getCampaignBySlug } from '@/lib/campaign'
import { getMembership, requireAuth } from '@/lib/auth'
import { listCategories } from '@/lib/categories'
import { getItemById, getItemHistory } from '@/lib/items'
import type { Category } from '@/lib/transactions'
import { formatAmount } from '@/lib/transaction-format'
import { aggregateGp } from '@/lib/transaction-resolver'
import type { Rarity } from '@/lib/items-types'

const RARITY_LABEL: Record<string, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  'very-rare': 'Very Rare',
  legendary: 'Legendary',
  artifact: 'Artifact',
}

const RARITY_TONE: Record<Rarity, string> = {
  common: 'border-gray-300 text-gray-700',
  uncommon: 'border-green-500 bg-green-50 text-green-800',
  rare: 'border-blue-500 bg-blue-50 text-blue-800',
  'very-rare': 'border-purple-500 bg-purple-50 text-purple-800',
  legendary: 'border-amber-700 text-blue-700',
  artifact: 'border-rose-500 bg-rose-50 text-rose-800',
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}): Promise<Metadata> {
  const { slug, id } = await params
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) return { title: 'Не найдено' }
  const item = await getItemById(campaign.id, id)
  return {
    title: item ? `${item.title} — ${campaign.name}` : 'Не найдено',
  }
}

export default async function ItemPage({
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

  const item = await getItemById(campaign.id, id)
  if (!item) notFound()

  const isDm = membership.role === 'owner' || membership.role === 'dm'

  const [history, categories, slots, sources, availabilities] = await Promise.all([
    getItemHistory(campaign.id, id, 50),
    listCategories(campaign.id, 'item'),
    listCategories(campaign.id, 'item-slot'),
    listCategories(campaign.id, 'item-source'),
    listCategories(campaign.id, 'item-availability'),
  ])

  const labelOf = (
    list: Category[],
    s: string | null,
  ): string | null =>
    s ? list.find((c) => c.slug === s)?.label ?? s : null

  const categoryLabel = labelOf(categories, item.categorySlug) ?? item.categorySlug
  const slotLabel = labelOf(slots, item.slotSlug)
  const sourceLabel = labelOf(sources, item.sourceSlug)
  const availabilityLabel = labelOf(availabilities, item.availabilitySlug)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href={`/c/${slug}/items`}
            className="text-xs text-gray-400 hover:text-gray-700"
          >
            ← Все предметы
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">{item.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Chip>{categoryLabel}</Chip>
            {item.rarity && (
              <span
                className={`rounded border px-2 py-0.5 text-xs ${RARITY_TONE[item.rarity]}`}
              >
                {RARITY_LABEL[item.rarity]}
              </span>
            )}
            {sourceLabel && <Chip>{sourceLabel}</Chip>}
            {availabilityLabel && <Chip>{availabilityLabel}</Chip>}
          </div>
        </div>
        {isDm && (
          <Link
            href={`/c/${slug}/items/${id}/edit`}
            className="rounded border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:border-gray-400 hover:text-gray-900"
          >
            Редактировать
          </Link>
        )}
      </header>

      {/* Structured fields panel */}
      <section className="grid gap-3 rounded border border-gray-200 bg-gray-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Цена" value={item.priceGp !== null ? `${item.priceGp} gp` : '—'} mono />
        <Stat label="Вес" value={item.weightLb !== null ? `${item.weightLb} lb` : '—'} mono />
        <Stat label="Слот" value={slotLabel ?? '—'} />
        <Stat label="SRD" value={item.srdSlug ?? '—'} mono />
        {item.sourceDetail && (
          <div className="sm:col-span-2 lg:col-span-4">
            <Stat label="Источник, детали" value={item.sourceDetail} />
          </div>
        )}
        {item.dndsuUrl && (
          <div className="sm:col-span-2 lg:col-span-4">
            <a
              href={item.dndsuUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              Открыть на dnd.su
            </a>
          </div>
        )}
      </section>

      {/* Description */}
      {item.description && (
        <section className="rounded border border-gray-200 bg-gray-50 p-4">
          <h2 className="mb-2 text-sm font-medium text-gray-700">Описание</h2>
          <div className="whitespace-pre-wrap text-sm text-gray-700">
            {item.description}
          </div>
        </section>
      )}

      {/* История */}
      <section>
        <header className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-gray-700">История</h2>
          <span className="text-xs text-gray-400">
            {history.length === 0
              ? 'связанных транзакций нет'
              : `${history.length}${history.length === 50 ? '+' : ''} ${pluralizeRu(history.length, 'запись', 'записи', 'записей')}`}
          </span>
        </header>
        {history.length === 0 ? (
          <p className="rounded border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-400">
            Этот образец ещё нигде не использован.
          </p>
        ) : (
          <div className="overflow-hidden rounded border border-gray-200">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-400">
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-1.5 text-left font-normal">Когда</th>
                  <th className="px-3 py-1.5 text-left font-normal">Кто</th>
                  <th className="px-3 py-1.5 text-right font-normal">Кол-во</th>
                  <th className="px-3 py-1.5 text-left font-normal">Комментарий</th>
                </tr>
              </thead>
              <tbody>
                {history.map((tx) => {
                  const direction = tx.item_qty > 0 ? '+' : '−'
                  const qty = Math.abs(tx.item_qty)
                  return (
                    <tr
                      key={tx.id}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="px-3 py-1.5 whitespace-nowrap text-gray-500">
                        П{tx.loop_number} · день {tx.day_in_loop}
                      </td>
                      <td className="px-3 py-1.5 text-gray-800">
                        {tx.actor_pc_title ?? <span className="text-gray-300">[удалён]</span>}
                        {tx.counterparty?.title && (
                          <span className="text-gray-400">
                            {' '}→ {tx.counterparty.title}
                          </span>
                        )}
                      </td>
                      <td className={`px-3 py-1.5 text-right font-mono ${
                        tx.item_qty > 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}>
                        {direction}
                        {qty}
                      </td>
                      <td className="px-3 py-1.5 text-gray-500">
                        {tx.comment || <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )

  // formatAmount/aggregateGp imports kept available for if/when the
  // history table needs to surface money-side context (e.g. "куплено
  // за X gp"). Currently only item rows are surfaced because spec
  // FR-Q7=A scopes the section to linked rows of the Образец itself.
  // Suppressing the unused-import lint is pre-emptive.
  void formatAmount
  void aggregateGp
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-700">
      {children}
    </span>
  )
}

function Stat({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-gray-400">{label}</span>
      <span className={`text-sm text-gray-800 ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  )
}

function pluralizeRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}
