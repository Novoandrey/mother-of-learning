'use client'

import {
  FIELD_LABELS,
  TEXTAREA_FIELDS,
  NUMBER_FIELDS,
  URL_FIELDS,
  DATE_FIELDS,
  LOOP_STATUSES,
} from '@/lib/node-form-constants'

type LoopOption = { id: string; number: number; title: string; status: string }

type Props = {
  fieldKey: string
  value: string
  onChange: (v: string) => void
  typeSlug?: string
  loops?: LoopOption[]
}

/**
 * Renders a single node field input based on its key.
 * Knows the special cases: loop status dropdown, session → loop dropdown,
 * textarea / number / date / url / text inputs.
 */
export function NodeFormField({ fieldKey, value, onChange, typeSlug, loops = [] }: Props) {
  const label = FIELD_LABELS[fieldKey] || fieldKey
  const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none'

  // Status dropdown for loops
  if (fieldKey === 'status' && typeSlug === 'loop') {
    return (
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
        <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          {LOOP_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
    )
  }

  // Loop number dropdown for sessions
  if (fieldKey === 'loop_number' && typeSlug === 'session') {
    return (
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
        <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          <option value="">— без петли —</option>
          {loops.map((l) => (
            <option key={l.id} value={l.number}>
              Петля {l.number}{l.title !== `Петля ${l.number}` ? ` — ${l.title}` : ''}
              {l.status === 'current' ? ' ✦' : ''}
            </option>
          ))}
        </select>
      </div>
    )
  }

  if (TEXTAREA_FIELDS.includes(fieldKey)) {
    return (
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={fieldKey === 'recap' ? 10 : fieldKey === 'description' ? 4 : 5}
          className={`${inputCls} resize-y`}
        />
      </div>
    )
  }

  if (NUMBER_FIELDS.includes(fieldKey)) {
    return (
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
        <input
          type="number"
          min={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          // Blur on wheel: prevents accidentally changing the value while
          // scrolling the page. `type=number` otherwise increments/decrements
          // on mouse wheel when focused — a common usability gripe.
          onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
          className={inputCls}
        />
      </div>
    )
  }

  if (DATE_FIELDS.includes(fieldKey)) {
    return (
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
        <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
      </div>
    )
  }

  if (URL_FIELDS.includes(fieldKey)) {
    return (
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
        <input type="url" value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://..." className={inputCls} />
      </div>
    )
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </div>
  )
}
