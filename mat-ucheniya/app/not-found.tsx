import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 text-gray-900">
      <section className="w-full max-w-md rounded-[var(--radius-lg)] border border-gray-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Страница не найдена</h1>
        <p className="mt-2 text-sm text-gray-600">
          Возможно, ссылка устарела или у вас больше нет доступа к этой кампании.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          К кампаниям
        </Link>
      </section>
    </main>
  )
}
