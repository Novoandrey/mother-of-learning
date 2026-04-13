'use client'

import { useState, useRef, useEffect } from 'react'

// SRD conditions with short labels and colors
export const CONDITIONS = [
  { slug: 'blinded', label: 'Ослеплённый', color: 'bg-gray-700 text-white' },
  { slug: 'charmed', label: 'Очарованный', color: 'bg-pink-500 text-white' },
  { slug: 'deafened', label: 'Оглохший', color: 'bg-gray-500 text-white' },
  { slug: 'exhaustion', label: 'Истощённый', color: 'bg-amber-700 text-white' },
  { slug: 'frightened', label: 'Испуганный', color: 'bg-purple-600 text-white' },
  { slug: 'grappled', label: 'Схваченный', color: 'bg-yellow-600 text-white' },
  { slug: 'incapacitated', label: 'Недееспособный', color: 'bg-red-800 text-white' },
  { slug: 'invisible', label: 'Невидимый', color: 'bg-blue-400 text-white' },
  { slug: 'paralyzed', label: 'Парализованный', color: 'bg-red-600 text-white' },
  { slug: 'petrified', label: 'Окаменевший', color: 'bg-stone-600 text-white' },
  { slug: 'poisoned', label: 'Отравленный', color: 'bg-green-700 text-white' },
  { slug: 'prone', label: 'Сбит с ног', color: 'bg-orange-500 text-white' },
  { slug: 'restrained', label: 'Опутанный', color: 'bg-amber-600 text-white' },
  { slug: 'stunned', label: 'Ошеломлённый', color: 'bg-indigo-600 text-white' },
  { slug: 'unconscious', label: 'Бессознательный', color: 'bg-red-900 text-white' },
] as const

const conditionMap = new Map<string, typeof CONDITIONS[number]>(CONDITIONS.map((c) => [c.slug, c]))

type Props = {
  value: string[]
  onChange: (conditions: string[]) => void
  disabled?: boolean
}

export function ConditionPicker({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  function toggle(slug: string) {
    if (value.includes(slug)) {
      onChange(value.filter((s) => s !== slug))
    } else {
      onChange([...value, slug])
    }
  }

  return (
    <div ref={ref} className="relative flex flex-wrap items-center gap-1">
      {/* Active condition tags */}
      {value.map((slug) => {
        const cond = conditionMap.get(slug)
        if (!cond) return null
        return (
          <button
            key={slug}
            onClick={() => !disabled && toggle(slug)}
            disabled={disabled}
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight ${cond.color} ${
              disabled ? 'opacity-60' : 'hover:opacity-80'
            } transition-opacity`}
            title={cond.label}
          >
            {cond.label}
            {!disabled && <span className="ml-1 opacity-70">×</span>}
          </button>
        )
      })}

      {/* Add button */}
      {!disabled && (
        <button
          onClick={() => setOpen(!open)}
          className="inline-flex h-5 w-5 items-center justify-center rounded text-xs text-gray-300 hover:bg-gray-100 hover:text-gray-500 transition-colors"
          title="Добавить состояние"
        >
          +
        </button>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-52 w-48 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {CONDITIONS.map((cond) => {
            const active = value.includes(cond.slug)
            return (
              <button
                key={cond.slug}
                onClick={() => toggle(cond.slug)}
                className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors ${
                  active ? 'bg-gray-50 font-medium' : 'hover:bg-gray-50'
                }`}
              >
                <span className={`inline-block h-2.5 w-2.5 rounded-sm ${cond.color.split(' ')[0]}`} />
                <span className="flex-1">{cond.label}</span>
                {active && <span className="text-blue-500">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
