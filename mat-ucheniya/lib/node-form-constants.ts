// Field metadata for the node creation/edit form.

export const FIELD_LABELS: Record<string, string> = {
  description: 'Описание',
  status: 'Статус',
  player: 'Игрок',
  number: 'Номер петли',
  session_number: 'Номер сессии',
  loop_number: 'Петля',
  recap: 'Рекап',
  dm_notes: 'Заметки ДМа',
  played_at: 'Дата игры',
  game_date: 'Игровая дата',
  day_from: 'День от',
  day_to: 'День до',
  length_days: 'Длина петли (дней)',
  notes: 'Заметки',
  title: 'Подзаголовок',
  max_hp: 'Макс. HP',
  statblock_url: 'Ссылка на статблок',
  armor_class: 'Класс брони',
  challenge_rating: 'Показатель опасности',
  // Keys imported in bulk by mig 112 (PCs) and 113 (NPCs) from the
  // player Google Sheet. Until spec-021 (Wiki Editor) builds a richer
  // form, these are display-only in the catalog detail view but kept
  // here so they read as Russian instead of raw keys.
  name_en: 'Имя на английском',
  player_full_name: 'Игрок (полное имя)',
  alt_name: 'Альт. имя',
  class: 'Класс',
  age: 'Возраст',
  height_cm: 'Рост (см)',
  familiar: 'Фамильяр/спутник',
  art_name: 'Арт',
  art_url: 'Ссылка на арт',
  ai_art_name: 'AI-арт',
  ai_art_url: 'Ссылка на AI-арт',
  wiki_url: 'Вики',
  source: 'Источник',
  region: 'Регион',
  group: 'Группа',
  skills: 'Навыки/особенности',
  appearances: 'Появления',
  old_notes: 'Старые заметки',
  // Keys imported by mig 114 (session recaps) from the "Рекапы" sheet.
  time_range: 'Время',
  materials: 'Материалы',
  materials_url: 'Ссылка на материалы',
  perks: 'Плюшки',
  achievements: 'Достижения',
  new_npcs_raw: 'Новые НПС/монстры',
}

export const TEXTAREA_FIELDS = [
  'description', 'recap', 'dm_notes', 'notes',
  // Imported richer text fields (mig 112/113)
  'familiar', 'skills', 'appearances', 'old_notes',
  // Imported (mig 114, session recaps)
  'materials', 'perks', 'achievements', 'new_npcs_raw',
]
export const NUMBER_FIELDS = [
  'number', 'session_number', 'max_hp', 'armor_class',
  'day_from', 'day_to', 'length_days',
  // Imported (mig 112/113)
  'height_cm',
]
export const URL_FIELDS = [
  'statblock_url', 'link', 'url',
  // Imported (mig 112/113)
  'wiki_url', 'art_url', 'ai_art_url',
  // Imported (mig 114)
  'materials_url',
]
export const DATE_FIELDS = ['played_at']
export const HIDDEN_FIELDS = [
  'tags',
  // `hidden` is a forward-compat soft visibility flag set by mig 113
  // for spoiler NPCs; spec-022 will hook it up. Don't surface in the
  // form editor in the meantime.
  'hidden',
]

export const LOOP_STATUSES = [
  { value: 'past', label: 'Прошедшая' },
  { value: 'current', label: 'Текущая' },
  { value: 'future', label: 'Будущая' },
]

// Field ordering priority (lower = earlier)
export function fieldPriority(k: string): number {
  // day_from / day_to sit right after session_number, before other NUMBER_FIELDS
  // that follow — keeps "Номер сессии | День от | День до" in logical order.
  if (k === 'day_from') return 0.4
  if (k === 'day_to') return 0.5
  if (NUMBER_FIELDS.includes(k)) return 0
  if (k === 'status' || k === 'loop_number') return 1
  if (k === 'title' || k === 'player') return 2
  if (DATE_FIELDS.includes(k)) return 3
  if (k === 'game_date') return 4
  if (URL_FIELDS.includes(k)) return 4.5
  if (TEXTAREA_FIELDS.includes(k)) return 5
  return 3
}

// Transliterate Cyrillic + normalize to lowercase snake_case slug.
export function slugify(str: string): string {
  const map: Record<string, string> = {
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'j',
    'к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f',
    'х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
  }
  return str.toLowerCase().split('').map(c => map[c] ?? c).join('')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 50) || 'custom'
}
