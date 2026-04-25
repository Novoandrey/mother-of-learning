# Chat 54 — spec-015 Specify + Clarify, 2026-04-26

## Контекст (откуда пришли)

Spec-014 (approval flow) закрыта в chat 53, в проде. NEXT.md
указывал spec-015 (Item Catalog Integration) как next priority,
без spec.md. Пользователь стартовал сессию с дополнительным
контекстом: табличный вид с группировкой по
категориям/редкости/цене/доступности, PC inventory beyond gold,
история транзакций предмета, привязка к энкаунтерам/локациям.

## Что сделано

### Scope decision (чат-уровень)
Привязка к локациям (часть IDEA-054) **исключена** из spec-015 —
пользователь подтвердил «локации необязательны, не факт что
понадобятся». IDEA-054 в backlog'е остаётся как "deprioritised".
Spec-013 уже покрывает encounter-loot — никаких новых фич туда
не нужно, только post-spec-015 backfill `item_node_id` в
драфтах.

### Specify phase — spec.md (1357 lines)
Полностью с нуля: 7 user stories (US1-US7), 38 FR, 11 SC, Edge
Cases, Out of Scope. Пять **архитектурных pinned points** в §
Context:
1. **Item-нода = Образец (Platonic template)**, транзакции =
   instances. Образец не движется, не убывает; его правят редко.
2. Items are nodes, not their own table.
3. `transactions.item_node_id` nullable (back-compat).
4. **Inventory = temporal slice (loop, day) — день это
   user-controlled picker, не gate**.
5. Catalog read-mostly, write-DM-only.

User-driven уточнение в середине Specify: «образец из мира идей
Платона» + «текущий день, где остановился во времени». Это
породило FR-030 (Образец edit как deliberate, friction-bearing
DM action) + FR-023a/b и переписало US4 acceptance под
temporal-slice модель.

### Clarify phase — 8 questions resolved
Четыре партии тапалками через ask_user_input_v0:

- **Q1 Storage**: C — гибрид (hot columns + JSONB)
- **Q2 TECH-011**: A — keep `categories(scope='item')`
- **Q3 SRD seed**: A — все ~400 SRD; English `srd_slug` +
  Russian `title` (важное расширение от пользователя)
- **Q4 Backfill**: B — strict by title OR srd_slug (нет fuzzy
  риска благодаря двум ключам)
- **Q5 Availability**: A + DM-configurable per-campaign
  list (slug+label). Pattern также применён к slot и source —
  все три value lists DM-настраиваемые
- **Q6 URL + slot**: A — `/items` primary, `/catalog?type=item`
  alias. **Дополнительное требование от пользователя**: новое
  поле `slot` (ring/cloak/amulet/boots/gloves/headwear/belt/
  body/shield/1-handed/2-handed/versatile/ranged) — ещё одна
  DM-configurable value list (FR-005a).
- **Q7 History coexistence**: A — только linked rows
- **Q8 Frontier**: **переформулирован пользователем**. Не A/B/C
  (computed frontier as security gate), а "**day picker как UI
  control, ничего не блочить, прозрачность для ДМа**". FR-023
  переписан: день — user-chosen 1..30, default через
  `computeDefaultDayForTx` (existing helper из spec-010).

### Структурные изменения spec.md в Clarify
- Header: Status `Draft → Clarified (2026-04-26)`
- § Context: 5 pinned points (был 3 до уточнений про Образец и
  temporal slice)
- FR-002: расширен — slot, srd_slug, гибридное хранилище
  закодифицировано
- FR-005a/b/c/d: новые — slot/source/availability как
  DM-configurable lists per-campaign + settings page
- FR-007/008/009: slot в колонках/группировках/фильтрах
- FR-023/023a/023b: переписаны — день как picker, default
  helper, никаких блоков
- FR-030/031/032: Образец edit semantics (rename, delete,
  scope-of-change visibility)
- US4: переработан narrative + 9 acceptance scenarios под
  picker-not-gate модель
- Edge cases: убран "frontier disagreement", добавлены "future
  days allowed", "independent pickers", "loop excludes futures"
- SC-008/009/010/011: refresh — default agreement vs forced
  sync, pure read on picker move, no blocks at day 30
- § Open Questions (200 lines) **заменён** на § Clarifications
  (220 lines) с full rationale per Q.

### Files

`.specify/specs/015-item-catalog/spec.md` — 1357 lines, status
**Clarified**, ready for **Plan** phase.

## Миграции

Нет (spec-only chat).

## Коммиты

(Pending — будут в конце сессии при `git push`.)

## Действия пользователю (после чата)

- [ ] Подтвердить spec.md в новом чате через «ok» → стартовать
  Plan phase.
- [ ] Просмотреть § Clarifications для всех 8 Q — особенно Q5/Q6
  (DM-configurable value lists pattern) и Q8 (transparent day
  picker).

## Что помнить следующему чату

- **Spec-015 в Clarified state, ждёт Plan.** Plan.md должен:
  - Решить placement hot columns: на `nodes` напрямую (gated
    `type='item'`, NULL elsewhere) ИЛИ side table
    `item_attributes(node_id PK, …)`. Оба viable.
  - Инспектировать wallet block: какой default helper она
    использует, чтобы inventory tab дёрнул тот же.
  - Спроектировать settings page для 4 value lists (item
    category, slot, source, availability) — единый паттерн.
  - SRD seed source: где брать ~400 предметов с en+ru?
    Существующий SRD-парсер для статблоков (`mat-ucheniya/
    scripts/`) — ориентир, но items это другой dataset.
  - Backfill telemetry: миграция должна логировать counts
    (FR-029).
- **TECH-011 закрыт как "keep"** — `categories(scope='transaction')`
  остаётся жить рядом с `categories(scope='item')`.
- **IDEA-054 (PC↔Location граф) остаётся deprioritised** —
  пользователь явно сказал, что локации не факт что понадобятся.
  В § Out of Scope spec-015 это зафиксировано.
- **Слот как DM-configurable value list** — это новое требование,
  пришло во время Q6. Plan должен спроектировать единый pattern
  для всех 4 value lists (category уже в `categories`, остальные
  3 — extension того же паттерна или новая таблица).

## Размышления

Q8-resolution был самым ценным моментом чата. Изначально я
оформил его как computed-frontier question (per-actor vs
campaign-wide vs hybrid), все три варианта подразумевали
"frontier — это security gate, нужно правильно его вычислить".
Пользователь одной фразой развалил эту рамку: "ничего не
блочить, главное прозрачность для ДМа". Это упростило FR-023
драматически (с трёх FR'ов с frontier-resolver на один FR с
day picker), убрало целый класс edge cases (frontier
disagreement, frontier moves backwards mid-action), и
сделало модель более согласованной с уже работающим в проде
паттерном (`computeDefaultDayForTx` уже умеет это для transaction
form). Хороший случай "юзер знает свой UX лучше чем спека на
бумаге".

Платоновский образец как метафора оказался полезным — это
сразу разнесло "что в Образце меняется (редко, deliberate)"
от "что в транзакциях меняется (постоянно, ledger)". Без этой
формулировки FR-030 был бы лишь "DM может редактировать item",
без понимания почему это должно быть friction-bearing.
