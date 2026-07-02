# Начатое, но не законченное

> Спеки в Specify/Clarify и технические хвосты завершённых спек.
> Это не «план» — это работы с конкретным статусом, которые начались,
> но ещё не дошли до прода.

---

## Спеки в работе

### spec-052 Inventory (код готов T001–T029, ждёт T030–T032)

Контейнеры, покупка за голду, наборы, статус «Надето». Плюс прод-фидбэк:
свои pending-заявки с отменой (FR-015), «количество» как первоклассное
поле везде (FR-016, C-12). Статус: код готов (T001–T029) в ветке
`claude/052-inventory-containers-sets`, гейт зелёный; ждёт T030–T032 —
staging + миграции 118/119/120 + E2E, затем PR в `main`.

→ `.specify/specs/052-inventory-containers-sets/spec.md`

### spec-045 RPG Engine Core (Specify draft, ожидает Clarify)

Модули (раса/класс/фит/предмет/бафф), эффекты на параметры, ресурсы
(слоты, HP, ци), слой-0 деривации (формулы Стасяна как база). Открытые
вопросы C-01…C-05; C-06 (прозрачность) решён: любой участник кампании
видит любой лист целиком. Ресёрч-решения D-1…D-13 ждут Андрея
(same-op, add↔mult, roll-эффекты, дельты vs LWW, неопознанные предметы
R9). Мана = DMG Spell Points (R12/FR-025).

→ `.specify/specs/045-rpg-engine-core/spec.md`

### spec-021 Wiki editor (дизайн-пак получен, папка спеки не создана)

Дизайн-пак Claude Design получен (`SPEC.md`, `HANDOFF.md`, JSX-фреймы,
`editor.css`). Отсутствует `colors_and_type.css` из дизайн-зипа —
нужно запросить. Папка `.specify/specs/021-wiki-editor/` не создана,
`spec.md` не написана. Unblocked после того, как visibility-слой
(spec-033 / [`visibility-and-sandbox.md`](visibility-and-sandbox.md))
получит свою спеку.

→ [`wiki-editor.md`](wiki-editor.md)

---

## Технические хвосты завершённых спек

Помечены `(tail)` в `tasks.md` своих спек. Поднимать по запросу,
не по умолчанию.

| Хвост | Спека | Суть |
|---|---|---|
| T036–T039 autogen-badge UI | spec-012 | Визуальный badge «авто-применено» в loop-start setup; отложен как некритичный |
| Manual walkthroughs (013/014/015/017) | spec-013..017 | Ручная проверка happy path сценариев вживую; не баги, просто не задокументировано |
| DDHC source name | spec-018 | Название источника для dnd.su магпредметов не установлено |
| Pagination 10k cap | spec-001 | PostgREST cap ~1000 строк (сейчас ~1600 нод); нужна пагинация, не блокер пока |
| T017 staging (цикл тиммейтом) | spec-043 | Цикл проверки staging с другим участником команды не закрыт |

---

## Технический долг

Из `backlog.md`, раздел «TECH DEBT ultrareview-2» (chat 80).

**TECH-017 [P3]** — `transaction-form.tsx` (947 строк, 15 `useState`).
Один компонент держит state для трёх kind'ов + shortfall + day-input +
submit/delete. Не баг, но страшно расширять. Фикс: `useReducer` или
`useTransactionFormState`. Отдельная сессия, не полиш.

**TECH-021 [P3]** — `useSyncExternalStore` для `use-form-draft.ts`.
Сейчас `useEffect` + `setState` на localStorage — технически корректно,
но lint-rule `react-hooks/set-state-in-effect` ругается. Закрыто
`eslint-disable` с пояснением. Чистый фикс — `useSyncExternalStore`
с `'storage'`-listener.

**BUG-TG-DESKTOP [P2]** — Telegram Desktop: «Ты пока не в кампании»
у добавленного игрока. На телефоне работает, на десктопе — нет.
Гипотеза: закешированный старый webview обходит новый auth-путь.
Шаг 1: полный выход из TG Desktop и заново. Часть spec-044.

→ Полный список с деталями — `backlog.md`.
