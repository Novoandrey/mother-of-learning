'use client'

/**
 * Spec-017 T021 — Кнопка «копировать в буфер» рядом с реквизитами.
 *
 * Один тап → `navigator.clipboard.writeText(text)` + temp-toast
 * «Скопировано». Toast — local state, 1.5s timeout. Без зависимостей
 * на toast-библиотеку, чтобы не плодить infra ради одной кнопки.
 *
 * Hide если `text` пустой или null — рисует ничего.
 */

import { useState } from 'react'

type Props = {
  text: string | null | undefined
  /** Optional aria-label override. */
  label?: string
}

export default function CopyButton({ text, label }: Props) {
  const [copied, setCopied] = useState(false)

  if (!text) return null

  async function handleCopy() {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      // Clipboard API requires HTTPS or localhost; в dev на raw IP
      // браузер reject'ит. Fallback: alert чтобы юзер хотя бы знал.
      console.error('CopyButton: clipboard write failed', err)
      alert('Не удалось скопировать. Скопируй вручную.')
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={label ?? 'Скопировать в буфер'}
      title={copied ? 'Скопировано' : 'Скопировать'}
      className="inline-flex items-center justify-center rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
    >
      {copied ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4 text-emerald-600"
        >
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="h-4 w-4"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
          />
        </svg>
      )}
    </button>
  )
}
