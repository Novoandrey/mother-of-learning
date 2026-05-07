import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { readDoc } from '@/lib/docs'

type PageParams = { slug?: string[] }

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>
}): Promise<Metadata> {
  const { slug = [] } = await params
  const doc = await readDoc(slug.map(decodeURIComponent))
  return {
    title: doc ? `${doc.title} — Документация` : 'Документация — Мать Учения',
  }
}

/**
 * Catch-all docs page. Resolves a URL slug to a markdown file in
 * `docs/` and renders it. The slug `[]` resolves to `docs/README.md`.
 *
 * Markdown is rendered through `react-markdown` + `remark-gfm`
 * (already a project dep, used by `MarkdownContent`). Element styles
 * come from `@tailwindcss/typography` (loaded via `@plugin` in
 * `globals.css`) with project-token overrides applied via
 * `prose-*` utilities on the wrapping `<article>`.
 */
export default async function DocsPage({
  params,
}: {
  params: Promise<PageParams>
}) {
  const { slug = [] } = await params
  const doc = await readDoc(slug.map(decodeURIComponent))
  if (!doc) {
    notFound()
  }

  return (
    <article className="prose prose-slate max-w-none prose-headings:font-semibold prose-h1:text-2xl prose-h2:text-xl prose-h2:mt-10 prose-h3:text-base prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline prose-code:font-mono prose-code:text-[0.9em] prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-blockquote:border-l-blue-200 prose-blockquote:not-italic prose-blockquote:text-gray-600 prose-blockquote:font-normal">
      <Breadcrumbs slug={doc!.slug} />
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc!.content}</ReactMarkdown>
    </article>
  )
}

function Breadcrumbs({ slug }: { slug: string[] }) {
  if (slug.length === 0) return null
  const trail: { label: string; href: string }[] = [
    { label: 'Документация', href: '/docs' },
  ]
  for (let i = 0; i < slug.length; i++) {
    const segments = slug.slice(0, i + 1)
    trail.push({
      label: segments[segments.length - 1],
      href: '/docs/' + segments.map(encodeURIComponent).join('/'),
    })
  }
  return (
    <nav className="text-xs text-gray-500 mb-6 flex flex-wrap items-center gap-1">
      {trail.map((step, idx) => (
        <span key={step.href} className="flex items-center gap-1">
          {idx > 0 && <span className="text-gray-300">/</span>}
          {idx === trail.length - 1 ? (
            <span className="text-gray-700">{step.label}</span>
          ) : (
            <Link href={step.href} className="hover:text-blue-600 transition-colors">
              {step.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  )
}
