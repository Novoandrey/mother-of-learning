'use client'

import { useState, useRef, useEffect } from 'react'

export const CONDITIONS = [
  { slug: 'blinded', label: 'Слепота', color: 'bg-gray-700 text-white',
    desc: 'Ничего не видит, проваливает проверки зрения. Атаки по существу с преимуществом, его атаки — с помехой.' },
  { slug: 'charmed', label: 'Очарование', color: 'bg-pink-500 text-white',
    desc: 'Не может атаковать очарователя. Очарователь с преимуществом на социальные проверки.' },
  { slug: 'deafened', label: 'Глухота', color: 'bg-gray-500 text-white',
    desc: 'Ничего не слышит. Проваливает проверки, связанные со слухом.' },
  { slug: 'exhaustion-1', label: 'Истощение 1', color: 'bg-amber-600 text-white',
    desc: 'Помеха при проверках характеристик.' },
  { slug: 'exhaustion-2', label: 'Истощение 2', color: 'bg-amber-600 text-white',
    desc: 'Скорость уменьшается вдвое. + помеха при проверках.' },
  { slug: 'exhaustion-3', label: 'Истощение 3', color: 'bg-amber-700 text-white',
    desc: 'Помеха при бросках атаки и спасбросках. + всё выше.' },
  { slug: 'exhaustion-4', label: 'Истощение 4', color: 'bg-amber-700 text-white',
    desc: 'Максимум хитов уменьшается вдвое. + всё выше.' },
  { slug: 'exhaustion-5', label: 'Истощение 5', color: 'bg-amber-800 text-white',
    desc: 'Скорость снижается до 0. + всё выше.' },
  { slug: 'exhaustion-6', label: 'Истощение 6', color: 'bg-amber-900 text-white',
    desc: 'Смерть.' },
  { slug: 'frightened', label: 'Страх', color: 'bg-purple-600 text-white',
    desc: 'Помеха на проверки и атаки, пока источник страха в линии обзора. Не может приблизиться к источнику.' },
  { slug: 'grappled', label: 'Захват', color: 'bg-yellow-600 text-white',
    desc: 'Скорость 0. Оканчивается если схвативший недееспособен или эффект выводит из досягаемости.' },
  { slug: 'incapacitated', label: 'Недееспособность', color: 'bg-red-800 text-white',
    desc: 'Не может совершать действия и реакции. Проваливает сопротивление захвату/толчку. Теряет концентрацию.' },
  { slug: 'invisible', label: 'Невидимость', color: 'bg-blue-400 text-white',
    desc: 'Невозможно увидеть без магии. Атаки по существу с помехой, его атаки — с преимуществом.' },
  { slug: 'paralyzed', label: 'Паралич', color: 'bg-red-600 text-white',
    desc: 'Недееспособен, не двигается, не говорит. Проваливает спасы Силы/Ловкости. Атаки с преимуществом, в 5 фт — автокрит.' },
  { slug: 'petrified', label: 'Окаменение', color: 'bg-stone-600 text-white',
    desc: 'Превращается в камень. Недееспособен. Сопротивление всем видам урона. Иммунитет к ядам и болезням.' },
  { slug: 'poisoned', label: 'Отравление', color: 'bg-green-700 text-white',
    desc: 'Помеха на броски атаки и проверки характеристик.' },
  { slug: 'prone', label: 'Ничком', color: 'bg-orange-500 text-white',
    desc: 'Только ползком. Помеха на атаки. В 5 фт — с преимуществом, дальше — с помехой. Встать = ½ перемещения.' },
  { slug: 'restrained', label: 'Опутанность', color: 'bg-amber-600 text-white',
    desc: 'Скорость 0. Атаки по нему с преимуществом, его атаки — с помехой. Помеха на спасы Ловкости.' },
  { slug: 'stunned', label: 'Ошеломление', color: 'bg-indigo-600 text-white',
    desc: 'Недееспособен, не перемещается, говорит запинаясь. Проваливает спасы Силы/Ловкости. Атаки с преимуществом.' },
  { slug: 'unconscious', label: 'Без сознания', color: 'bg-red-900 text-white',
    desc: 'Недееспособен, не двигается, не говорит, не осознаёт окружение. Падает ничком. Проваливает спасы Силы/Ловкости. В 5 фт — автокрит.' },
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
            title={cond.desc}
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
          className="inline-flex h-5 w-5 items-center justify-center rounded text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          title="Добавить состояние"
        >
          +
        </button>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-52 w-56 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {CONDITIONS.map((cond) => {
            const active = value.includes(cond.slug)
            return (
              <button
                key={cond.slug}
                onClick={() => toggle(cond.slug)}
                className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors ${
                  active ? 'bg-gray-50 font-medium' : 'hover:bg-gray-50'
                }`}
                title={cond.desc}
              >
                <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-sm ${cond.color.split(' ')[0]}`} />
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
