'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'

type Props = {
  title: string
  count: number
  icon?: LucideIcon
  defaultOpen?: boolean
  children: ReactNode
}

export function StatblockSection({ title, count, icon: Icon, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const Chev = open ? ChevronDown : ChevronRight

  return (
    <section className="mb-2.5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 rounded-md border px-2 py-1.5 text-left hover:bg-gray-50 transition-colors"
        style={{ background: 'var(--gray-50)', borderColor: 'var(--gray-200)' }}
        aria-expanded={open}
      >
        <Chev size={14} strokeWidth={1.5} style={{ color: 'var(--fg-3)' }} />
        {Icon && <Icon size={14} strokeWidth={1.5} style={{ color: 'var(--fg-2)' }} />}
        <span
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--fg-3)', letterSpacing: '0.06em' }}
        >
          {title}
        </span>
        <span
          className="ml-auto font-mono tabular text-[11px]"
          style={{ color: 'var(--fg-3)' }}
        >
          {count}
        </span>
      </button>
      {open && <div className="pt-1.5">{children}</div>}
    </section>
  )
}
