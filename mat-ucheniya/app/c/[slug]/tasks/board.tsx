'use client'

import './board.css'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type Card as CardModel,
  type StatusId,
  MEMBERS,
  NODE_TYPES,
  PROJECTS,
  SEED_CARDS,
  STATUSES,
  findStatus,
} from './types-and-data'
import { Avatar, Card, Picker, Popover, StatusPill } from './pieces'
import { PreSeedWizard, SettingsDrawer } from './drawers'

type FilterPickerKind = 'project' | 'status' | 'assignee' | 'type'

const CELL_LIMIT = 6

export function Board() {
  const [cards, setCards] = useState<CardModel[]>([...SEED_CARDS])
  const [openCard, setOpenCard] = useState<{ card: CardModel; anchor: HTMLElement } | null>(null)
  const [picker, setPicker] = useState<{
    kind: 'status' | 'assignee' | 'project'
    anchor: HTMLElement
  } | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null)

  // Filters
  const [filterProjects, setFP] = useState<string[]>([])
  const [filterStatuses, setFS] = useState<string[]>([])
  const [filterAssignees, setFA] = useState<string[]>([])
  const [filterTypes, setFT] = useState<string[]>([])
  const [filterAttention, setFAtt] = useState(false)
  const [search, setSearch] = useState('')
  const [filterPickerOpen, setFilterPickerOpen] = useState<{
    kind: FilterPickerKind
    anchor: HTMLElement
  } | null>(null)

  function showToast(msg: string, undo?: () => void) {
    setToast({ msg, undo })
    setTimeout(() => setToast(null), 4000)
  }

  function updateCard(id: string, patch: Partial<CardModel>) {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
    setOpenCard((prev) => (prev && prev.card.id === id ? { ...prev, card: { ...prev.card, ...patch } } : prev))
  }

  function removeCard(id: string) {
    const removed = cards.find((c) => c.id === id)
    if (!removed) return
    setCards((prev) => prev.filter((c) => c.id !== id))
    setOpenCard(null)
    showToast(`Снято с доски: ${removed.ref}`, () => setCards((prev) => [...prev, removed]))
  }

  // DnD
  const dragRef = useRef<{ id: string | null }>({ id: null })

  function onDragStart(e: React.DragEvent<HTMLDivElement>, card: CardModel) {
    dragRef.current.id = card.id
    e.dataTransfer.effectAllowed = 'move'
    try {
      e.dataTransfer.setData('text/plain', card.id)
    } catch {
      // ignore
    }
  }

  function onDragEnd() {
    dragRef.current.id = null
  }

  function onCellDrop(projId: string, statusId: StatusId) {
    const id = dragRef.current.id
    if (!id) return
    const c = cards.find((x) => x.id === id)
    if (!c) return
    if (c.project === projId && c.status === statusId) return
    updateCard(id, { project: projId, status: statusId })
    showToast(`${c.ref} → ${findStatus(statusId)?.label ?? statusId}`)
  }

  // Filtering
  const visible = useMemo(() => {
    return cards.filter((c) => {
      if (filterProjects.length && !filterProjects.includes(c.project)) return false
      if (filterStatuses.length && !filterStatuses.includes(c.status)) return false
      if (filterAssignees.length && !filterAssignees.includes(c.assignee || '__none')) return false
      if (filterTypes.length && !filterTypes.includes(c.type)) return false
      if (filterAttention && !c.needsAttention) return false
      if (search && !c.title.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [cards, filterProjects, filterStatuses, filterAssignees, filterTypes, filterAttention, search])

  // Group cards by (project, status)
  const matrix = useMemo(() => {
    const m: Record<string, Record<string, CardModel[]>> = {}
    PROJECTS.forEach((p) => {
      m[p.id] = {}
      STATUSES.forEach((s) => {
        m[p.id][s.id] = []
      })
    })
    visible.forEach((c) => {
      if (m[c.project] && m[c.project][c.status]) m[c.project][c.status].push(c)
    })
    Object.keys(m).forEach((pid) => {
      Object.keys(m[pid]).forEach((sid) => {
        m[pid][sid].sort((a, b) => {
          const da = a.lastActivity?.date || '0'
          const db = b.lastActivity?.date || '0'
          return db.localeCompare(da)
        })
      })
    })
    return m
  }, [visible])

  const colsCount = STATUSES.length
  const gridTemplate = `200px repeat(${colsCount}, minmax(220px, 1fr))`

  const hasActiveFilter =
    filterProjects.length > 0 ||
    filterStatuses.length > 0 ||
    filterAssignees.length > 0 ||
    filterTypes.length > 0 ||
    filterAttention ||
    search.length > 0

  // ── Pickers (popover for open card) ──────────────────────────
  function renderPickerForOpenCard() {
    if (!picker || !openCard) return null
    const { kind, anchor } = picker
    const c = openCard.card
    const close = () => setPicker(null)
    if (kind === 'status') {
      return (
        <Picker anchor={anchor} onClose={close}>
          {STATUSES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={s.id === c.status ? 'on' : ''}
              onClick={() => {
                updateCard(c.id, { status: s.id })
                close()
              }}
            >
              <StatusPill statusId={s.id} />
            </button>
          ))}
        </Picker>
      )
    }
    if (kind === 'assignee') {
      return (
        <Picker anchor={anchor} onClose={close}>
          <button
            type="button"
            className={!c.assignee ? 'on' : ''}
            onClick={() => {
              updateCard(c.id, { assignee: null })
              close()
            }}
          >
            <Avatar memberId={null} />
            <span>Не назначен</span>
          </button>
          <div className="tt-sep" />
          {MEMBERS.map((m) => (
            <button
              key={m.id}
              type="button"
              className={m.id === c.assignee ? 'on' : ''}
              onClick={() => {
                updateCard(c.id, { assignee: m.id })
                close()
              }}
            >
              <Avatar memberId={m.id} />
              <span>{m.name}</span>
              {m.role === 'dm' && (
                <span className="tt-muted" style={{ fontSize: 11 }}>
                  · ДМ
                </span>
              )}
            </button>
          ))}
        </Picker>
      )
    }
    if (kind === 'project') {
      return (
        <Picker anchor={anchor} onClose={close}>
          {PROJECTS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={p.id === c.project ? 'on' : ''}
              onClick={() => {
                updateCard(c.id, { project: p.id })
                close()
              }}
            >
              <span>{p.name}</span>
            </button>
          ))}
        </Picker>
      )
    }
    return null
  }

  // ── Filter pickers ──────────────────────────────────────────
  function renderFilterPicker() {
    if (!filterPickerOpen) return null
    const { kind, anchor } = filterPickerOpen
    const close = () => setFilterPickerOpen(null)
    const toggle = (arr: string[], set: (v: string[]) => void, val: string) =>
      set(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val])
    if (kind === 'project') {
      return (
        <Picker anchor={anchor} onClose={close}>
          {PROJECTS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={filterProjects.includes(p.id) ? 'on' : ''}
              onClick={() => toggle(filterProjects, setFP, p.id)}
            >
              <span style={{ width: 14 }}>{filterProjects.includes(p.id) ? '✓' : ''}</span>
              <span>{p.name}</span>
            </button>
          ))}
        </Picker>
      )
    }
    if (kind === 'status') {
      return (
        <Picker anchor={anchor} onClose={close}>
          {STATUSES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={filterStatuses.includes(s.id) ? 'on' : ''}
              onClick={() => toggle(filterStatuses, setFS, s.id)}
            >
              <span style={{ width: 14 }}>{filterStatuses.includes(s.id) ? '✓' : ''}</span>
              <StatusPill statusId={s.id} />
            </button>
          ))}
        </Picker>
      )
    }
    if (kind === 'assignee') {
      return (
        <Picker anchor={anchor} onClose={close}>
          <button
            type="button"
            className={filterAssignees.includes('__none') ? 'on' : ''}
            onClick={() => toggle(filterAssignees, setFA, '__none')}
          >
            <span style={{ width: 14 }}>{filterAssignees.includes('__none') ? '✓' : ''}</span>
            <Avatar memberId={null} />
            <span>Не назначен</span>
          </button>
          <div className="tt-sep" />
          {MEMBERS.map((m) => (
            <button
              key={m.id}
              type="button"
              className={filterAssignees.includes(m.id) ? 'on' : ''}
              onClick={() => toggle(filterAssignees, setFA, m.id)}
            >
              <span style={{ width: 14 }}>{filterAssignees.includes(m.id) ? '✓' : ''}</span>
              <Avatar memberId={m.id} />
              <span>{m.name}</span>
            </button>
          ))}
        </Picker>
      )
    }
    if (kind === 'type') {
      return (
        <Picker anchor={anchor} onClose={close}>
          {Object.entries(NODE_TYPES).map(([k, t]) => (
            <button
              key={k}
              type="button"
              className={filterTypes.includes(k) ? 'on' : ''}
              onClick={() => toggle(filterTypes, setFT, k)}
            >
              <span style={{ width: 14 }}>{filterTypes.includes(k) ? '✓' : ''}</span>
              <span>{t.emoji}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </Picker>
      )
    }
    return null
  }

  // Cleanup: close pickers on unmount
  useEffect(() => {
    return () => {
      setOpenCard(null)
      setPicker(null)
      setFilterPickerOpen(null)
    }
  }, [])

  return (
    <div className="tt-board">
      <div className="tt-topbar">
        <div className="tt-page-header">
          <h1>Задачи</h1>
          <span className="tt-crumb">
            {visible.length}/{cards.length} карт. · {PROJECTS.length} проектов ·{' '}
            {STATUSES.length} статусов
          </span>
          <div className="tt-actions">
            <button
              className="tt-btn-sec"
              type="button"
              onClick={() => setWizardOpen(true)}
            >
              Засеять автоматически
            </button>
            <button className="tt-btn-sec" type="button" onClick={() => setDrawerOpen(true)}>
              Настройки
            </button>
            <button className="tt-btn-pri" type="button">
              + Создать карточку
            </button>
          </div>
        </div>
        <div className="tt-filterbar">
          <div className="tt-search">
            <span className="tt-ic">🔍</span>
            <input
              type="text"
              placeholder="Найти по названию…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="tt-sep" />

          <button
            type="button"
            className={`tt-fchip${filterProjects.length ? ' on' : ''}`}
            onClick={(e) =>
              setFilterPickerOpen({ kind: 'project', anchor: e.currentTarget })
            }
          >
            Проект
            {filterProjects.length > 0 && <span className="tt-ct">{filterProjects.length}</span>} ▾
          </button>
          <button
            type="button"
            className={`tt-fchip${filterStatuses.length ? ' on' : ''}`}
            onClick={(e) =>
              setFilterPickerOpen({ kind: 'status', anchor: e.currentTarget })
            }
          >
            Статус
            {filterStatuses.length > 0 && <span className="tt-ct">{filterStatuses.length}</span>} ▾
          </button>
          <button
            type="button"
            className={`tt-fchip${filterAssignees.length ? ' on' : ''}`}
            onClick={(e) =>
              setFilterPickerOpen({ kind: 'assignee', anchor: e.currentTarget })
            }
          >
            Исполнитель
            {filterAssignees.length > 0 && (
              <span className="tt-ct">{filterAssignees.length}</span>
            )}{' '}
            ▾
          </button>
          <button
            type="button"
            className={`tt-fchip${filterTypes.length ? ' on' : ''}`}
            onClick={(e) => setFilterPickerOpen({ kind: 'type', anchor: e.currentTarget })}
          >
            Тип
            {filterTypes.length > 0 && <span className="tt-ct">{filterTypes.length}</span>} ▾
          </button>
          <button
            type="button"
            className={`tt-fchip toggle${filterAttention ? ' on' : ''}`}
            onClick={() => setFAtt(!filterAttention)}
          >
            ● внимание
          </button>

          {hasActiveFilter && (
            <button
              type="button"
              className="tt-btn-link"
              style={{ marginLeft: 6 }}
              onClick={() => {
                setFP([])
                setFS([])
                setFA([])
                setFT([])
                setFAtt(false)
                setSearch('')
              }}
            >
              Сбросить
            </button>
          )}
        </div>
      </div>

      <div className="tt-matrix-wrap">
        <div className="tt-matrix" style={{ gridTemplateColumns: gridTemplate }}>
          <div className="tt-corner" />
          {STATUSES.map((s) => {
            const ct = visible.filter((c) => c.status === s.id).length
            return (
              <div key={s.id} className="tt-col-head">
                <div className="tt-head-top">
                  <span
                    className="tt-swatch"
                    style={{ background: `var(--st-${s.id}-bar)` }}
                  />
                  <span className="tt-lbl">{s.label}</span>
                  <span className="tt-ct">{ct}</span>
                </div>
              </div>
            )
          })}

          {PROJECTS.map((p) => (
            <div key={p.id} style={{ display: 'contents' }}>
              <div className="tt-row-head">
                <div className="tt-name">{p.name}</div>
                <div className="tt-sub">
                  {visible.filter((c) => c.project === p.id).length} карт.
                </div>
              </div>
              {STATUSES.map((s) => {
                const cellCards = matrix[p.id][s.id] || []
                const shown = cellCards.slice(0, CELL_LIMIT)
                const hidden = cellCards.length - shown.length
                return (
                  <div
                    key={s.id}
                    className="tt-cell"
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.currentTarget.classList.add('dropping')
                    }}
                    onDragLeave={(e) => e.currentTarget.classList.remove('dropping')}
                    onDrop={(e) => {
                      e.currentTarget.classList.remove('dropping')
                      onCellDrop(p.id, s.id)
                    }}
                  >
                    {shown.length === 0 && <div className="tt-empty">— пусто —</div>}
                    {shown.map((c) => (
                      <Card
                        key={c.id}
                        card={c}
                        onOpen={(card, el) => {
                          setOpenCard({ card, anchor: el })
                          setPicker(null)
                        }}
                        isActive={openCard?.card.id === c.id}
                        onDragStart={onDragStart}
                        onDragEnd={onDragEnd}
                      />
                    ))}
                    {hidden > 0 && (
                      <button type="button" className="tt-more">
                        +{hidden} ещё
                      </button>
                    )}
                    <button type="button" className="tt-cell-add">
                      + Карточка в «{s.label}»
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Popover */}
      {openCard && (
        <Popover
          card={openCard.card}
          anchorEl={openCard.anchor}
          onClose={() => {
            setOpenCard(null)
            setPicker(null)
          }}
          onUpdate={(patch) => updateCard(openCard.card.id, patch)}
          onRemove={removeCard}
          isDM={true}
          onOpenStatusPicker={(el) => setPicker({ kind: 'status', anchor: el })}
          onOpenAssigneePicker={(el) => setPicker({ kind: 'assignee', anchor: el })}
          onOpenProjectPicker={(el) => setPicker({ kind: 'project', anchor: el })}
        />
      )}
      {renderPickerForOpenCard()}
      {renderFilterPicker()}

      {drawerOpen && (
        <SettingsDrawer
          onClose={() => setDrawerOpen(false)}
          onOpenWizard={() => setWizardOpen(true)}
        />
      )}
      {wizardOpen && (
        <PreSeedWizard
          onClose={() => setWizardOpen(false)}
          onSeed={(n) => {
            setWizardOpen(false)
            showToast(`Создано ${n} карточек`)
          }}
        />
      )}

      {toast && (
        <div className="tt-toast-stack">
          <div className="tt-toast">
            <span>{toast.msg}</span>
            {toast.undo && (
              <button
                type="button"
                className="tt-undo"
                onClick={() => {
                  toast.undo!()
                  setToast(null)
                }}
              >
                Отменить
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
