'use client'

import { useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/toast-provider'
import { MAX_MEDIA_UPLOAD_BYTES } from '@/lib/media'

type Props = {
  campaignId: string
}

type UploadResponse = {
  asset?: { id: string; originalFilename: string }
  error?: string
}

export function MediaUploadForm({ campaignId }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const file = fileInput.current?.files?.[0]
    if (!file) {
      setMessage('Выберите изображение.')
      return
    }
    if (file.size > MAX_MEDIA_UPLOAD_BYTES) {
      setMessage('Изображение должно быть не больше 12 МБ.')
      return
    }

    setBusy(true)
    setMessage(null)
    const form = new FormData()
    form.set('campaignId', campaignId)
    form.set('file', file)

    try {
      const response = await fetch('/api/media/upload', {
        method: 'POST',
        body: form,
      })
      const payload = (await response.json().catch(() => ({}))) as UploadResponse
      if (!response.ok || !payload.asset) {
        setMessage(payload.error ?? 'Не удалось загрузить изображение.')
        return
      }

      if (fileInput.current) fileInput.current.value = ''
      toast(`«${payload.asset.originalFilename}» добавлено в медиатеку.`, {
        variant: 'success',
      })
      router.refresh()
    } catch {
      setMessage('Ошибка сети. Изображение не загружено.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={upload}
      className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 text-sm font-medium text-gray-800">
          Добавить изображение
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:font-medium file:text-gray-700 hover:file:bg-gray-200 disabled:opacity-60"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Загрузка…' : 'Загрузить'}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <p className="text-gray-500">PNG, JPEG или WebP · до 12 МБ</p>
        {message && <p role="alert" className="text-red-600">{message}</p>}
      </div>
    </form>
  )
}
