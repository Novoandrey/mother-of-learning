# Visibility и sandbox

> Трёхуровневая видимость нод: фундамент, без которого DM не может
> «приготовить» энкаунтер заранее без спойлеров, а wiki не может иметь
> черновики. Номер спеки — 033 (роадмап 030+, NEXT.md).

---

## Проблема сегодня

Сейчас всё, что DM создаёт в системе, **немедленно видно игрокам** в
каталоге и графе нод. DM не может написать «Патруль Культа · Тяжёлый»
на следующую сессию без того, чтобы любой игрок, зашедший в каталог,
увидел название и описание. Обходной путь: DM ничего не пишет в систему
до начала сессии (всё на бумаге / Google Docs). Это нарушает принцип
[«мир как лог наблюдений»](../concepts/world-as-observation-log.md).

---

## Три состояния видимости

Целевая модель — новое поле `nodes.visibility` (`text`, индексируемый):

| Значение | Кто видит |
|---|---|
| `private` | Только автор (создавший ноду) |
| `party_draft` | Все участники кампании (`member`), кроме: игроки без `dm`-роли видят нодy как существующую, но без контента; `owner` + `dm` видят полностью |
| `published` | Все участники + spectator'ы |

> Default для новых нод — `published` (backward-compat). Существующие
> ноды мигрируются в `published` одним `UPDATE`.

`private` — для DM-заметок «только для меня». `party_draft` — черновик,
который DM готовит, а потом публикует. Игроки видят что нода «есть»
(чтобы не было загадочных рёбер в никуда), но не видят контент.

---

## RLS rewrite

Текущие политики на `nodes` проверяют только `campaign_id` и `role`.
После spec-033:

```sql
-- SELECT: участник видит ноду если:
-- 1) visibility = 'published'
-- 2) visibility = 'party_draft' (имя/id — да; контент поля — в зависимости от role)
-- 3) visibility = 'private' AND created_by = auth.uid()
-- 4) role IN ('owner', 'dm') — видят всё
```

Рёбра `edges` от draft-нод тоже скрыты от игроков — иначе игрок видит
«загадочное ребро в никуда».

---

## Approval queue для нод

Паттерн из spec-014 (approval flow для транзакций) переносится на ноды.
Когда `party_draft` нода готова к публикации — DM нажимает «Опубликовать»
→ нода уходит в `published`. В более сложном сценарии (игрок создаёт
лор-нода, DM одобряет):

- Игрок создаёт ноду `private` или `party_draft`.
- Запись в очередь одобрения (или DM видит в sandbox).
- DM апрувит → `published`.

Детали механизма — на уровне Plan спеки. Паттерн аппрувов реализован:
[`features/accounting/approval-queue.md`](../features/accounting/approval-queue.md).

---

## Sandbox-страница DM

Роут `/c/[slug]/sandbox` — сетка черновых нод: энкаунтеры, NPC,
локации, плот-нити. DM видит свои `private` и все `party_draft`
кампании. Визуальный маркер черновика в сайдбаре и каталоге.
Кнопка «Опубликовать» прямо на ноде.

После encounter rework (spec-032) encounter-ноды в `party_draft` —
это «подготовленные сессии»: DM создаёт Патруль заранее, запускает
в момент встречи.

---

## Концепт-редактор поверх sandbox

`node_types` + `nodes.fields` JSONB + edges = zettelkasten без
миграций (новые типы создаются из UI через `createCustomType`).
Базовый Markdown-редактор уже есть (`components/markdown-content.tsx`).

Концепт-редактор дозревает четырьмя слоями поверх visibility-флага:

1. **Supabase Storage** — bucket `concept-images`, RLS по `campaign_id`,
   paste/drag-and-drop в редактор.
2. **Wikilinks `[[Title]]`** — remark-плагин, резолв на `nodes.title`
   per-campaign, автокомплит. Backlinks-панель бесплатно.
3. **Структурированные поля per `node_type`** — расширить `default_fields`
   схемой (тип поля: `number`, `markdown`, `enum`).
4. **Editor v2** (опционально) — тулбар / slash-commands.

Суть и детали редактора — [`wiki-editor.md`](wiki-editor.md).

---

## Миграция существующих нод

```sql
UPDATE nodes SET visibility = 'published'
WHERE visibility IS NULL;

ALTER TABLE nodes
  ALTER COLUMN visibility SET DEFAULT 'published';
```

Backward-compat: весь существующий контент получает `published`,
поведение для игроков не меняется.

---

> Фундамент для [`wiki-editor.md`](wiki-editor.md) (spec-021).
> Связь с [`concepts/visibility.md`](../concepts/visibility.md),
> [`features/accounting/approval-queue.md`](../features/accounting/approval-queue.md).
