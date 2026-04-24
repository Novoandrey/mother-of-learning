-- Миграция 035: Common stash + transactions.item_qty (spec-011).
--
-- Делает три вещи:
--   (1) Регистрирует node_type `stash` для каждой кампании
--       (per-campaign pattern, как `loop` и `session` в миграции 012).
--   (2) Создаёт ровно один stash-node на кампанию с title='Общак'.
--   (3) Добавляет transactions.item_qty (int, default 1, >= 1).
--
-- ⚠️ Идемпотентна. Единственное «деструктивное» изменение —
-- ALTER TABLE transactions ADD COLUMN с NOT NULL DEFAULT 1;
-- существующие строки бэкфилятся в 1 автоматически.
-- Всё остальное — INSERT ... WHERE NOT EXISTS / ON CONFLICT DO NOTHING.
--
-- Отклонение от plan.md: план закладывал глобальный node_type
-- с `is_base=true, campaign_id=null`, но текущая схема `node_types`
-- (мигр. 001 + RLS из 024) не знает про `is_base` и требует
-- `campaign_id NOT NULL`. Переход на глобальный флаг потребовал бы
-- ALTER-ов колонки, смены unique-индекса и пересмотра RLS —
-- несоразмерно задаче. Используем существующий per-campaign
-- паттерн; в последующих тасках (Phase 3: getStashNode,
-- Phase 4: ensureCampaignStash) запрос упрощается до
-- `where nt.slug='stash' and nt.campaign_id=$campaign_id` —
-- никакого `is_base=true` фильтра.
--
-- Forward-compat со spec-015 (item catalog):
-- spec-015 добавит `transactions.item_node_id uuid nullable
-- references nodes(id) on delete set null` отдельной миграцией,
-- без бэкфилла. Текущая миграция item_node_id не трогает;
-- item_qty останется осмысленным и после появления item_node_id
-- (qty — это «сколько штук», item_node_id — «какой предмет»).
--
-- Rollback:
--   begin;
--     alter table transactions drop column item_qty;
--     delete from nodes
--      where type_id in (select id from node_types where slug='stash');
--     delete from node_types where slug='stash';
--   commit;

begin;

-- ─────────────────────────── 1. node_types ───────────────────────────
-- Один row на кампанию, как у loop/session в мигр. 012.
insert into node_types (campaign_id, slug, label, icon, default_fields, sort_order)
select
  c.id,
  'stash',
  'Общак',
  '💰',
  '{}'::jsonb,
  50
from campaigns c
on conflict (campaign_id, slug) do update
  set label = excluded.label,
      icon  = excluded.icon;

-- ─────────────────────────── 2. nodes ────────────────────────────────
-- По одной stash-ноде на кампанию, строго одна (NOT EXISTS).
insert into nodes (campaign_id, type_id, title, fields)
select
  c.id,
  nt.id,
  'Общак',
  '{}'::jsonb
from campaigns c
join node_types nt
  on nt.campaign_id = c.id
 and nt.slug = 'stash'
where not exists (
  select 1
  from nodes n
  where n.campaign_id = c.id
    and n.type_id = nt.id
);

-- ─────────────────────────── 3. transactions.item_qty ─────────────────
-- Default 1 → существующие строки бэкфилятся автоматически.
-- CHECK item_qty >= 1 — zero/negative qty не допускаются.
-- Семантика: для kind='money'/'transfer' qty=1 (игнорируется UI);
-- для kind='item' qty означает количество штук. Constraint одинаков
-- для всех kind'ов ради простоты; spec-011 transaction-form показывает
-- qty-инпут только при kind='item'.
alter table transactions
  add column if not exists item_qty int not null default 1
    check (item_qty >= 1);

commit;
