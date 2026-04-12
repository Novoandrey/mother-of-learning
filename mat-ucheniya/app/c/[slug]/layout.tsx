import { getCampaignBySlug } from '@/lib/campaign'
import { notFound } from 'next/navigation'
import Link from 'next/link'

export default async function CampaignLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <Link href={`/c/${slug}/catalog`} className="font-semibold text-lg hover:text-blue-600 transition-colors">
            {campaign.name}
          </Link>
          <nav className="flex items-center gap-4">
            <Link href={`/c/${slug}/catalog`} className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
              Каталог
            </Link>
            <Link href={`/c/${slug}/encounters`} className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
              Энкаунтеры
            </Link>
            <Link
              href={`/c/${slug}/catalog/new`}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <span className="text-lg leading-none">+</span> Создать
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        {children}
      </main>
    </div>
  )
}
