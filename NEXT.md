# NEXT — актуальное состояние проекта

> Обновляется в конце каждой сессии. ТОЛЬКО текущее состояние.
> История решений: `chatlog/`.
> Last updated: 2026-04-22 (chat 29)

## В проде сейчас

- **spec-001 Каталог сущностей**: граф нод+рёбер, поиск, фильтры, создание
- **spec-002/005 Трекер энкаунтера v3**: инициатива, HP, условия, эффекты, лог
- **spec-003 Петли и сессии как ноды**: миграции `008a`-`012`
- **spec-006 Auth + роли**: миграции `024`, `027`-`028`, `031`
- **Статблоки монстров** (без папки спеки): миграции `013`-`014`, `018`-`020`, `023`
- **Excel-like grid энкаунтера**: рестайл на design tokens, AC+death saves, PillEditor
- **Markdown + Летопись**: миграции `011`, `015`-`017`
- **Факультативы**: миграция `029`
- **PC roster v2**: миграция `030`
- **Shared world editing + perf**: миграция `031`, React `cache()`, `Promise.all`
- **TECH-003**: убрано 21 `any` из join-ответов, утилита `lib/supabase/joins.ts`
- **Ultrareview-полишинг (chat 28)**: BUG-014, TECH-001 (branding env),
  TECH-002 (react-hooks lint), TECH-004 (cached sidebar), UX-001 (toast),
  UX-002 (pending indicators) — всё в проде
- **BUG-015 (chat 29)**: после удаления ноды редирект через `router.back()`
  с fallback на каталог (раньше всегда летел в `/catalog`)
- **TECH-005 (chat 29)**: `middleware.ts` → `proxy.ts` (Next 16 file
  convention), deprecation warning убран

**Vercel:** https://mother-of-learning.vercel.app/
**GitHub:** https://github.com/Novoandrey/mother-of-learning
**Последняя применённая миграция:** `031_shared_world_editing.sql`

## Следующий приоритет

Свободное окно — все P1/P2 баги закрыты. Можно браться за что угодно
из бэклога. Логичные кандидаты:

- **DEBT-003** [P2] — SRD seed привязан к `slug='mat-ucheniya'` (open source blocker)
- **IDEA-037** [P2] — факультативы → бонусы к статам PC
- **IDEA-041** [P2] — система фидбека внутри приложения (кнопка + лента)
- **Spec-007 этап 4 stage 4** — трекер трат на ход (action/bonus/movement)
- **Мобилка игрока** (Spec-007 этап 5) — большая фича, ждёт решения

## Отложенные фичи

1. Трансформация факультативов в бонусы к статам PC
2. **Мобилка игрока** — режим игрока (читалка, mobile-first). Будущая спека.
3. **Трекер трат на ход в энкаунтере** — action/bonus/reaction счётчики.
4. **Общая панель реакций/легендарок** — агрегат реакций всех живых участников.
5. **PillEditor v2** — rename pill, выбор цвета.
6. IDEA-029 Spells + slots (ждёт auth, большая фича)
7. Импорт из Google Sheets (таблицы персонажей)
8. Лог вне боя (IDEA-026 инкремент 4)

## Стек и окружение

- Next.js 16 (App Router) + Supabase + Tailwind v4
- Рабочая директория в репо: `mat-ucheniya/`
- Тестовая кампания: slug `mat-ucheniya`
- Ключевые зависимости: `lucide-react`, `@fontsource-variable/manrope`, `@fontsource-variable/jetbrains-mono`

## Файлы памяти

- `.specify/memory/constitution.md` — конституция v3.0.0 (действующая)
- `.specify/memory/encounter-tracker-v1-retrospective.md` — ретро v1 трекера
- `.specify/memory/character-sheet-excel-system.md` — система листа персонажа
- `.specify/memory/assets/character-sheet-examples.xlsx` — Excel с примерами листов (для будущей фичи)
- `mat-ucheniya/STYLE.md` — design tokens (source of truth для UI)
- `mat-ucheniya/AGENTS.md` — предупреждение про Next.js 16
- `mat-ucheniya/scripts/README.md` — парсер SRD

## Правила работы

- Язык общения: русский. Код и комментарии: английский.
- Вайбкодинг: пиши код сам, не объясняй как писать.
- СДВГ: одна задача за раз, выбирай лучший вариант сам.
- Файлы миграций: отдавать пользователю через `present_files`.
- Правило переноса: сначала перенеси как есть, потом улучшай.
- Хардкод-аудит: при новом компоненте проверять на строковые константы
  под конкретную кампанию; выносить в функции с TODO-ссылкой на backlog.

## В конце сессии

1. Создать `chatlog/YYYY-MM-DD-chatNN-короткое-название.md` по шаблону из `chatlog/README.md`.
2. Обновить `NEXT.md`: секции «В проде» и «Следующий приоритет».
3. Обновить `backlog.md` если появились новые баги/идеи.
4. Закоммитить и запушить.
