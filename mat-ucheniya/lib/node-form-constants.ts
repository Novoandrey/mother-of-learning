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
  notes: 'Заметки',
  title: 'Подзаголовок',
  max_hp: 'Макс. HP',
  statblock_url: 'Ссылка на статблок',
  armor_class: 'Класс брони',
  challenge_rating: 'Показатель опасности',
}

export const TEXTAREA_FIELDS = ['description', 'recap', 'dm_notes', 'notes']
export const NUMBER_FIELDS = ['number', 'session_number', 'max_hp', 'armor_class']
export const URL_FIELDS = ['statblock_url', 'link']
export const DATE_FIELDS = ['played_at']
export const HIDDEN_FIELDS = ['tags']

export const LOOP_STATUSES = [
  { value: 'past', label: 'Прошедшая' },
  { value: 'current', label: 'Текущая' },
  { value: 'future', label: 'Будущая' },
]

// Field ordering priority (lower = earlier)
export function fieldPriority(k: string): number {
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
