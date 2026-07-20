# Implementation Plan: прозрачные cutout-варианты портретов

## Summary

Добавить один производный PNG rendition и сухой по умолчанию batch-генератор.
Он читает только связанные portrait usages, а локальный `rembg` конвейер
вычисляет alpha, сохраняя RGB оригинала. Первая точка потребления — уже
существующие PC-токены на карте, с preview fallback. Это не MEDIA-07: crop,
редактор и независимый token configuration не появляются.

## Мотивация каждого изменения

| Изменение | Зачем нужно | Чего намеренно нет |
|---|---|---|
| `cutout` variant и PNG MIME constraint | Хранить прозрачный результат рядом с прочими immutable renditions, не смешивая его с WebP | Новая таблица/usage graph |
| `portrait_tag` (migration 143) | Повторяемо классифицировать PC/NPC на стороне данных, а не по имени или UI | Ручной тег пользователя |
| Dry-run generator | Позволить увидеть точный объём до R2/БД-изменений | Автоматический production batch |
| Один Python session | Не загружать модель на каждую иллюстрацию | Генеративная модель или изменение RGB |
| Map projection + fallback | Дать готовому cutout немедленного потребителя и не ломать текущие токены | Изменение карт, каруселей или NPC-token UX |

## Technical approach

1. Применить существующую migration 143, затем migration 144, расширяющую
   rendition/mime checks ровно для `cutout:image/png`.
2. Расширить общий rendition type/route, чтобы cutout мог быть получен тем же
   безопасным контрактом, что preview.
3. Добавить `scripts/generate-portrait-cutouts.ts`. В dry-run он читает только
   metadata и печатает кандидатов/причины пропуска. В commit-mode он скачивает
   original по server R2 credentials во временную директорию, запускает
   существующий Python pipeline единственным процессом на batch, валидирует
   manifest, загружает PNG по deterministic key и upsert-ит variant.
4. Map read model отдельным batch query ищет current `cutout` только для
   primary PC portraits. Использует URL cutout при наличии, иначе legacy safe
   preview key. Никакие `campaign_maps` не запрашиваются генератором.

## Constitution Check

- **M1/M2 — PASS:** только derived rendition общего asset; portrait usage не
  меняется и второй usage graph не вводится.
- **M3 — PASS:** original immutable; RGB source копируется в PNG, меняется
  только alpha.
- **M4/M5 — PASS:** campaign ownership следует из portrait → node → asset;
  R2 key остаётся технической деталью batch/варианта.
- **M6 — PASS:** используется уже проверенный локальный background-removal
  tool, без второго сегментационного алгоритма.
- **M7 — PASS:** один проверяемый путь: PC token on map → cutout/fallback.

## Verification

- Vitest: type/rendition selection, map cutout preference/fallback, dry-run
  filtering (PC/NPC/no map input).
- `npm run lint`, `npm run typecheck`, targeted tests.
- Production: migrate, dry-run `--prod --tag pc`, explicitly approved
  `--commit` batch only after reviewing its plan, then map reload in desktop
  and Telegram Mini App. If Telegram auth cannot be automated, hand off that
  one smoke step to the user.
