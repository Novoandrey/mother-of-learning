# Chat 100 — MEDIA-05 safe deletion, 2026-07-20

## Контекст

После MEDIA-04 в общей медиатеке нет безопасного способа убрать ошибочный
upload. Пользователь выбрал сделать MEDIA-05 сейчас, но без отдельной generic
usage-модели.

## Что сделано

- Создана spec-065: удаляется только неиспользуемый asset; portrait usage
  объясняет блокировку и остаётся источником правды.
- Один серверный resolver собирает usage summary. Новые consumers добавляют
  свой FK `ON DELETE RESTRICT` и resolver; таблица `asset_usages`, soft-delete,
  очередь и lifecycle state machine не вводятся.
- В медиатеке `Удалить…` сначала показывает usages, а затем предлагает явное
  подтверждение только для ассета без usages.
- Server delete перепроверяет membership и usage, опирается на FK при гонке,
  затем удаляет original/variants из R2. Сбой R2-cleanup логируется как orphan,
  не ломая уже существующие usages.
- Добавлены 17 целевых Vitest-проверок; `lint` и `typecheck` проходят.

## Миграции

- Нет. Migration 142 уже содержит `character_portraits.media_asset_id` с
  `ON DELETE RESTRICT`.

## Действия после merge

- [ ] Пройти production quickstart: удалить disposable unused asset, затем
  проверить блокировку после portrait assignment и `/tg` preview.
- [ ] Если R2 cleanup failure появится в activity log, оператор удаляет только
  указанный orphan object; это не причина откатывать database delete.

## Что помнить следующему чату

- MEDIA-06 metadata/search — следующий полезный путь для 140+ assets.
- MEDIA-07 не начинать без новой Specify: portrait и token имеют независимые
  crop/configuration.
