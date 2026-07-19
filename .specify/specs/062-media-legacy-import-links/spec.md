# Feature Specification: Медиатека — legacy-импорт и связи с нодами

**Feature Branch**: `codex/media-optimization` → merged to `main` (PR #56)
**Created**: 2026-07-20
**Status**: Complete — production verified 2026-07-20
**Input**: Andrey (chat 2026-07-20): «возьмем все изображения что хранятся у Никиты, все изображения НПС и портретов что у нас уже есть на диске и отобразим их в медиатеке — со ссылками на соответствующие ноды (если есть)»
**Epic**: `.specify/epics/media-library/constitution.md` (`MEDIA-03`)

## Confirmed source inventory

- `AI-Art/AI`: 138 unique PNG portraits (260.5 MiB). Every filename resolves
  unambiguously to an existing `npc` node in production.
- `character_portraits`: those 138 NPC portrait rows already point at the
  matching R2 originals; importing them must reuse those objects, not upload a
  second copy.
- Nikita's live Redis world (`mol:world`): 54 creatures, 18 bases and one real
  image reference — a PNG map background. Creature URLs are statblock pages,
  not image files, and are intentionally excluded.

## User Scenarios & Testing

### User Story 1 — Найти перенесённый портрет и его ноду (Priority: P1)

ДМ открывает медиатеку кампании после переноса. Среди карточек видит уже
знакомый портрет НПС, его превью и кликабельную подпись ноды. Открывает ссылку
и попадает на соответствующую карточку каталога.

**Independent Test**: «Агафья.png» присутствует один раз, показывает только
thumb после готовности вариантов и ведёт к ноде «Агафья» в этой кампании.

### User Story 2 — Увидеть карту из MoL-Master (Priority: P1)

ДМ видит в той же медиатеке отдельный ассет карты «Глубинные подземелья под
Сиорией». Карта получает производные варианты, но не получает выдуманную
связь с нодой: в исходном мире такой связи нет.

**Independent Test**: После повторного запуска импорта есть одна запись карты,
один исходный объект и ни одной искусственной node-link.

### User Story 3 — Безопасно повторить перенос (Priority: P2)

Оператор выполняет dry-run, видит числа по источникам и соответствиям, затем
запускает import. Повторный запуск не создаёт новый asset, ссылку или R2-копию
для того же источника.

**Independent Test**: Второй commit-run даёт нулевое число созданных ассетов и
не меняет существующие ID, ключи и связи.

## Requirements

- **FR-001**: Система MUST хранить явную many-to-many связь между media asset
  и node той же кампании.
- **FR-002**: Участник кампании MUST видеть связанные ноды карточки, а ДМ
  MUST иметь кликабельный переход в каталог.
- **FR-003**: Импорт MUST создать ровно по одному asset для каждого из 138
  локальных портретов и повторно использовать его уже существующий R2 key.
- **FR-004**: Импорт MUST скачать и сохранить единственную PNG-карту из
  Nikita Redis world; статблочные URL существ MUST NOT считаться медиа.
- **FR-005**: Каждый импортируемый оригинал MUST войти в стандартную очередь
  вариантов MEDIA-02.
- **FR-006**: Dry-run MUST not write to R2 or production database.
- **FR-007**: Commit-run MUST be resumable and idempotent by stable source
  identity; existing portraits, crop metadata and carousel order MUST remain.
- **FR-008**: Импорт не меняет текущие правила кампаний, ролей или visibility.

## Key Entities

- **Связь ассета и ноды**: доказуемая ссылка конкретного library asset на одну
  или несколько нод одной кампании; это не замена будущему usage/picker.
- **Legacy source identity**: стабильное происхождение объекта (R2 portrait
  key либо URL карты Nikita), используемое только для идемпотентного переноса.

## Success Criteria

- **SC-001**: В production библиотеке доступны 139 новых legacy-ассетов:
  138 портретов и одна карта, без дубликатов после повторного запуска.
- **SC-002**: 138 портретов имеют ровно одну ссылку на разрешённую NPC-ноду;
  карта не имеет связи.
- **SC-003**: ДМ открывает портрет, переходит по ссылке в ноду и после reload
  снова видит этот же asset и связь.
- **SC-004**: На странице медиатеки thumb запрашивается вместо оригинала после
  успешной работы worker.

## Out of Scope

- Ручное назначение/снятие ссылок и использование ассета как портрета, карты
  или фона — это следующий picker/usage путь.
- Категории, поиск, Google Drive и ChatGPT-экспорты.

## Production completion record

- Migrations 140 and 141 are applied directly to the production database.
- The dry run resolved 138 local portraits and one unlinked MoL-Master map;
  commit import created 139 legacy library assets idempotently.
- The initial R2 variant-write failure (`HTTP 411`) was fixed, all failed jobs
  were safely requeued, and all **140** library assets reached `ready`.
- Production UI verification: the first page reports `48 / 140`, renders
  thumbnail variants rather than originals, and exposes portrait → node links.
