'use client'

import { useEffect } from 'react'

type Props = {
  error: Error & { digest?: string }
  reset: () => void
}

/** Keeps the Mini App recoverable instead of leaving a blank Telegram view. */
export default function TelegramError({ error, reset }: Props) {
  useEffect(() => {
    console.error('Telegram Mini App error', {
      message: error.message,
      digest: error.digest,
    })
  }, [error])

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 text-neutral-100">
      <section className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 p-5 text-center">
        <h1 className="text-lg font-semibold">Мини-приложение не открылось</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Проверьте соединение и попробуйте ещё раз. Если ошибка повторится,
          откройте приложение из бота заново.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-neutral-500">id: {error.digest}</p>
        )}
        <button
          type="button"
          onClick={() => reset()}
          className="mt-5 rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-400"
        >
          Повторить
        </button>
      </section>
    </main>
  )
}
