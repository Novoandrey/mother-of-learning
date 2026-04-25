-- ============================================================================
-- Spec-013 T001: verify (campaign_id, title) uniqueness in `encounters`
-- ============================================================================
--
-- ЦЕЛЬ
-- ----
-- Перед миграцией 039 (mirror nodes для энкаунтеров) надо убедиться, что
-- в продовой таблице `encounters` нет двух рядов с одинаковым
-- `(campaign_id, title)`. Backfill в 039 строит mirror-ноду по этой паре
-- и опирается на её уникальность.
--
-- ПОВЕДЕНИЕ
-- ---------
-- - Если result set пустой → дублей нет, можно писать T002 без
--   row_number() tiebreaker'а.
-- - Если result set непустой → надо расширить backfill в 039
--   (см. plan.md `## Migration § Mitigation`):
--   присвоить уникальные суффиксы по `row_number() over (partition
--   by campaign_id, title order by created_at, id)`.
--
-- КАК ЗАПУСКАТЬ
-- -------------
-- Supabase Dashboard → SQL Editor → вставить файл целиком → Run.
-- Read-only (никаких write'ов), безопасно гонять на проде в любой
-- момент.
--
-- ============================================================================

-- 1. Общее количество энкаунтеров (для контекста).
select
  'total_encounters' as label,
  count(*) as value
from encounters;

-- 2. Главная проверка: дубли по (campaign_id, title).
-- Пустой result set = всё чисто.
select
  campaign_id,
  title,
  count(*) as duplicate_count
from encounters
group by campaign_id, title
having count(*) > 1
order by duplicate_count desc, title;

-- 3. Если строка №2 что-то вернула — вот контекст по первой
-- проблемной паре (раскомментировать и подставить значения):
--
-- select id, campaign_id, title, status, current_round, created_at
-- from encounters
-- where campaign_id = '...'::uuid and title = '...'
-- order by created_at, id;
