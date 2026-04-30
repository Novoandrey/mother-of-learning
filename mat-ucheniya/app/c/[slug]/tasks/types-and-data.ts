/**
 * Spec-022 Task Tracker — types and mock seed data.
 *
 * Ported from Claude Design package (data.jsx). The data is hardcoded
 * here for the prototype embed; spec-022 will replace this with real
 * graph queries (cards = view over existing nodes).
 *
 * Source: design package h/e2Zv9lvo8GKkV4FiTp47JA · data.jsx
 */

export type StatusId = 'idea' | 'backlog' | 'wip' | 'review' | 'done'
export type StatusColor = 'gray' | 'slate' | 'blue' | 'amber' | 'green' | 'red'

export type Status = {
  id: StatusId
  slug: string
  label: string
  color: StatusColor
}

export type Project = {
  id: string
  name: string
}

export type Member = {
  id: string
  name: string
  initials: string
  color: string
  role: 'dm' | 'player'
}

export type NodeTypeKey =
  | 'spec'
  | 'idea'
  | 'epic'
  | 'pc'
  | 'npc'
  | 'loc'
  | 'item'
  | 'session'
  | 'encounter'
  | 'loop'

export type NodeTypeMeta = {
  emoji: string
  label: string
}

export type Card = {
  id: string
  project: string
  status: StatusId
  type: NodeTypeKey
  title: string
  ref: string
  assignee: string | null
  needsAttention: boolean
  autoSynced: boolean
  excerpt: string
  lastActivity: { chat: string; date: string } | null
}

// ─────────────────────────────────────────────────────────────────────

export const STATUSES: readonly Status[] = [
  { id: 'idea', slug: 'idea', label: 'Идея', color: 'gray' },
  { id: 'backlog', slug: 'backlog', label: 'Backlog', color: 'slate' },
  { id: 'wip', slug: 'wip', label: 'В работе', color: 'blue' },
  { id: 'review', slug: 'review', label: 'На проверке', color: 'amber' },
  { id: 'done', slug: 'done', label: 'Готово', color: 'green' },
] as const

export const PROJECTS: readonly Project[] = [
  { id: 'p-task', name: 'Task Tracker' },
  { id: 'p-ledger', name: 'Бухгалтерия v2' },
  { id: 'p-loops', name: 'Петли · UX' },
  { id: 'p-catalog', name: 'Каталог · граф' },
  { id: 'p-platform', name: 'Платформа' },
] as const

export const MEMBERS: readonly Member[] = [
  { id: 'u-dm', name: 'ДМ', initials: 'ДМ', color: '#1d4ed8', role: 'dm' },
  { id: 'u-ana', name: 'Аня', initials: 'А', color: '#15803d', role: 'player' },
  { id: 'u-kir', name: 'Кир', initials: 'К', color: '#b45309', role: 'player' },
  { id: 'u-mit', name: 'Митя', initials: 'М', color: '#a855f7', role: 'player' },
  { id: 'u-vas', name: 'Вася', initials: 'В', color: '#dc2626', role: 'player' },
  { id: 'u-yul', name: 'Юля', initials: 'Ю', color: '#0891b2', role: 'player' },
] as const

export const NODE_TYPES: Record<NodeTypeKey, NodeTypeMeta> = {
  spec: { emoji: '📐', label: 'spec' },
  idea: { emoji: '💡', label: 'идея' },
  epic: { emoji: '🏔', label: 'epic' },
  pc: { emoji: '🧙', label: 'PC' },
  npc: { emoji: '👤', label: 'NPC' },
  loc: { emoji: '🗺', label: 'локация' },
  item: { emoji: '🎒', label: 'предмет' },
  session: { emoji: '📋', label: 'сессия' },
  encounter: { emoji: '⚔️', label: 'энкаунтер' },
  loop: { emoji: '🔄', label: 'петля' },
}

let _id = 0
const c = (o: Partial<Card> & Pick<Card, 'project' | 'status' | 'type' | 'title' | 'ref'>): Card => ({
  id: `c-${++_id}`,
  needsAttention: false,
  autoSynced: true,
  assignee: null,
  excerpt: '',
  lastActivity: null,
  ...o,
})

export const SEED_CARDS: readonly Card[] = [
  // p-task (Task Tracker spec project)
  c({
    project: 'p-task', status: 'wip', type: 'spec',
    title: 'spec-022 · Task Tracker · matrix board', ref: 'spec-022',
    assignee: 'u-dm', lastActivity: { chat: 'chat-184', date: '2026-04-29' },
    excerpt: 'Канбан, агрегирующий задачи в матрицу project × status. Карточка — view над существующим узлом графа.',
  }),
  c({
    project: 'p-task', status: 'review', type: 'spec',
    title: 'spec-021 · auto-sync контракт', ref: 'spec-021',
    assignee: 'u-dm', lastActivity: { chat: 'chat-181', date: '2026-04-27' },
    excerpt: 'Источник истины — chatlog\u0027и Claude. На каждое открытие нового чата по теме spec-NNN — карточка движется.',
  }),
  c({
    project: 'p-task', status: 'backlog', type: 'epic',
    title: 'E-04 · pre-seed wizard для досок', ref: 'E-04',
    autoSynced: false,
    excerpt: '3 шага: источники → превью → подтверждение. Ролбэк в течение N часов — открытый вопрос.',
  }),
  c({
    project: 'p-task', status: 'backlog', type: 'idea',
    title: 'IDEA-047 · drag-and-drop между ячейками', ref: 'IDEA-047',
    needsAttention: true, autoSynced: false,
  }),
  c({
    project: 'p-task', status: 'idea', type: 'idea',
    title: 'IDEA-051 · per-project status sets', ref: 'IDEA-051',
    autoSynced: false,
    excerpt: 'Разные колонки на разных проектах. Сейчас — общий набор.',
  }),
  c({
    project: 'p-task', status: 'idea', type: 'idea',
    title: 'IDEA-052 · фильтр-DSL: is:open assignee:me', ref: 'IDEA-052',
    autoSynced: false,
  }),
  c({
    project: 'p-task', status: 'done', type: 'spec',
    title: 'spec-019 · схема task_meta', ref: 'spec-019',
    assignee: 'u-dm', lastActivity: { chat: 'chat-171', date: '2026-04-19' },
  }),

  // p-ledger
  c({
    project: 'p-ledger', status: 'wip', type: 'spec',
    title: 'spec-018 · approval queue · v2', ref: 'spec-018',
    assignee: 'u-dm', lastActivity: { chat: 'chat-183', date: '2026-04-28' },
  }),
  c({
    project: 'p-ledger', status: 'wip', type: 'spec',
    title: 'spec-020 · bulk-approve UI', ref: 'spec-020',
    assignee: 'u-ana', lastActivity: { chat: 'chat-180', date: '2026-04-26' },
    needsAttention: true,
  }),
  c({
    project: 'p-ledger', status: 'review', type: 'spec',
    title: 'spec-017 · revert транзакций', ref: 'spec-017',
    assignee: 'u-dm', lastActivity: { chat: 'chat-179', date: '2026-04-25' },
  }),
  c({
    project: 'p-ledger', status: 'backlog', type: 'idea',
    title: 'IDEA-039 · CSV-импорт стартовых остатков', ref: 'IDEA-039',
    autoSynced: false,
  }),
  c({
    project: 'p-ledger', status: 'backlog', type: 'epic',
    title: 'E-02 · история курсов валют (gp/sp/cp)', ref: 'E-02',
    autoSynced: false,
  }),
  c({
    project: 'p-ledger', status: 'idea', type: 'idea',
    title: 'IDEA-058 · сводка по дням петли', ref: 'IDEA-058',
    autoSynced: false,
  }),
  c({
    project: 'p-ledger', status: 'done', type: 'spec',
    title: 'spec-016 · pending-approval badge', ref: 'spec-016',
    assignee: 'u-dm', lastActivity: { chat: 'chat-168', date: '2026-04-15' },
  }),
  c({
    project: 'p-ledger', status: 'done', type: 'spec',
    title: 'spec-015 · фильтры по PC × петле', ref: 'spec-015',
    assignee: 'u-dm', lastActivity: { chat: 'chat-165', date: '2026-04-12' },
  }),

  // p-loops
  c({
    project: 'p-loops', status: 'wip', type: 'spec',
    title: 'spec-014 · фронтир-маркер на прогресс-баре', ref: 'spec-014',
    assignee: 'u-kir', lastActivity: { chat: 'chat-178', date: '2026-04-24' },
  }),
  c({
    project: 'p-loops', status: 'review', type: 'spec',
    title: 'spec-013 · пересечения сессий по дням', ref: 'spec-013',
    assignee: 'u-kir', lastActivity: { chat: 'chat-176', date: '2026-04-23' },
    needsAttention: true,
  }),
  c({
    project: 'p-loops', status: 'backlog', type: 'idea',
    title: 'IDEA-031 · сравнение двух петель side-by-side', ref: 'IDEA-031',
    autoSynced: false,
  }),
  c({
    project: 'p-loops', status: 'idea', type: 'idea',
    title: 'IDEA-064 · авто-расчёт «дошли до дня»', ref: 'IDEA-064',
    autoSynced: false,
  }),
  c({
    project: 'p-loops', status: 'done', type: 'spec',
    title: 'spec-012 · timeline · день-ось', ref: 'spec-012',
    assignee: 'u-kir', lastActivity: { chat: 'chat-160', date: '2026-04-08' },
  }),

  // p-catalog
  c({
    project: 'p-catalog', status: 'wip', type: 'spec',
    title: 'spec-011 · graph view с типизированными рёбрами', ref: 'spec-011',
    assignee: 'u-mit', lastActivity: { chat: 'chat-185', date: '2026-04-30' },
  }),
  c({
    project: 'p-catalog', status: 'backlog', type: 'epic',
    title: 'E-03 · обратные связи и backlinks', ref: 'E-03',
    autoSynced: false,
  }),
  c({
    project: 'p-catalog', status: 'backlog', type: 'idea',
    title: 'IDEA-022 · слияние дубликатов NPC', ref: 'IDEA-022',
    autoSynced: false,
  }),
  c({
    project: 'p-catalog', status: 'backlog', type: 'idea',
    title: 'IDEA-029 · теги-алиасы', ref: 'IDEA-029',
    autoSynced: false,
  }),
  c({
    project: 'p-catalog', status: 'review', type: 'spec',
    title: 'spec-010 · кир. поиск с raznost\u0027ю регистров', ref: 'spec-010',
    assignee: 'u-mit', lastActivity: { chat: 'chat-177', date: '2026-04-24' },
  }),
  c({
    project: 'p-catalog', status: 'idea', type: 'idea',
    title: 'IDEA-067 · экспорт подграфа в .json', ref: 'IDEA-067',
    autoSynced: false,
  }),
  c({
    project: 'p-catalog', status: 'done', type: 'spec',
    title: 'spec-009 · type-icons → emoji-поле', ref: 'spec-009',
    assignee: 'u-mit', lastActivity: { chat: 'chat-158', date: '2026-04-05' },
  }),

  // p-platform
  c({
    project: 'p-platform', status: 'wip', type: 'spec',
    title: 'spec-008 · миграция Next 16 → app router', ref: 'spec-008',
    assignee: 'u-dm', lastActivity: { chat: 'chat-186', date: '2026-04-30' },
    needsAttention: true,
  }),
  c({
    project: 'p-platform', status: 'backlog', type: 'epic',
    title: 'E-01 · dark mode', ref: 'E-01',
    autoSynced: false,
  }),
  c({
    project: 'p-platform', status: 'backlog', type: 'idea',
    title: 'IDEA-013 · Supabase RLS для read-only ролей', ref: 'IDEA-013',
    autoSynced: false,
  }),
  c({
    project: 'p-platform', status: 'review', type: 'spec',
    title: 'spec-007 · CI: lint + типы + e2e', ref: 'spec-007',
    assignee: 'u-dm', lastActivity: { chat: 'chat-174', date: '2026-04-22' },
  }),
  c({
    project: 'p-platform', status: 'idea', type: 'idea',
    title: 'IDEA-070 · бэкап-снапшоты раз в час', ref: 'IDEA-070',
    autoSynced: false,
  }),
  c({
    project: 'p-platform', status: 'idea', type: 'idea',
    title: 'IDEA-071 · тёплый кэш RSC', ref: 'IDEA-071',
    autoSynced: false,
  }),
  c({
    project: 'p-platform', status: 'idea', type: 'idea',
    title: 'IDEA-072 · телеметрия time-to-interaction', ref: 'IDEA-072',
    autoSynced: false,
  }),
  c({
    project: 'p-platform', status: 'done', type: 'spec',
    title: 'spec-006 · @fontsource cyrillic-only cuts', ref: 'spec-006',
    assignee: 'u-dm', lastActivity: { chat: 'chat-155', date: '2026-04-02' },
  }),
] as const

// ── Lookup helpers ───────────────────────────────────────────────────

export function findStatus(id: string): Status | undefined {
  return STATUSES.find((s) => s.id === id)
}
export function findProject(id: string): Project | undefined {
  return PROJECTS.find((p) => p.id === id)
}
export function findMember(id: string | null): Member | undefined {
  if (!id) return undefined
  return MEMBERS.find((m) => m.id === id)
}
export function findType(t: string): NodeTypeMeta {
  return NODE_TYPES[t as NodeTypeKey] || { emoji: '·', label: t }
}

export function fmtDate(d: string | null | undefined): string | null {
  if (!d) return null
  const [, m, day] = d.split('-').map(Number)
  return `${String(day).padStart(2, '0')}.${String(m).padStart(2, '0')}`
}

// Strip ref prefix from title for display (e.g. "spec-022 · Foo bar" → "Foo bar")
export function stripRefPrefix(title: string): string {
  return title.replace(/^(spec-\d+|IDEA-\d+|E-\d+)\s·\s/, '')
}
