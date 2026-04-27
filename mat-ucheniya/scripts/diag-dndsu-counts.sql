-- Diagnostic: which dnd.su book seeds actually landed in mat-ucheniya?
-- Read-only query, safe to run in SQL Editor.

with cnt as (
  select
    coalesce(n.fields->>'source_detail', '<NO source_detail>') as book,
    count(*) as items
  from nodes n
  inner join campaigns c on c.id = n.campaign_id
  inner join node_types nt on nt.id = n.type_id
  where c.slug = 'mat-ucheniya'
    and nt.slug = 'item'
  group by 1
  order by 2 desc, 1
)
select * from cnt;

-- Also quick total breakdown
select
  count(*) filter (where fields ? 'dndsu_url') as dndsu_total,
  count(*) filter (where fields ? 'srd_slug' and not (fields ? 'dndsu_url')) as srd_seed_only,
  count(*) filter (where not (fields ? 'srd_slug')) as hand_made,
  count(*) as grand_total
from nodes n
inner join campaigns c on c.id = n.campaign_id
inner join node_types nt on nt.id = n.type_id
where c.slug = 'mat-ucheniya' and nt.slug = 'item';
