export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getCampaignBySlug } from '@/lib/campaign'
import { updateCampaignHpMethod } from './actions'
import type { HpMethod } from '@/lib/statblock'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  return { title: campaign ? `Настройки — ${campaign.name}` : 'Настройки' }
}

const HP_METHOD_OPTIONS: { value: HpMethod; title: string; desc: string }[] = [
  {
    value: 'average',
    title: 'Среднее',
    desc: 'Берётся значение из статблока (обычное DMG-среднее). Подходит для стандартной сложности.',
  },
  {
    value: 'max',
    title: 'Максимум',
    desc: 'HP = макс. значение хит-дайсов (17d10 → 170) + бонус. Для хардкор-игр.',
  },
  {
    value: 'min',
    title: 'Минимум',
    desc: 'HP = 1 за каждый хит-дайс + бонус. Для быстрого прохождения / тренировочных боёв.',
  },
  {
    value: 'roll',
    title: 'Кидать кубы',
    desc: 'Бросок хит-дайсов каждый раз при добавлении. Уникальное HP у каждого моба.',
  },
]

export default async function CampaignSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  async function saveHpMethod(formData: FormData) {
    'use server'
    const method = formData.get('hp_method')
    if (typeof method !== 'string') return
    await updateCampaignHpMethod(slug, method)
    redirect(`/c/${slug}/settings`)
  }

  const current = campaign.settings.hp_method

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link
          href={`/c/${slug}/catalog`}
          className="inline-block text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          ← Каталог
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Настройки кампании</h1>
        <p className="mt-1 text-sm text-gray-500">{campaign.name}</p>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-base font-semibold text-gray-900">HP монстров</h2>
        <p className="mt-1 text-sm text-gray-500">
          Как считать стартовые HP, когда добавляешь моба в энкаунтер из каталога.
          Применяется только к новым участникам; уже добавленные не пересчитываются.
        </p>

        <form action={saveHpMethod} className="mt-4 space-y-2">
          {HP_METHOD_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                current === opt.value
                  ? 'border-blue-400 bg-blue-50/40'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                name="hp_method"
                value={opt.value}
                defaultChecked={current === opt.value}
                className="mt-0.5"
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900">{opt.title}</div>
                <div className="mt-0.5 text-[12px] text-gray-500">{opt.desc}</div>
              </div>
            </label>
          ))}

          <div className="pt-2">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Сохранить
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
