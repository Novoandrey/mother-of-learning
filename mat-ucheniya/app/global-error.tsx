'use client'

import { useEffect } from 'react'

type Props = {
  error: Error & { digest?: string }
  reset: () => void
}

/** Last-resort recovery view when the root layout itself cannot render. */
export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    console.error('Unrecoverable application error', {
      message: error.message,
      digest: error.digest,
    })
  }, [error])

  return (
    <html lang="ru">
      <body className="flex min-h-screen items-center justify-center bg-gray-50 px-4 font-sans text-gray-900">
        <main className="w-full max-w-md rounded-[var(--radius-lg)] border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold">Не удалось открыть приложение</h1>
          <p className="mt-2 text-sm text-gray-600">
            Попробуйте ещё раз. Если проблема останется, сообщите ведущему и
            приложите код ошибки.
          </p>
          {error.digest && (
            <p className="mt-3 font-mono text-xs text-gray-400">id: {error.digest}</p>
          )}
          <button
            type="button"
            onClick={() => reset()}
            className="mt-5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Попробовать снова
          </button>
        </main>
      </body>
    </html>
  )
}
