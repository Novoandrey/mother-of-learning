'use client'

import { useState, useRef, useEffect } from 'react'

export const ROLES = [
  { slug: 'pc', label: 'PC', color: 'bg-blue-200 border-blue-400', dot: 'bg-blue-500', row: 'bg-blue-100' },
  { slug: 'ally', label: 'Союзник', color: 'bg-green-200 border-green-400', dot: 'bg-green-500', row: 'bg-green-100' },
  { slug: 'neutral', label: 'Нейтрал', color: 'bg-yellow-200 border-yellow-400', dot: 'bg-yellow-500', row: 'bg-yellow-50' },
  { slug: 'enemy', label: 'Враг', color: 'bg-red-200 border-red-400', dot: 'bg-red-500', row: 'bg-red-50' },
  { slug: 'object', label: 'Объект', color: 'bg-gray-200 border-gray-400', dot: 'bg-gray-400', row: 'bg-gray-100' },
] as const

const roleMap = new Map<string, typeof ROLES[number]>(ROLES.map((r) => [r.slug, r]))

export function getRoleStyle(role: string) {
  return roleMap.get(role) || roleMap.get('enemy')!
}

type Props = {
  value: string
  onChange: (role: string) => void
  disabled?: boolean
}

export function RoleSelector({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = getRoleStyle(value)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`flex h-6 w-6 items-center justify-center rounded-full border ${current.color} transition-colors ${
          disabled ? 'opacity-50' : 'hover:opacity-80'
        }`}
        title={current.label}
      >
        <span className={`h-2.5 w-2.5 rounded-full ${current.dot}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-8 z-20 w-32 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            {ROLES.map((role) => (
              <button
                key={role.slug}
                onClick={() => { onChange(role.slug); setOpen(false) }}
                className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors ${
                  value === role.slug ? 'bg-gray-50 font-medium' : 'hover:bg-gray-50'
                }`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${role.dot}`} />
                <span>{role.label}</span>
                {value === role.slug && <span className="ml-auto text-blue-500">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
