# Wiki / Markdown editor

> Markdown-редактор как ядро вики кампании: поверх visibility-слоя
> (spec-033), четыре ортогональных слоя от хранилища до wikilinks.
> Статус: дизайн-пак Claude Design получен, папка спеки не создана.

---

## Зачем вики

Сейчас лор кампании живёт в разрозненных заметках DM и в голове игроков.
Ноды системы хранят структурированные данные (statblock, поля JSONB),
но нет поверхности «написать связный текст и сослаться на ноду».

Цель — TTRPG-wiki как [LegendKeeper](https://legendkeeper.com/): DM
пишет описание Декана академии, вставляет `[[Декан Сиори]]` — это
ссылка-нода, кликабельная, с backlinks-панелью. Игроки читают; черновики
скрыты до публикации (visibility-слой).

---

## Статус

Дизайн-пак Claude Design получен: `SPEC.md`, `HANDOFF.md`, JSX-фреймы,
`editor.css`. **Отсутствует `colors_and_type.css`** из дизайн-зипа —
нужно запросить. Папка `.specify/specs/021-wiki-editor/` не создана,
`spec.md` не написана.

Spec-021 разблокирован после:

1. Visibility-слоя (spec-033 / [`visibility-and-sandbox.md`](visibility-and-sandbox.md)) — черновик wiki-нод без этого невозможен.
2. Supabase Storage (часть spec-033) — bucket `concept-images`.

---

## Четыре ортогональных слоя

### Слой 1 — Storage

Markdown-тело ноды хранится как `nodes.fields.body: text` (JSONB-поле).
Структурированные поля (`stats`, `ac`, `hp`) — отдельные ключи в том
же `fields`. Два режима рендеринга: карточка «Статы» (типизированный
JSON) и секция «Описание» (markdown body). Суть: статы и проза
перестают мешаться в одном поле.

Единственная «настоящая» миграция: bucket `concept-images` в Supabase
Storage + RLS по `campaign_id` + server action `uploadImage` для
paste/drag-and-drop. Всё остальное — code-only.

### Слой 2 — Wikilinks `[[link]]`

Remark-плагин парсит `[[Title]]` → резолвит `nodes.title` per-campaign
→ рендерит как ссылку на страницу ноды. При вводе `[[` — автокомплит
по нодам кампании. Backlinks-панель: «эту ноду упоминают» — бесплатно
поверх, через full-text search по `fields.body`.

### Слой 3 — Inline-create

Из редактора можно создать новую ноду не выходя из текста: `[[Новый NPC]]`
+ Enter → появляется выбор типа (`npc`, `location`, `encounter`, …) →
нода создаётся с дефолтными полями и занимает место в `[[...]]`.

Права: игрок создаёт `private`-ноду; DM видит в sandbox и может
опубликовать. NPC, созданный игроком, — `party_draft` до DM-апрува.

### Слой 4 — Annotation triggers

Быстрый ввод ссылок по типу сущности (без `[[`). Trigger-символы:

| Символ (en-layout) | Символ (ru-layout) | Тип |
|---|---|---|
| `@` | `@` | PC / NPC |
| `#` | `#` | Location |
| `!` | `!` | Encounter |
| `%` | `%` | Item |
| `*` | `*` | Session / Event |

Ru-layout сложнее: `@` тот же, `#` → `№`, `;` → `...`; нужен fallback
через `[[` если символ не пойман. Точная таблица маппинга — на уровне
Plan.

---

## Layered visibility

Wiki-нода наследует visibility-модель spec-033:

- DM пишет `private`-черновик статьи о «загадочном патруле».
- После сессии публикует → `published`, игроки видят.
- Игрок пишет `party_draft`-заметку «что знает Маркус о Декане» →
  DM апрувит → `published`.

Это та же RLS-логика, та же страница sandbox. Нет отдельного
«wiki-permission layer».

---

## Дизайн-пак

Файлы из Claude Design сидят в дизайн-папке спеки (когда папка будет
создана). Структура пака:

- `SPEC.md` — описание компонентов и сценариев.
- `HANDOFF.md` — инструкция инженеру: что бережно, что гибко.
- JSX-фреймы — поверхности редактора.
- `editor.css` — токены и стили редактора.
- `colors_and_type.css` — **отсутствует, нужно запросить**.

---

> Зависит от [`visibility-and-sandbox.md`](visibility-and-sandbox.md) (spec-033).
> Кормит [`features/chronicles/README.md`](../features/chronicles/README.md)
> (летопись как частный случай wiki-нод).
> Долгосрочный клиент IDEA-063 «Сиория».
