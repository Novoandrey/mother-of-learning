'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  getParty,
  addPartyMember,
  updatePartyMember,
  removePartyMember,
  addPartyToEncounter,
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
  const [addMode, setAddMode] = useState<'catalog' | 'manual'>('catalog')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedNode, setSelectedNode] = useState<CatalogNode | null>(null)
  const [manualName, setManualName] = useState('')
  const [manualHp, setManualHp] = useState('')
  const [saving, setSaving] = useState(false)
  const [addingToEncounter, setAddingToEncounter] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editHp, setEditHp] = useState('')

  useEffect(() => {
    getParty(campaignId)
      .then(({ partyId, members }) => {
        setPartyId(partyId)
        setMembers(members)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [campaignId])

  const filteredNodes = catalogNodes.filter((n) =>
    n.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  async function handleAddMember() {
    if (!partyId) return
    setSaving(true)
    try {
      if (addMode === 'catalog' && selectedNode) {
        const hp = parseInt(manualHp) || 0
        const member = await addPartyMember(partyId, selectedNode.title, hp, selectedNode.id)
        setMembers((prev) => [...prev, member])
      } else if (addMode === 'manual' && manualName.trim()) {
        const hp = parseInt(manualHp) || 0
        const member = await addPartyMember(partyId, manualName.trim(), hp, null)
        setMembers((prev) => [...prev, member])
      }
      setShowAdd(false)
      setSelectedNode(null)
      setManualName('')
      setManualHp('')
      setSearchQuery('')
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
    setEditHp(String(m.max_hp))
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
      // Reload page to show new participants
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
            title="Добавить всю группу в этот энкаунтер"
          >
            {addingToEncounter ? '...' : '+ В энкаунтер'}
          </button>
        )}
        {!showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="rounded border border-indigo-300 bg-white px-2.5 py-1 text-xs text-indigo-600 hover:bg-indigo-50 transition-colors"
          >
            + Добавить PC
          </button>
        )}
      </div>

      {/* Members horizontal strip */}
      <div className="flex items-center gap-2 overflow-x-auto px-4 py-2.5 min-h-[52px]">
        {members.length === 0 && !showAdd ? (
          <p className="text-xs text-indigo-400 italic">
            Группа пустая — добавь PC, они будут здесь между сессиями
          </p>
        ) : (
          members.map((m) => (
            <div
              key={m.id}
              className="group flex-shrink-0 flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-sm"
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

      {/* Add member form */}
      {showAdd && (
        <div className="border-t border-indigo-200 px-4 py-3 space-y-2">
          <div className="flex gap-2">
            <button
              onClick={() => setAddMode('catalog')}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${addMode === 'catalog' ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50'}`}
            >
              Из каталога
            </button>
            <button
              onClick={() => setAddMode('manual')}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${addMode === 'manual' ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50'}`}
            >
              Вручную
            </button>
          </div>

          {addMode === 'catalog' ? (
            <div className="space-y-2">
              <input
                autoFocus
                placeholder="Поиск по каталогу..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSelectedNode(null) }}
                className="w-full rounded border border-indigo-200 px-2 py-1.5 text-xs focus:border-indigo-400 focus:outline-none"
              />
              {searchQuery && (
                <div className="max-h-32 overflow-y-auto rounded border border-indigo-200 bg-white">
                  {filteredNodes.slice(0, 8).map((n) => (
                    <button
                      key={n.id}
                      onClick={() => { setSelectedNode(n); setSearchQuery(n.title) }}
                      className={`w-full px-3 py-1.5 text-left text-xs hover:bg-indigo-50 ${selectedNode?.id === n.id ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-gray-700'}`}
                    >
                      {n.title}
                    </button>
                  ))}
                  {filteredNodes.length === 0 && (
                    <p className="px-3 py-2 text-xs text-gray-400">Ничего не найдено</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <input
              autoFocus
              placeholder="Имя персонажа..."
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              className="w-full rounded border border-indigo-200 px-2 py-1.5 text-xs focus:border-indigo-400 focus:outline-none"
            />
          )}

          <div className="flex items-center gap-2">
            <input
              placeholder="Макс. HP"
              value={manualHp}
              onChange={(e) => setManualHp(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddMember()}
              className="w-20 rounded border border-indigo-200 px-2 py-1.5 text-xs focus:border-indigo-400 focus:outline-none"
              type="number"
              min="0"
            />
            <button
              onClick={handleAddMember}
              disabled={saving || (addMode === 'catalog' ? !selectedNode : !manualName.trim())}
              className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? '...' : 'Добавить'}
            </button>
            <button
              onClick={() => { setShowAdd(false); setSelectedNode(null); setManualName(''); setManualHp(''); setSearchQuery('') }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
