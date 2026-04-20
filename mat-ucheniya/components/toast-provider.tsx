'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

type ToastVariant = 'success' | 'error' | 'info'

type Toast = {
  id: number
  message: string
  variant: ToastVariant
  duration: number
}

type ToastContextValue = {
  toast: (message: string, options?: { variant?: ToastVariant; duration?: number }) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let nextId = 1

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback<ToastContextValue['toast']>((message, options) => {
    const id = nextId++
    const variant = options?.variant ?? 'info'
    const duration = options?.duration ?? (variant === 'error' ? 6000 : 3500)
    setToasts((prev) => [...prev, { id, message, variant, duration }])
  }, [])

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[1000] flex flex-col items-center gap-2 px-4"
        role="region"
        aria-label="Уведомления"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), toast.duration)
    return () => window.clearTimeout(timer)
  }, [toast.id, toast.duration, onDismiss])

  const bg =
    toast.variant === 'error'
      ? 'var(--red-600, #dc2626)'
      : toast.variant === 'success'
        ? 'var(--green-600, #16a34a)'
        : 'var(--gray-800, #1f2937)'

  return (
    <div
      className="pointer-events-auto max-w-md rounded-[var(--radius-md,8px)] px-4 py-2.5 text-[13px] font-medium text-white shadow-lg"
      style={{ background: bg, boxShadow: 'var(--shadow-lg)' }}
      role={toast.variant === 'error' ? 'alert' : 'status'}
    >
      <div className="flex items-start gap-3">
        <span className="flex-1 whitespace-pre-line">{toast.message}</span>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="-m-1 p-1 opacity-70 hover:opacity-100"
          aria-label="Закрыть"
        >
          ×
        </button>
      </div>
    </div>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    // Fallback for components rendered outside ToastProvider during SSR or tests.
    // Returns a no-op to avoid crashes; real app wraps with provider in root layout.
    return {
      toast: (message: string) => {
        if (typeof window !== 'undefined') {
          console.warn('[toast without provider]', message)
        }
      },
    }
  }
  return ctx
}
