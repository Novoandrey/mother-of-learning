'use client'

import { createPortal } from 'react-dom'
import { useMemo, useState } from 'react'
import {
  type NodeTypeKey,
  type StatusColor,
  type StatusId,
  PROJECTS,
  SEED_CARDS,
  STATUSES,
  findProject,
  findType,
} from './types-and-data'
import { StatusPill } from './pieces'

const COLOR_PRESETS: { id: StatusColor; bar: string }[] = [
  { id: 'gray', bar: '#9ca3af' },
  { id: 'slate', bar: '#6b7280' },
  { id: 'blue', bar: '#2563eb' },
  { id: 'amber', bar: '#f59e0b' },
  { id: 'green', bar: '#16a34a' },
  { id: 'red', bar: '#dc2626' },
]

export function SettingsDrawer({ onClose, onOpenWizard }: { onClose: () => void; onOpenWizard: () => void }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <>
      <div className="tt-drawer-backdrop" onClick={onClose} />
      <aside className="tt-drawer">
        <header>
          <h2>Настройки доски</h2>
          <button className="tt-btn-icon tt-x" onClick={onClose} type="button" aria-label="Закрыть">
            ✕
          </button>
        </header>
        <div className="tt-body">
          <section className="tt-cfg-section">
            <h3>
              <span>Колонки · статусы</span>
              <button className="tt-btn-sec tiny tt-add" type="button">
                + Колонка
              </button>
            </h3>
            {STATUSES.map((s) => {
              const count = SEED_CARDS.filter((c) => c.status === s.id).length
              const blocked = count > 0
              return (
                <div key={s.id} className="tt-cfg-row">
                  <span className="tt-grip">⋮⋮</span>
                  <div>
                    <div className="tt-name">{s.label}</div>
                    <div className="tt-meta">
                      {s.slug} · {count} карт.
                    </div>
                  </div>
                  <div className="tt-swatches" title="Цвет колонки">
                    {COLOR_PRESETS.map((p) => (
                      <span
                        key={p.id}
                        className={`tt-sw${p.id === s.color ? ' on' : ''}`}
                        style={{ background: p.bar }}
                      />
                    ))}
                  </div>
                  <button
                    className="tt-btn-icon"
                    type="button"
                    title={blocked ? `Нельзя удалить — ${count} карт.` : 'Удалить'}
                    style={blocked ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                  >
                    ✕
                  </button>
                </div>
              )
            })}
          </section>

          <section className="tt-cfg-section">
            <h3>
              <span>Проекты</span>
              <button className="tt-btn-sec tiny tt-add" type="button">
                + Проект
              </button>
            </h3>
            {PROJECTS.map((p) => {
              const count = SEED_CARDS.filter((c) => c.project === p.id).length
              return (
                <div key={p.id} className="tt-cfg-row">
                  <span className="tt-grip">⋮⋮</span>
                  <div>
                    <div className="tt-name">{p.name}</div>
                    <div className="tt-meta">{count} карт.</div>
                  </div>
                  <div />
                  <button className="tt-btn-icon" type="button" title="Удалить проект">
                    ✕
                  </button>
                </div>
              )
            })}
          </section>

          <section className="tt-cfg-section">
            <h3>Pre-seed</h3>
            <div className="tt-cfg-row" style={{ gridTemplateColumns: '1fr auto' }}>
              <div>
                <div className="tt-name">Засеять автоматически</div>
                <div
                  className="tt-meta"
                  style={{ fontFamily: 'var(--font-sans)', color: 'var(--gray-500)' }}
                >
                  Из <code className="tt-meta">backlog.md</code>,{' '}
                  <code className="tt-meta">.specify/specs/*</code>, эпиков из{' '}
                  <code className="tt-meta">NEXT.md</code>.
                </div>
              </div>
              <button
                className="tt-btn-sec tiny"
                type="button"
                onClick={() => {
                  onClose()
                  onOpenWizard()
                }}
              >
                Запустить →
              </button>
            </div>
          </section>
        </div>
        <div className="tt-footer">
          <span style={{ marginRight: 'auto', fontSize: 12, color: 'var(--gray-400)' }}>
            Только ДМ может менять колонки и проекты.
          </span>
          <button className="tt-btn-sec" type="button" onClick={onClose}>
            Готово
          </button>
        </div>
      </aside>
    </>,
    document.body,
  )
}

/* Wizard */
type SeedItem = {
  ref: string
  type: NodeTypeKey
  title: string
  project: string
  target: StatusId
}

const SEED_GROUPS: { id: 'epics' | 'specs' | 'ideas'; title: string; desc: string; count: number; items: SeedItem[] }[] = [
  {
    id: 'epics',
    title: 'Эпики из NEXT.md',
    desc: '4 верхнеуровневых эпика — попадут в Backlog. По умолчанию все включены.',
    count: 4,
    items: [
      { ref: 'E-01', type: 'epic', title: 'Dark mode', project: 'p-platform', target: 'backlog' },
      { ref: 'E-02', type: 'epic', title: 'История курсов валют (gp/sp/cp)', project: 'p-ledger', target: 'backlog' },
      { ref: 'E-03', type: 'epic', title: 'Обратные связи и backlinks', project: 'p-catalog', target: 'backlog' },
      { ref: 'E-04', type: 'epic', title: 'Pre-seed wizard для досок', project: 'p-task', target: 'backlog' },
    ],
  },
  {
    id: 'specs',
    title: 'Спеки из .specify/specs/*',
    desc: '22 спеки. Целевой статус выводится из tasks.md (готово / в работе / на проверке / backlog).',
    count: 22,
    items: [
      { ref: 'spec-022', type: 'spec', title: 'Task Tracker · matrix board', project: 'p-task', target: 'wip' },
      { ref: 'spec-021', type: 'spec', title: 'auto-sync контракт', project: 'p-task', target: 'review' },
      { ref: 'spec-020', type: 'spec', title: 'bulk-approve UI', project: 'p-ledger', target: 'wip' },
      { ref: 'spec-019', type: 'spec', title: 'схема task_meta', project: 'p-task', target: 'done' },
      { ref: 'spec-018', type: 'spec', title: 'approval queue · v2', project: 'p-ledger', target: 'wip' },
      { ref: 'spec-014', type: 'spec', title: 'фронтир-маркер на прогресс-баре', project: 'p-loops', target: 'wip' },
      { ref: 'spec-011', type: 'spec', title: 'graph view с типизированными рёбрами', project: 'p-catalog', target: 'wip' },
      { ref: 'spec-008', type: 'spec', title: 'миграция Next 16 → app router', project: 'p-platform', target: 'wip' },
    ],
  },
  {
    id: 'ideas',
    title: 'Идеи из backlog.md',
    desc: '~60 IDEA-NNN, по умолчанию только P2/P3. Целевой статус — Идея.',
    count: 32,
    items: [
      { ref: 'IDEA-013', type: 'idea', title: 'Supabase RLS для read-only ролей', project: 'p-platform', target: 'idea' },
      { ref: 'IDEA-022', type: 'idea', title: 'Слияние дубликатов NPC', project: 'p-catalog', target: 'idea' },
      { ref: 'IDEA-031', type: 'idea', title: 'Сравнение двух петель side-by-side', project: 'p-loops', target: 'idea' },
      { ref: 'IDEA-039', type: 'idea', title: 'CSV-импорт стартовых остатков', project: 'p-ledger', target: 'idea' },
      { ref: 'IDEA-047', type: 'idea', title: 'DnD между ячейками', project: 'p-task', target: 'idea' },
      { ref: 'IDEA-051', type: 'idea', title: 'per-project status sets', project: 'p-task', target: 'idea' },
    ],
  },
]

export function PreSeedWizard({
  onClose,
  onSeed,
}: {
  onClose: () => void
  onSeed: (n: number) => void
}) {
  const [step, setStep] = useState(1)
  const [groups, setGroups] = useState<Record<'epics' | 'specs' | 'ideas', boolean>>({
    epics: true,
    specs: true,
    ideas: true,
  })
  const [priority, setPriority] = useState<'all' | 'p2-p3' | 'p3'>('p2-p3')
  const [target, setTarget] = useState<string>('p-task')
  const [excluded, setExcluded] = useState<Record<string, boolean>>({})

  const total = useMemo(() => {
    let t = 0
    SEED_GROUPS.forEach((g) => {
      if (groups[g.id]) t += g.count
    })
    return t
  }, [groups])

  const previewItems = useMemo(() => {
    const items: SeedItem[] = []
    SEED_GROUPS.forEach((g) => {
      if (groups[g.id]) items.push(...g.items)
    })
    return items
  }, [groups])

  const includedCount =
    previewItems.filter((it) => !excluded[it.ref]).length +
    Math.max(0, total - previewItems.length)

  const distribution = useMemo(() => {
    const d: Record<StatusId, number> = { idea: 0, backlog: 0, wip: 0, review: 0, done: 0 }
    previewItems.forEach((it) => {
      if (!excluded[it.ref]) d[it.target] = (d[it.target] || 0) + 1
    })
    return d
  }, [previewItems, excluded])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="tt-wizard-backdrop" onClick={onClose}>
      <div className="tt-wizard" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Pre-seed · засеять доску</h2>
          <button className="tt-btn-icon tt-x" type="button" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </header>
        <div className="tt-steps">
          {(['Источники', 'Превью', 'Подтверждение'] as const).map((s, i) => (
            <div
              key={s}
              className={`tt-step${i + 1 === step ? ' on' : i + 1 < step ? ' done' : ''}`}
            >
              <span className="tt-num">0{i + 1}</span>
              <span>{s}</span>
            </div>
          ))}
        </div>

        <div className="tt-body">
          {step === 1 && (
            <>
              {SEED_GROUPS.map((g) => (
                <div key={g.id} className={`tt-grp${groups[g.id] ? ' on' : ''}`}>
                  <span
                    className="tt-ck"
                    onClick={() => setGroups({ ...groups, [g.id]: !groups[g.id] })}
                    role="checkbox"
                    aria-checked={groups[g.id]}
                  >
                    {groups[g.id] && '✓'}
                  </span>
                  <div>
                    <div className="tt-ttl">{g.title}</div>
                    <div className="tt-desc">{g.desc}</div>
                    {g.id === 'ideas' && groups.ideas && (
                      <div className="tt-sub-filter">
                        {(
                          [
                            ['all', 'все'],
                            ['p2-p3', 'P2/P3'],
                            ['p3', 'только P3'],
                          ] as const
                        ).map(([v, l]) => (
                          <span
                            key={v}
                            className={`tt-fchip${priority === v ? ' on' : ''}`}
                            onClick={() => setPriority(v)}
                          >
                            {l}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="tt-ct">{g.count}</span>
                </div>
              ))}
              <div
                style={{
                  marginTop: 18,
                  padding: '12px 14px',
                  background: 'var(--gray-50)',
                  border: '1px solid var(--gray-200)',
                  borderRadius: 6,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--gray-400)',
                    fontWeight: 600,
                    marginBottom: 6,
                  }}
                >
                  Целевой проект
                </div>
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  style={{
                    font: 'inherit',
                    padding: '5px 8px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 6,
                    background: '#fff',
                    width: '100%',
                  }}
                >
                  {PROJECTS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  <option value="__new">+ Новый проект…</option>
                </select>
                <div className="tt-note" style={{ marginTop: 6 }}>
                  Карточки попадут в этот проект. Можно перенести позже.
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div style={{ marginBottom: 10, fontSize: 14, color: 'var(--gray-600)' }}>
                Будет создано <b style={{ fontVariantNumeric: 'tabular-nums' }}>{includedCount}</b>{' '}
                карточек. Можно исключить любую.
              </div>
              <div
                style={{
                  border: '1px solid var(--gray-200)',
                  borderRadius: 6,
                  overflow: 'hidden',
                }}
              >
                {previewItems.map((it) => {
                  const inc = !excluded[it.ref]
                  const t = findType(it.type)
                  const proj = findProject(it.project)
                  return (
                    <div
                      key={it.ref}
                      className={`tt-preview-row ${inc ? 'included' : 'excluded'}`}
                    >
                      <span
                        className="tt-ck"
                        onClick={() => setExcluded({ ...excluded, [it.ref]: inc })}
                      >
                        {inc && '✓'}
                      </span>
                      <span title={t.label}>{t.emoji}</span>
                      <span className="tt-ref">{it.ref}</span>
                      <span className="tt-ttl">
                        {it.title}{' '}
                        <span className="tt-muted" style={{ fontSize: 11 }}>
                          · {proj?.name}
                        </span>
                      </span>
                      <StatusPill statusId={it.target} />
                    </div>
                  )
                })}
                {Math.max(0, total - previewItems.length) > 0 && (
                  <div className="tt-preview-row" style={{ color: 'var(--gray-400)' }}>
                    <span />
                    <span />
                    <span className="tt-ref">…</span>
                    <span>и ещё {total - previewItems.length} (свернуто)</span>
                    <span />
                  </div>
                )}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div style={{ fontSize: 16, marginBottom: 14 }}>
                Создать{' '}
                <b style={{ fontVariantNumeric: 'tabular-nums' }}>{includedCount}</b> карточек в
                проекте <b>{findProject(target)?.name || 'новый проект'}</b>?
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: 6,
                }}
              >
                {STATUSES.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      background: 'var(--gray-50)',
                      border: '1px solid var(--gray-200)',
                      borderRadius: 6,
                      padding: '10px 12px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: 'var(--gray-400)',
                        fontWeight: 600,
                      }}
                    >
                      {s.label}
                    </div>
                    <div
                      style={{
                        fontSize: 22,
                        fontWeight: 600,
                        fontVariantNumeric: 'tabular-nums',
                        marginTop: 4,
                      }}
                    >
                      {distribution[s.id] || 0}
                    </div>
                  </div>
                ))}
              </div>
              <div
                className="tt-note"
                style={{
                  marginTop: 18,
                  padding: '10px 12px',
                  background: 'var(--blue-50)',
                  borderRadius: 6,
                  color: 'var(--blue-700)',
                }}
              >
                Откатить можно в течение 24 ч из <b>Настройки доски → Pre-seed → история</b>.
              </div>
            </>
          )}
        </div>

        <div className="tt-footer">
          <span className="tt-ct">
            шаг {step}/3 · {total} карт. в источниках
          </span>
          {step > 1 && (
            <button className="tt-btn-sec" type="button" onClick={() => setStep(step - 1)}>
              ← Назад
            </button>
          )}
          {step < 3 ? (
            <button className="tt-btn-pri" type="button" onClick={() => setStep(step + 1)}>
              Далее →
            </button>
          ) : (
            <button className="tt-btn-pri" type="button" onClick={() => onSeed(includedCount)}>
              Засеять {includedCount}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
