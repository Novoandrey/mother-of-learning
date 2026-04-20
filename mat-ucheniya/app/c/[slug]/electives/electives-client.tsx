'use client'

import { Fragment, useActionState, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  createElectiveAction,
  deleteElectiveAction,
  togglePcElectiveAction,
  updateElectiveAction,
} from './actions'

// Fragment alias — `<></>` can't hold a key inside .map() without this.
const FragmentWithKey = Fragment

// ─────────────────────────── Types ───────────────────────────

export type ElectiveRow = {
  id: string
  title: string
  kind: string
  link: string
  comment: string
}
export type PcRow = { id: string; title: string }
export type EdgeRow = { pcId: string; electiveId: string; note: string | null }

type Tab = 'electives' | 'characters'
type ActionState = { error: string | null; success: string | null }
const initialState: ActionState = { error: null, success: null }

// ─────────────────────────── Root ───────────────────────────

export function ElectivesClient({
  slug,
  canManage,
  electives,
  pcs,
  edges,
}: {
  slug: string
  canManage: boolean
  electives: ElectiveRow[]
  pcs: PcRow[]
  edges: EdgeRow[]
}) {
  const [tab, setTab] = useState<Tab>('electives')
  const [filterKind, setFilterKind] = useState<string>('')
  const [query, setQuery] = useState('')

  // Derived: pc_id → elective_id[] and elective_id → (pc_id → note)
  const electivesByPc = useMemo(() => {
    const m = new Map<string, EdgeRow[]>()
    for (const e of edges) {
      const arr = m.get(e.pcId) ?? []
      arr.push(e)
      m.set(e.pcId, arr)
    }
    return m
  }, [edges])

  const pcsByElective = useMemo(() => {
    const m = new Map<string, EdgeRow[]>()
    for (const e of edges) {
      const arr = m.get(e.electiveId) ?? []
      arr.push(e)
      m.set(e.electiveId, arr)
    }
    return m
  }, [edges])

  const pcMap = useMemo(() => new Map(pcs.map((p) => [p.id, p])), [pcs])
  const electiveMap = useMemo(() => new Map(electives.map((e) => [e.id, e])), [electives])

  const kinds = useMemo(() => {
    const set = new Set<string>()
    for (const e of electives) if (e.kind) set.add(e.kind)
    return Array.from(set).sort()
  }, [electives])

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-2 py-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-[20px] font-semibold" style={{ color: 'var(--fg-1)' }}>
          Факультативы
        </h1>
        {canManage && tab === 'electives' && <CreateElectiveInline slug={slug} kinds={kinds} />}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-gray-200">
        <TabButton active={tab === 'electives'} onClick={() => setTab('electives')}>
          Факультативы <span className="ml-1 text-gray-400">({electives.length})</span>
        </TabButton>
        <TabButton active={tab === 'characters'} onClick={() => setTab('characters')}>
          Персонажи <span className="ml-1 text-gray-400">({pcs.length})</span>
        </TabButton>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder={tab === 'electives' ? 'Поиск по названию…' : 'Поиск по имени…'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-64 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        {tab === 'electives' && kinds.length > 0 && (
          <select
            value={filterKind}
            onChange={(e) => setFilterKind(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            <option value="">Все типы</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        )}
      </div>

      {tab === 'electives' ? (
        <ElectivesTable
          slug={slug}
          canManage={canManage}
          electives={electives}
          pcs={pcs}
          pcsByElective={pcsByElective}
          query={query}
          filterKind={filterKind}
        />
      ) : (
        <CharactersView
          slug={slug}
          canManage={canManage}
          pcs={pcs}
          electives={electives}
          electivesByPc={electivesByPc}
          electiveMap={electiveMap}
          query={query}
        />
      )}
    </div>
  )
}

// ─────────────────────────── Reusable bits ───────────────────────────

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-4 py-2 text-sm font-medium transition-colors ${
        active ? 'text-blue-700' : 'text-gray-500 hover:text-gray-800'
      }`}
    >
      {children}
      {active && (
        <span className="absolute bottom-[-1px] left-2 right-2 h-0.5 rounded-full bg-blue-600" />
      )}
    </button>
  )
}

// ─────────────────────────── ELECTIVES TAB ───────────────────────────

function ElectivesTable({
  slug,
  canManage,
  electives,
  pcs,
  pcsByElective,
  query,
  filterKind,
}: {
  slug: string
  canManage: boolean
  electives: ElectiveRow[]
  pcs: PcRow[]
  pcsByElective: Map<string, EdgeRow[]>
  query: string
  filterKind: string
}) {
  const q = query.trim().toLowerCase()
  const filtered = electives.filter((e) => {
    if (filterKind && e.kind !== filterKind) return false
    if (!q) return true
    return (
      e.title.toLowerCase().includes(q) ||
      e.comment.toLowerCase().includes(q) ||
      e.link.toLowerCase().includes(q)
    )
  })

  // Group by kind for readability
  const byKind = new Map<string, ElectiveRow[]>()
  for (const e of filtered) {
    const key = e.kind || '(без типа)'
    const arr = byKind.get(key) ?? []
    arr.push(e)
    byKind.set(key, arr)
  }

  if (filtered.length === 0) {
    return <EmptyState>Ничего не найдено</EmptyState>
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Тип</th>
            <th className="px-3 py-2 text-left font-medium">Наименование</th>
            <th className="px-3 py-2 text-left font-medium">Ссылка / описание</th>
            <th className="px-3 py-2 text-left font-medium">Комментарий</th>
            <th className="px-3 py-2 text-left font-medium w-[30%]">Кто взял</th>
            {canManage && <th className="w-10 px-2 py-2" />}
          </tr>
        </thead>
        <tbody>
          {Array.from(byKind.entries()).map(([kind, rows]) => (
            <FragmentWithKey key={kind}>
              <tr className="bg-gray-50">
                <td
                  colSpan={canManage ? 6 : 5}
                  className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-gray-500"
                >
                  {kind} · {rows.length}
                </td>
              </tr>
              {rows.map((e) => (
                <ElectiveRowComponent
                  key={e.id}
                  slug={slug}
                  canManage={canManage}
                  elective={e}
                  pcs={pcs}
                  taken={pcsByElective.get(e.id) ?? []}
                />
              ))}
            </FragmentWithKey>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ElectiveRowComponent({
  slug,
  canManage,
  elective,
  pcs,
  taken,
}: {
  slug: string
  canManage: boolean
  elective: ElectiveRow
  pcs: PcRow[]
  taken: EdgeRow[]
}) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <tr className="border-t border-gray-100 bg-blue-50/40 align-top">
        <td colSpan={canManage ? 6 : 5} className="p-3">
          <EditElectiveForm slug={slug} elective={elective} onDone={() => setEditing(false)} />
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-t border-gray-100 align-top hover:bg-gray-50">
      <td className="px-3 py-2 text-xs text-gray-500">{elective.kind}</td>
      <td className="px-3 py-2 font-medium text-gray-900">
        <Link href={`/c/${slug}/catalog/${elective.id}`} className="hover:text-blue-700">
          {elective.title}
        </Link>
      </td>
      <td className="px-3 py-2 text-xs text-gray-600 max-w-xs">
        {elective.link && elective.link.startsWith('http') ? (
          <a
            href={elective.link}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-blue-600 hover:underline"
          >
            {elective.link}
          </a>
        ) : (
          <span className="whitespace-pre-wrap">{elective.link}</span>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-gray-600 max-w-xs whitespace-pre-wrap">
        {elective.comment}
      </td>
      <td className="px-3 py-2">
        <TakersCell
          slug={slug}
          canManage={canManage}
          electiveId={elective.id}
          pcs={pcs}
          taken={taken}
        />
      </td>
      {canManage && (
        <td className="px-2 py-2 text-right">
          <RowMenu
            onEdit={() => setEditing(true)}
            onDelete={async () => {
              if (!confirm(`Удалить факультатив «${elective.title}»?`)) return
              const fd = new FormData()
              fd.append('id', elective.id)
              await deleteElectiveAction(slug, initialState, fd)
            }}
          />
        </td>
      )}
    </tr>
  )
}

function TakersCell({
  slug,
  canManage,
  electiveId,
  pcs,
  taken,
}: {
  slug: string
  canManage: boolean
  electiveId: string
  pcs: PcRow[]
  taken: EdgeRow[]
}) {
  const [open, setOpen] = useState(false)
  const takenIds = new Set(taken.map((t) => t.pcId))
  const pcById = new Map(pcs.map((p) => [p.id, p]))
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  async function toggle(pcId: string, currentNote: string | null) {
    const fd = new FormData()
    fd.append('pc_id', pcId)
    fd.append('elective_id', electiveId)
    if (currentNote) fd.append('note', currentNote)
    await togglePcElectiveAction(slug, initialState, fd)
  }

  return (
    <div ref={ref} className="relative">
      <div className="flex flex-wrap gap-1">
        {taken.length === 0 && <span className="text-xs text-gray-400">—</span>}
        {taken.map((t) => {
          const pc = pcById.get(t.pcId)
          return (
            <span
              key={t.pcId}
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700"
              title={t.note ?? ''}
            >
              {pc?.title ?? '(unknown)'}
              {t.note && <span className="text-blue-500">· {t.note}</span>}
              {canManage && (
                <button
                  type="button"
                  className="ml-0.5 text-blue-400 hover:text-red-500"
                  onClick={() => toggle(t.pcId, null)}
                  title="Снять"
                >
                  ×
                </button>
              )}
            </span>
          )
        })}
        {canManage && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-[11px] text-gray-500 hover:border-blue-500 hover:text-blue-700"
          >
            + добавить
          </button>
        )}
      </div>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 max-h-72 w-64 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {pcs
            .filter((p) => !takenIds.has(p.id))
            .map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={async () => {
                  await toggle(p.id, null)
                  setOpen(false)
                }}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100"
              >
                {p.title}
              </button>
            ))}
          {pcs.filter((p) => !takenIds.has(p.id)).length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-400">Все добавлены</div>
          )}
        </div>
      )}
    </div>
  )
}

function RowMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex gap-1">
      <button
        type="button"
        onClick={onEdit}
        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        title="Редактировать"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
        title="Удалить"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m5 0V4a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
    </div>
  )
}

// ─────────────────────────── Create / edit forms ───────────────────────────

function CreateElectiveInline({ slug, kinds }: { slug: string; kinds: string[] }) {
  const [open, setOpen] = useState(false)
  const boundAction = createElectiveAction.bind(null, slug)
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction, pending] = useActionState(
    async (prev: typeof initialState, fd: FormData) => {
      const result = await boundAction(prev, fd)
      if (result.success) {
        formRef.current?.reset()
        setOpen(false)
      }
      return result
    },
    initialState,
  )

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
      >
        <span className="text-lg leading-none">+</span> Новый факультатив
      </button>
    )
  }

  return (
    <div className="w-full rounded-lg border border-blue-200 bg-blue-50/40 p-3">
      <form ref={formRef} action={formAction} className="grid grid-cols-2 gap-2">
        <input
          name="title"
          placeholder="Наименование"
          required
          className="col-span-2 rounded border border-gray-200 px-2 py-1.5 text-sm"
        />
        <input
          name="kind"
          placeholder="Тип (напр. Факультатив)"
          list="kind-list"
          className="rounded border border-gray-200 px-2 py-1.5 text-sm"
        />
        <datalist id="kind-list">
          {kinds.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
        <input
          name="link"
          placeholder="https://dnd.su/feats/…"
          className="rounded border border-gray-200 px-2 py-1.5 text-sm"
        />
        <textarea
          name="comment"
          placeholder="Комментарий"
          rows={2}
          className="col-span-2 rounded border border-gray-200 px-2 py-1.5 text-sm"
        />
        <div className="col-span-2 flex items-center justify-end gap-2">
          {state.error && <span className="text-xs text-red-600">{state.error}</span>}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? 'Создаём…' : 'Создать'}
          </button>
        </div>
      </form>
    </div>
  )
}

function EditElectiveForm({
  slug,
  elective,
  onDone,
}: {
  slug: string
  elective: ElectiveRow
  onDone: () => void
}) {
  const boundAction = updateElectiveAction.bind(null, slug)
  const [state, formAction, pending] = useActionState(boundAction, initialState)

  useEffect(() => {
    if (state.success) onDone()
  }, [state.success, onDone])

  return (
    <form action={formAction} className="grid grid-cols-2 gap-2">
      <input type="hidden" name="id" value={elective.id} />
      <input
        name="title"
        defaultValue={elective.title}
        required
        className="col-span-2 rounded border border-gray-200 px-2 py-1.5 text-sm"
      />
      <input
        name="kind"
        defaultValue={elective.kind}
        placeholder="Тип"
        className="rounded border border-gray-200 px-2 py-1.5 text-sm"
      />
      <input
        name="link"
        defaultValue={elective.link}
        placeholder="Ссылка"
        className="rounded border border-gray-200 px-2 py-1.5 text-sm"
      />
      <textarea
        name="comment"
        defaultValue={elective.comment}
        rows={2}
        className="col-span-2 rounded border border-gray-200 px-2 py-1.5 text-sm"
      />
      <div className="col-span-2 flex items-center justify-end gap-2">
        {state.error && <span className="text-xs text-red-600">{state.error}</span>}
        <button
          type="button"
          onClick={onDone}
          className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
        >
          Отмена
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? '…' : 'Сохранить'}
        </button>
      </div>
    </form>
  )
}

// ─────────────────────────── CHARACTERS TAB ───────────────────────────

function CharactersView({
  slug,
  canManage,
  pcs,
  electives,
  electivesByPc,
  electiveMap,
  query,
}: {
  slug: string
  canManage: boolean
  pcs: PcRow[]
  electives: ElectiveRow[]
  electivesByPc: Map<string, EdgeRow[]>
  electiveMap: Map<string, ElectiveRow>
  query: string
}) {
  const q = query.trim().toLowerCase()
  const filtered = pcs.filter((p) => !q || p.title.toLowerCase().includes(q))

  if (filtered.length === 0) return <EmptyState>Персонажи не найдены</EmptyState>

  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {filtered.map((pc) => {
        const taken = electivesByPc.get(pc.id) ?? []
        return (
          <CharacterCard
            key={pc.id}
            slug={slug}
            canManage={canManage}
            pc={pc}
            taken={taken}
            allElectives={electives}
            electiveMap={electiveMap}
          />
        )
      })}
    </div>
  )
}

function CharacterCard({
  slug,
  canManage,
  pc,
  taken,
  allElectives,
  electiveMap,
}: {
  slug: string
  canManage: boolean
  pc: PcRow
  taken: EdgeRow[]
  allElectives: ElectiveRow[]
  electiveMap: Map<string, ElectiveRow>
}) {
  const [adding, setAdding] = useState(false)
  const takenIds = new Set(taken.map((t) => t.electiveId))

  // Group taken by kind
  const byKind = new Map<string, Array<EdgeRow & { title: string }>>()
  for (const t of taken) {
    const el = electiveMap.get(t.electiveId)
    if (!el) continue
    const kind = el.kind || '(без типа)'
    const arr = byKind.get(kind) ?? []
    arr.push({ ...t, title: el.title })
    byKind.set(kind, arr)
  }

  async function toggle(electiveId: string) {
    const fd = new FormData()
    fd.append('pc_id', pc.id)
    fd.append('elective_id', electiveId)
    await togglePcElectiveAction(slug, initialState, fd)
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <Link
          href={`/c/${slug}/catalog/${pc.id}`}
          className="font-semibold text-gray-900 hover:text-blue-700"
        >
          {pc.title}
        </Link>
        <span className="text-xs text-gray-400">{taken.length} факульт.</span>
      </div>

      {taken.length === 0 && (
        <p className="mb-2 text-xs text-gray-400">Факультативов нет</p>
      )}

      <div className="space-y-2">
        {Array.from(byKind.entries()).map(([kind, items]) => (
          <div key={kind}>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-gray-400">{kind}</div>
            <ul className="space-y-0.5">
              {items.map((it) => (
                <li
                  key={it.electiveId}
                  className="flex items-center gap-1 text-sm text-gray-700"
                >
                  <Link
                    href={`/c/${slug}/catalog/${it.electiveId}`}
                    className="hover:text-blue-700"
                  >
                    {it.title}
                  </Link>
                  {it.note && (
                    <span className="text-xs text-gray-400">· {it.note}</span>
                  )}
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => toggle(it.electiveId)}
                      className="ml-auto text-gray-300 hover:text-red-500"
                      title="Снять"
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {canManage && (
        <div className="mt-3">
          {adding ? (
            <AddElectiveDropdown
              allElectives={allElectives}
              excludeIds={takenIds}
              onSelect={async (id) => {
                await toggle(id)
                setAdding(false)
              }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="w-full rounded border border-dashed border-gray-300 py-1.5 text-xs text-gray-500 hover:border-blue-500 hover:text-blue-700"
            >
              + добавить факультатив
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function AddElectiveDropdown({
  allElectives,
  excludeIds,
  onSelect,
  onCancel,
}: {
  allElectives: ElectiveRow[]
  excludeIds: Set<string>
  onSelect: (id: string) => void
  onCancel: () => void
}) {
  const [q, setQ] = useState('')
  const filtered = allElectives
    .filter((e) => !excludeIds.has(e.id))
    .filter((e) => !q || e.title.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 50)

  return (
    <div className="rounded border border-gray-200 bg-white">
      <div className="flex items-center gap-1 border-b border-gray-100 p-1">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск факультатива…"
          className="flex-1 rounded px-2 py-1 text-sm focus:outline-none"
        />
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
        >
          ✕
        </button>
      </div>
      <ul className="max-h-56 overflow-y-auto py-1">
        {filtered.length === 0 && (
          <li className="px-3 py-2 text-xs text-gray-400">Нет результатов</li>
        )}
        {filtered.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => onSelect(e.id)}
              className="block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-gray-100"
            >
              <span className="text-gray-500 text-[10px] uppercase mr-1">{e.kind}</span>
              {e.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─────────────────────────── Misc ───────────────────────────

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 py-12 text-center">
      <p className="text-gray-400">{children}</p>
    </div>
  )
}
