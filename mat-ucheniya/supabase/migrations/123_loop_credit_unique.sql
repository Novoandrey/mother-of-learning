-- Migration 123: жёсткое «кредит раз за петлю» (UX-прогон spec-030, P2).
--
-- takeLoopCredit гардит SELECT-ом, потом INSERT — конкурентный двойной тап с
-- двух устройств проскакивает между ними и даёт ДВА кредита по 500 зм (живые
-- деньги). Partial unique index закрывает окно на уровне БД: второй INSERT
-- падает с 23505, а действие ловит это и возвращает «уже взят».
--
-- ⚠️ Идемпотентно (CREATE UNIQUE INDEX IF NOT EXISTS). Требует отсутствия
-- существующих дублей — сверено на проде (0 дублей). Rollback: drop index
-- if exists uniq_loop_credit.

begin;

create unique index if not exists uniq_loop_credit
  on transactions (campaign_id, actor_pc_id, loop_number)
  where category_slug = 'credit';

commit;

-- ─────────────────────────── Verify ───────────────────────────
select case
  when to_regclass('public.uniq_loop_credit') is not null
  then '✅ uniq_loop_credit — раз за петлю на уровне БД'
  else '❌ индекс не создан'
end as result;
