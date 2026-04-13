'use client'

import { useState } from 'react'

type Props = {
  onAdd: (displayName: string, maxHp: number) => void
}

export function InlineAddRow({ onAdd }: Props) {
  const [name, setName] = useState('')
  const [hp, setHp] = useState('')

  function submit() {
    if (!name.trim()) return
    onAdd(name.trim(), parseInt(hp) || 0)
    setName('')
    setHp('')
  }

  return (
    <div className="mt-1 flex min-w-[900px] items-center gap-2 rounded-lg px-3 py-2">
      <div className="w-14" /> {/* spacer for initiative column */}
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="+ Имя участника..."
        className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm text-gray-600 placeholder:text-gray-300 focus:border-gray-200 focus:bg-white focus:outline-none"
      />
      <input
        type="text"
        inputMode="numeric"
        value={hp}
        onChange={(e) => setHp(e.target.value.replace(/[^0-9]/g, ''))}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="HP"
        className="w-16 rounded border border-transparent bg-transparent px-1 py-0.5 text-center text-sm text-gray-600 placeholder:text-gray-300 focus:border-gray-200 focus:bg-white focus:outline-none"
      />
      <button
        onClick={submit}
        disabled={!name.trim()}
        className="rounded px-2 py-0.5 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30"
      >
        ↵
      </button>
    </div>
  )
}
