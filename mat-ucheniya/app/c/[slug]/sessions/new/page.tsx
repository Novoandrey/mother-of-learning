import { redirect } from 'next/navigation'

export default async function NewSessionPage({
  params,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ loop?: string }>
}) {
  const { slug } = await params
  redirect(`/c/${slug}/catalog/new?type=session`)
}
