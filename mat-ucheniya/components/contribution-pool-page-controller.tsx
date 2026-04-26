'use client'

/**
 * Spec-017 — Page-level client controller для Складчины.
 *
 * Управляет:
 *   • Кнопкой «+ Складчина» → раскрывает <CreateForm>.
 *   • Раскрытием <EditForm> когда URL содержит `?edit=<poolId>`.
 *   • Отменой формы → router.push() на чистый URL.
 *
 * Вкладки (Текущие / Архив) — обычные `<Link>`, server-side navigation,
 * без client state. Этот wrapper только про формы.
 */

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

import ContributionPoolCreateForm, {
  type CampaignMemberOption,
} from './contribution-pool-create-form'
import ContributionPoolEditForm from './contribution-pool-edit-form'
import type { ContributionPoolWithRows } from '@/lib/contributions'

type Props = {
  campaignId: string
  campaignSlug: string
  members: CampaignMemberOption[]
  /** Pool в режиме редактирования (если URL `?edit=<id>`). null если не в режиме. */
  editingPool: ContributionPoolWithRows | null
  /** Активная вкладка — нужна чтобы кнопка `+ Складчина` показывалась только на active. */
  activeTab: 'active' | 'archived'
}

export default function ContributionPoolPageController({
  campaignId,
  campaignSlug,
  members,
  editingPool,
  activeTab,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [creating, setCreating] = useState(false)

  const baseUrl = `/c/${campaignSlug}/skladchina`

  function handleCancelCreate() {
    setCreating(false)
  }

  function handleCancelEdit() {
    // Strip ?edit, keep ?tab if present.
    const tab = searchParams.get('tab')
    router.push(tab ? `${baseUrl}?tab=${tab}` : baseUrl)
  }

  // Edit form takes priority — если оба param'а в URL, edit винит.
  if (editingPool) {
    return (
      <ContributionPoolEditForm
        pool={editingPool}
        members={members}
        onCancel={handleCancelEdit}
      />
    )
  }

  if (activeTab !== 'active') {
    // На вкладке Архив кнопки `+ Складчина` нет.
    return null
  }

  if (creating) {
    return (
      <ContributionPoolCreateForm
        campaignId={campaignId}
        members={members}
        onCancel={handleCancelCreate}
      />
    )
  }

  return (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
      >
        + Складчина
      </button>
    </div>
  )
}
