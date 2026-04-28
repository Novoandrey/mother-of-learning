-- Migration 107: monster cards — три "мутировавших" из PBSO / BPGG.
--
-- Pattern: same idempotent insert as 030_pc_roster_v2.sql / 106. Type
-- '10000000-0000-0000-0000-000000000006' = creature (Монстр), per the
-- existing seed in 014_monster_seed.sql. Fields shape matches what
-- migration 013 set as the creature default_fields:
-- {description, max_hp, statblock_url, tags}.
--
-- HP/CR pulled from the dnd.su pages linked in statblock_url.

insert into nodes (campaign_id, type_id, title, fields)
select
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000006',
  'Мутировавший плащевик',
  jsonb_build_object(
    'description',   'Большая аберрация. Сливается с гниющим трупом — псионический стон, призрачные двойники, помеха на ярком свету. CR 10.',
    'statblock_url', 'https://dnd.su/bestiary/12548-cloaker-mutate/',
    'max_hp',        143,
    'tags',          '["мутант","абберация"]'::jsonb
  )
where not exists (
  select 1 from nodes n
   where n.campaign_id = '00000000-0000-0000-0000-000000000001'
     and n.type_id    = '10000000-0000-0000-0000-000000000006'
     and n.title      = 'Мутировавший плащевик'
);

insert into nodes (campaign_id, type_id, title, fields)
select
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000006',
  'Мутировавший тролль',
  jsonb_build_object(
    'description',   'Большой великан. Регенерация 10 (огонь/кислота отключают). При появлении — 1 случайная мутация (1/2/3/4: эластичное тело / псионическое зеркало / шрамированный заклинаниями / крылатая форма); при регенерации с 0 хитов добирает новую. Психический взрыв (5-6) 8к6. CR 7.',
    'statblock_url', 'https://dnd.su/bestiary/12271-troll-mutate/',
    'max_hp',        95,
    'tags',          '["мутант","великан"]'::jsonb
  )
where not exists (
  select 1 from nodes n
   where n.campaign_id = '00000000-0000-0000-0000-000000000001'
     and n.type_id    = '10000000-0000-0000-0000-000000000006'
     and n.title      = 'Мутировавший тролль'
);

insert into nodes (campaign_id, type_id, title, fields)
select
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000006',
  'Мутирующий отидж',
  jsonb_build_object(
    'description',   'Большая аберрация. Хитиновые угольные пластины. Ядовитое дыхание (5 фт, начало хода). Щупальца хватают (Сл 15) — Удар о хитин по схваченному 3к10 + ошеломление. Укус снижает max HP, пока цель отравлена. CR 6.',
    'statblock_url', 'https://dnd.su/bestiary/12550-otyugh-mutate/',
    'max_hp',        68,
    'tags',          '["мутант","абберация"]'::jsonb
  )
where not exists (
  select 1 from nodes n
   where n.campaign_id = '00000000-0000-0000-0000-000000000001'
     and n.type_id    = '10000000-0000-0000-0000-000000000006'
     and n.title      = 'Мутирующий отидж'
);
