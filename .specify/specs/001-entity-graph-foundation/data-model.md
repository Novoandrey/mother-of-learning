# Data Model: Граф сущностей — фундамент

## Entity Relationship

```
campaigns 1──* node_types 1──* nodes *──* edges *──* nodes
                                          │
campaigns 1──* edge_types 1──* edges
```

## Tables

### node_types

Определяет категории сущностей для конкретной кампании.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen_random_uuid() | |
| campaign_id | uuid | FK → campaigns.id, NOT NULL | Привязка к кампании |
| slug | text | NOT NULL, UNIQUE per campaign | Программный идентификатор: `npc`, `character`, `location` |
| label | text | NOT NULL | Отображаемое имя: "НПС", "Персонаж игрока", "Локация" |
| icon | text | NULL | Emoji или иконка для UI |
| default_fields | jsonb | DEFAULT '{}' | Рекомендуемые поля при создании: `{"player": "text", "status": "text"}` |
| sort_order | int | DEFAULT 0 | Порядок в фильтрах |
| created_at | timestamptz | DEFAULT now() | |

### nodes

Атомарная сущность кампании.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen_random_uuid() | |
| campaign_id | uuid | FK → campaigns.id, NOT NULL | |
| type_id | uuid | FK → node_types.id, NOT NULL | Тип сущности |
| title | text | NOT NULL | Название: "Тайвен", "Золотой Петух" |
| fields | jsonb | DEFAULT '{}' | Произвольные поля: `{"description": "...", "status": "Преподаватель", "player": "Женя"}` |
| search_vector | tsvector | GIN index | Автоматически генерируется триггером из title + fields |
| created_at | timestamptz | DEFAULT now() | |
| updated_at | timestamptz | DEFAULT now() | |

**Триггер**: при INSERT/UPDATE на `nodes` → пересчитать `search_vector`
из `title` и текстовых значений в `fields` с конфигурацией `russian`.

**Индексы**:
- `idx_nodes_campaign` на `(campaign_id)`
- `idx_nodes_type` на `(campaign_id, type_id)`
- `idx_nodes_search` GIN на `search_vector`
- `idx_nodes_title` на `(campaign_id, lower(title))`

### edge_types

Определяет категории связей. Базовые типы общие для всех кампаний DnD.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen_random_uuid() | |
| campaign_id | uuid | FK → campaigns.id, NULL | NULL для базовых типов (is_base=true) |
| slug | text | NOT NULL | Программный идентификатор: `knows`, `teaches`, `located_in` |
| label | text | NOT NULL | Отображаемое имя: "Знает", "Обучает", "Находится в" |
| is_base | boolean | DEFAULT false | true = универсальный DnD-тип, доступен всем кампаниям |
| created_at | timestamptz | DEFAULT now() | |

**Constraint**: `UNIQUE (campaign_id, slug)` для кастомных.
Базовые (is_base=true) уникальны по `slug` глобально.

**Базовые типы (seed)**: knows, teaches, located_in, owns,
member_of, contains.

### edges

Направленная связь между двумя нодами.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen_random_uuid() | |
| campaign_id | uuid | FK → campaigns.id, NOT NULL | |
| source_id | uuid | FK → nodes.id, NOT NULL, ON DELETE CASCADE | Откуда |
| target_id | uuid | FK → nodes.id, NOT NULL, ON DELETE CASCADE | Куда |
| type_id | uuid | FK → edge_types.id, NOT NULL | Тип связи |
| label | text | NULL | Человекочитаемое описание: "подруга Дрипли", "преподаватель" |
| meta | jsonb | DEFAULT '{}' | Доп. данные |
| created_at | timestamptz | DEFAULT now() | |

**Constraint**: `UNIQUE (source_id, target_id, type_id)` — одна связь
данного типа между парой нод.

**Индексы**:
- `idx_edges_source` на `(source_id)`
- `idx_edges_target` на `(target_id)`
- `idx_edges_campaign_type` на `(campaign_id, type_id)`

### campaigns

Минимальная таблица для мультитенантности (принцип X).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen_random_uuid() | |
| name | text | NOT NULL | "Мать Учения" |
| slug | text | UNIQUE, NOT NULL | `mat-ucheniya` |
| created_at | timestamptz | DEFAULT now() | |

На этом этапе — одна кампания. Таблица существует для будущей
мультитенантности и чтобы не пришлось мигрировать позже.

## Seed Data

Из реальных таблиц кампании (файлы Copy_of_таблицы.xlsx
и Мать_учения_для_игроков.xlsx):

**Кампания**: "Мать Учения"

**Типы нод**: character, npc, location, group, organization,
creature, item, spell, event, mechanic

**10 НПС** (из листа НПС, выбраны самые связанные):
Тайвен, Ильза Зилети, Кайрон, Зориан Казински, Хаслуш Экзетери,
Имайя Курошка, Бенисек, Акоджа Строуз, Лайонел Вирион, Нора Буул

**5 PC** (из листа PC):
Альд Манкод (Алек), Дрипли Вирион (Егор), Маркус Хоппер (Стасян),
Британия Мерц (Андрей), Янка Мавики (Катя)

**3 Локации**: Промежуточный слой, Гадкий Койот, Клуб авантюристов

**3 Группы** (демонстрация вложенности):
Академия Сиории (organization), 3 курс (group), Группа 1 (group)

**Связи** (из описаний и контекста таблиц):
- Академия Сиории → contains → 3 курс
- 3 курс → contains → Группа 1
- 3 курс → contains → Клуб авантюристов
- Тайвен → knows → Дрипли (подруга)
- Тайвен → knows → Урик, Оран (команда)
- Ильза → teaches → [все PC] (преподаватель инвокаций)
- Кайрон → teaches → [все PC] (боевая магия)
- Лайонел → knows → Дрипли (создатель/отец, label: "создатель")
- Дрипли → member_of → Клуб авантюристов
- Янка → member_of → Клуб авантюристов
- Акоджа → member_of → Группа 1 (староста)
- Хаслуш → knows → Локи (допрос, обет)
- Бенисек → knows → Зориан (друг)
- Гадкий Койот → located_in → Сиория (город)

**Пример тегов в fields** (конвенция):
- Акоджа: `{"tags": ["3-курс", "староста"], "status": "3 курс"}`
- Кайрон: `{"tags": ["преподаватель", "боевой-маг"], "status": "Преподаватель"}`
- Британия: `{"tags": ["3-курс", "эмпат", "чирлидер"], "player": "Андрей"}`

**Конвенция тегов vs нод**:
- "Можно ткнуть пальцем в мире игры?" → нода (3 курс, Клуб)
- "Свойство для фильтрации?" → тег ("преподаватель", "антагонист", "мёртв")
