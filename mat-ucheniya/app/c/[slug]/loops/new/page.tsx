import { redirect } from 'next/navigation'

export default async function NewLoopPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  redirect(`/c/${slug}/catalog/new?type=loop`)
}
