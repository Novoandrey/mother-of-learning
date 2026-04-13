import { redirect } from 'next/navigation'

export default async function EditLoopPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  redirect(`/c/${slug}/catalog/${id}/edit`)
}
