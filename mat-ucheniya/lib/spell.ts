/**
 * Spell (заклинания) — spec-059. PURE helpers, no I/O. Разбор уровня спелла из
 * nodes.fields.level (скрапер пишет int, но толерантно принимаем строку/«Заговор»)
 * и построение имени свитка. Импортируемо откуда угодно (клиент/сервер/тесты).
 */

/**
 * Уровень заклинания из fields.level → целое 0..9, либо null если неизвестно.
 * «Заговор»/«cantrip»/0 → 0. Строки-числа парсятся. Вне 0..9 → null.
 */
export function parseSpellLevel(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const i = Math.trunc(v)
    return i >= 0 && i <= 9 ? i : null
  }
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (s === '') return null
    if (s.includes('заговор') || s.includes('cantrip')) return 0
    const n = parseInt(s, 10)
    return Number.isFinite(n) && n >= 0 && n <= 9 ? n : null
  }
  return null
}

/** Человекочитаемая метка уровня: 0 → «заговор», иначе «N ур.». */
export function spellLevelLabel(level: number): string {
  return level === 0 ? 'заговор' : `${level} ур.`
}

/** Имя предмета-свитка из имени заклинания + уровня: «Свиток: X (N ур.)». */
export function scrollTitle(spellName: string, level: number): string {
  return `Свиток: ${spellName.trim()} (${spellLevelLabel(level)})`
}
