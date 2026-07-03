-- Migration 119: seed the 'purchase' transaction category (spec-052 — C-02).
--
-- createPurchase writes a money leg (−gp) + an item leg (+qty) under this
-- category, sharing a transfer_group_id (neither leg is kind='transfer').
-- Mirrors the six categories from mig 034. New campaigns get it via
-- seedCampaignCategories (lib/seeds/categories.ts — updated in this task).
--
-- ⚠️ Idempotent: INSERT ... ON CONFLICT DO NOTHING. Seeds every campaign.
-- Rollback: delete from categories where scope='transaction' and slug='purchase';

begin;

insert into categories (campaign_id, scope, slug, label, sort_order)
select c.id, 'transaction', 'purchase', 'Покупка', 60
  from campaigns c
on conflict (campaign_id, scope, slug) do nothing;

commit;

-- ─────────────────────────── Verify ───────────────────────────
select case
  when exists (
    select 1 from categories
     where scope = 'transaction' and slug = 'purchase'
       and campaign_id = (select id from campaigns where slug = 'mat-ucheniya')
  )
  then '✅ purchase category seeded'
  else '❌ purchase category missing'
end as result;
