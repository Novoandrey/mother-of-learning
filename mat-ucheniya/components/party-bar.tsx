'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  getParty,
  addPartyMember,
  updatePartyMember,
  removePartyMember,
  addPartyToEncounter,
  createNpcNode,
  PartyMember,
} from '@/lib/party-actions'

type CatalogNode = {
  id: string
  title: string
  fields: Record<string, unknown>
}

type Props = {
  campaignId: string
  campaignSlug: string
  encounterId: string
  catalogNodes: CatalogNode[]
  isEncounterCompleted: boolean
}

export function PartyBar({ campaignId, campaignSlug, encounterId, catalogNodes, isEncounterCompleted }: Props) {
  const [partyId, setPartyId] = useState<string | null>(null)
  const [members, setMembers] = useState<PartyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [addingToEncounter, setAddingToEncounter] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editHp, setEditHp] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getParty(campaignId)
      .then(({ partyId, members }) => {
        setPartyId(partyId)
        setMembers(members)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [campaignId])

  useEffect(() => {
    if (showAdd) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [showAdd])

  const filteredNodes = searchQuery.trim()
    ? catalogNodes.filter((n) =>
        n.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : []

  const showCreateOption =
    searchQuery.trim().length > 0 &&
    !filteredNodes.some((n) => n.title.toLowerCase() === searchQuery.trim().toLowerCase())

  function resetAdd() {
    setShowAdd(false)
    setSearchQuery('')
  }

  async function handleSelect(node: CatalogNode) {
    if (!partyId) return
    setSaving(true)
    try {
      const member = await addPartyMember(partyId, node.title, 0, node.id)
      setMembers((prev) => [...prev, member])
      resetAdd()
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateNpc() {
    if (!partyId || !searchQuery.trim()) return
    setSaving(true)
    try {
      const node = await createNpcNode(campaignId, searchQuery.trim())
      const member = await addPartyMember(partyId, node.title, 0, node.id)
      setMembers((prev) => [...prev, member])
      resetAdd()
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(memberId: string) {
    setMembers((prev) => prev.filter((m) => m.id !== memberId))
    try {
      await removePartyMember(memberId)
    } catch (e) {
      console.error(e)
    }
  }

  async function handleStartEdit(m: PartyMember) {
    setEditingId(m.id)
    setEditName(m.display_name)
    setEditHp(String(m.max_hp || ''))
  }

  async function handleSaveEdit(memberId: string) {
    const fields: { display_name?: string; max_hp?: number } = {}
    if (editName.trim()) fields.display_name = editName.trim()
    const hp = parseInt(editHp)
    if (!isNaN(hp)) fields.max_hp = hp
    setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, ...fields } : m))
    setEditingId(null)
    try {
      await updatePartyMember(memberId, fields)
    } catch (e) {
      console.error(e)
    }
  }

  async function handleAddToEncounter() {
    if (members.length === 0) return
    setAddingToEncounter(true)
    try {
      await addPartyToEncounter(encounterId, members)
      window.location.reload()
    } catch (e) {
      console.error(e)
      setAddingToEncounter(false)
    }
  }

  if (loading) return null

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-indigo-200 px-4 py-2">
        <span className="text-sm font-semibold text-indigo-700">👥 Текущая группа</span>
        <span className="text-xs text-indigo-400">{members.length} участников</span>
        <div className="flex-1" />
        {!isEncounterCompleted && members.length > 0 && (
          <button
            onClick={handleAddToEncounter}
            disabled={addingToEncounter}
            className="rounded bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {addingToEncounter ? '...' : '+ В энкаунтер'}
          </button>
        )}
        {!showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="rounded border border-indigo-300 bg-white px-2.5 py-1 text-xs text-indigo-600 hover:bg-indigo-50 transition-colors"
          >
            + Добавить
          </button>
        )}
      </div>

      {/* Members strip */}
      <div className="flex items-center gap-2 overflow-x-auto px-4 py-2.5 min-h-[52px] flex-wrap">
        {members.length === 0 && !showAdd ? (
          <p className="text-xs text-indigo-400 italic">Группа пустая — добавь участников</p>
        ) : (
          members.map((m) => (
            <div
              key={m.id}
              className="group flex-shrink-0 flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5"
            >
              {editingId === m.id ? (
                <>
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(m.id)}
                    className="w-24 rounded border border-indigo-200 px-1 py-0.5 text-xs focus:outline-none"
                  />
                  <input
                    value={editHp}
                    onChange={(e) => setEditHp(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(m.id)}
                    placeholder="HP"
                    className="w-12 rounded border border-indigo-200 px-1 py-0.5 text-xs focus:outline-none"
                  />
                  <button onClick={() => handleSaveEdit(m.id)} className="text-xs text-indigo-600 hover:text-indigo-800">✓</button>
                  <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                </>
              ) : (
                <>
                  {m.node_id ? (
                    <Link
                      href={`/c/${campaignSlug}/catalog/${m.node_id}`}
                      className="font-medium text-indigo-700 hover:underline text-xs"
                    >
                      {m.display_name}
                    </Link>
                  ) : (
                    <span className="font-medium text-indigo-700 text-xs">{m.display_name}</span>
                  )}
                  {m.max_hp > 0 && (
                    <span className="text-xs text-indigo-400">{m.max_hp} HP</span>
                  )}
                  <button
                    onClick={() => handleStartEdit(m)}
                    className="text-indigo-300 opacity-0 group-hover:opacity-100 hover:text-indigo-600 text-xs transition-opacity"
                    title="Редактировать"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => handleRemove(m.id)}
                    className="text-indigo-300 opacity-0 group-hover:opacity-100 hover:text-red-500 text-xs transition-opacity"
                    title="Убрать из группы"
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {/* Inline add */}
      {showAdd && (
        <div className="border-t border-indigo-200 px-4 py-3">
          <div className="relative">
            <input
              ref={inputRef}
              placeholder="Найти в каталоге или ввести имя…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') resetAdd()
                if (e.key === 'Enter' && showCreateOption && filteredNodes.length === 0) handleCreateNpc()
              }}
              disabled={saving}
              className="w-full rounded border border-indigo-200 px-3 py-1.5 text-xs focus:border-indigo-400 focus:outline-none pr-16"
            />
            <button
              onClick={resetAdd}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
            >
              Отмена
            </button>

            {searchQuery.trim() && (
              <div className="absolute z-10 w-full mt-1 rounded border border-indigo-200 bg-white shadow-sm overflow-hidden">
                {filteredNodes.slice(0, 8).map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleSelect(n)}
                    disabled={saving}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-indigo-50 text-gray-700 border-b border-indigo-50 last:border-0"
                  >
                    {n.title}
                  </button>
                ))}
                {showCreateOption && (
                  <button
                    onClick={handleCreateNpc}
                    disabled={saving}
                    className="w-full px-3 py-2 text-left text-xs text-indigo-600 hover:bg-indigo-50 font-medium"
                  >
                    {saving ? '…' : `✦ Создать «${searchQuery.trim()}» как НПС`}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
