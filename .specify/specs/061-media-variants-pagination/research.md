# Research — MEDIA-02: варианты, выдача и масштаб

**Date**: 2026-07-20  
**Decision status**: defaults agreed with Andrey; implementation spike remains
required before production migration.

## R1. Производные объекты создаются заранее, не по запросу страницы

**Decision**: после сохранения оригинала worker создаёт три версионированных
WebP-варианта: `thumb` (320 px), `preview` (960 px) и `scene` (1920 px по
длинной стороне), не увеличивая меньший источник.

**Why**:

- Сетка всегда получает небольшой объект с предсказуемым весом.
- Сцена выбирает один заранее известный URL, не передавая свой runtime в
  сервис трансформации.
- Вариант можно сделать immutable и кэшировать годами; смена алгоритма создаёт
  новую `variant_version`, а не ломает старый URL.

**Rejected for this slice**:

- Отдавать один оригинал и полагаться на CSS `loading="lazy"`: это не уменьшает
  байты первого viewport и не масштабирует список метаданных.
- Генерировать через ответ upload-route: 12 MiB файл может занять CPU/память,
  оборвать запрос и оставить пользователю неясный результат.
- Подключить Cloudflare Images как обязательную новую платформу: полезный
  резервный вариант, но добавляет отдельные тарифы и модель URL до доказанной
  необходимости.

## R2. Queue + отдельный worker на sharp

**Decision**: PostgreSQL хранит durable job, а отдельный worker-процесс с
`sharp` забирает задачи с ограниченной конкурентностью. Worker является вторым
Dokploy application из того же репозитория и ветки `main`.

**Why**:

- Задача переживает рестарт контейнера и видна оператору как данные, а не
  обещание `after()` в памяти web-процесса.
- Обработка сотен импортированных файлов не конкурирует с HTTP-ответами игрокам.
- `sharp` даёт один локальный, контролируемый алгоритм для PNG/JPEG/WebP.

**Production spike before implementation**:

1. Собрать минимальный worker Docker image с `sharp` на `node:20-bookworm-slim`.
2. Преобразовать PNG, JPEG и WebP из R2 в этом образе.
3. Измерить память на максимальном разрешении из текущего 12 MiB лимита и
   установить безопасную worker concurrency в deployment config.
4. Добавить второй Dokploy application и отдельный GitHub deploy trigger;
   существующий web-app workflow не должен молча считать worker обновлённым.

## R3. Pagination — keyset, не offset

**Decision**: API принимает непрозрачный cursor, кодирующий `(created_at, id)`
последней строки, и делает newest-first keyset query.

**Why**:

- Никакого роста стоимости из-за большого OFFSET.
- Одинаковая дата создания не ломает порядок: `id` — tie-breaker.
- Вставка новых ассетов между запросами не дублирует уже отданные элементы.

**Initial page size**: 48 карточек. Это UI-константа, а не игровое правило;
Plan выносит её в один server-side модуль и покрывает тестом.

## R4. R2 cache и будущая visibility

**Decision**: для производных объектов использовать текущий custom domain R2,
versioned keys и явные cache headers. Оригинал не используется карточками и не
становится fallback для будущего ограниченного доступа.

Cloudflare подтверждает, что custom domain перед R2 позволяет задействовать
Cloudflare Cache; `r2.dev` для production не предназначен. Custom domain делает
объекты публично запрашиваемыми, поэтому будущий Visibility не может строиться
на «сложности угадывания URL» и потребует отдельного слоя контроля доступа.
Источники: [R2 custom-domain cache](https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/),
[public buckets and access control](https://developers.cloudflare.com/r2/buckets/public-buckets/).

## R5. Старые ассеты и fallback

**Decision**: существующие строки `media_assets` не переписываются. Idempotent
backfill создаёт только отсутствующие variant rows/jobs. До ready карточка
показывает обработку; для старого ассета допустим временный original preview
только там, где это необходимо для сохранения обратной совместимости, но это
состояние измеряется и исчезает после backfill.

**Why**: не рвём уже существующие URL/ссылки, не дублируем оригиналы и можем
останавливать/возобновлять импорт без ручной зачистки R2.
