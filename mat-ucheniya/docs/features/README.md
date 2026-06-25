# Фичи

> Карта всего пользовательского функционала приложения. Каждая фича — отдельная
> папка с `README.md` (для всех) и, при необходимости, `technical.md` (для
> разработчиков). Инфраструктура и архитектурные решения — в [`architecture/`](../architecture/README.md).

---

## Список фич

| Фича | Краткое описание | Спека |
|---|---|---|
| [`catalog/`](catalog/README.md) | Граф нод: каталог всех сущностей кампании, поиск, фильтры | 001 |
| [`loops-and-sessions/`](loops-and-sessions/README.md) | Петли и сессии как ноды, прогрессбар, frontier | 003, 009 |
| [`encounters/`](encounters/README.md) | Грид инициативы D&D 5e, HP, условия, смерть, лут | 002, 007 |
| [`monsters/`](monsters/README.md) | База монстров: SRD-сид + homebrew, статблоки | — |
| [`chronicles/`](chronicles/README.md) | Markdown-блок на нодах + лог летописи | — |
| [`electives/`](electives/README.md) | Факультативы как ноды типа `elective` | — |
| [`auth-and-membership/`](auth-and-membership/README.md) | Регистрация, роли, onboarding, Telegram | 006 |
| [`accounting/`](accounting/README.md) | Транзакционная бухгалтерия, кошельки PC | 010, 014 |
| [`inventory-and-items/`](inventory-and-items/README.md) | Каталог предметов SRD + dnd.su, инвентарь | 015, 016 |
| [`stash-and-skladchina/`](stash-and-skladchina/README.md) | Общак кампании + складчина (групповая покупка) | — |

---

## Что считается фичей, а что — инфраструктурой

**Фича** — это законченная вертикаль: UI-страница или компонент, бизнес-логика,
схема БД, server actions. Она решает конкретную задачу игрока или DM.

**Инфраструктура** — кросс-cutting темы, которые фичи используют, но не
«владеют»: кэш сайдбара, система автосохранения черновиков, стек, тесты,
дизайн-токены. Документация инфраструктуры — в [`architecture/`](../architecture/README.md).

**Граф нод** — не фича, а архитектурный фундамент, на котором стоят catalog,
loops, encounters, electives и другие. Концептуальное описание — в
[`concepts/node-graph.md`](../concepts/node-graph.md).

---

## Зависимости между фичами

Фичи не изолированы. Ключевые связи:

- **Catalog** — центральная точка входа; все остальные фичи создают ноды,
  которые попадают в каталог.
- **Loops & Sessions** задают координатную систему `(loop_number, day_in_loop)`,
  к которой привязываются энкаунтеры, летопись и транзакции бухгалтерии.
- **Encounters** потребляют монстров из **Monsters** и генерируют лут через
  **Accounting** (см. [`accounting/README.md`](accounting/README.md)).
- **Auth & Membership** — страховочная сетка под всеми остальными фичами:
  без членства в кампании ни одна страница не открывается.
- **Accounting**, **Inventory**, **Stash** образуют экономический кластер;
  они связаны через таблицу `transactions` и approvals.

---

> Концепты, лежащие в основе архитектуры фич, — в [`concepts/`](../concepts/README.md).
> Что запланировано, но ещё не реализовано, — в [`roadmap/`](../roadmap/README.md).
