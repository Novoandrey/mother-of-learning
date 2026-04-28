-- Migration 108: full statblocks for the three "мутировавший" monsters
-- added in 107, so the encounter tracker shows action buttons / saves /
-- AC chip / passive list — matching the shape used by 019_srd_monsters.
--
-- Why a separate migration: 107 used the legacy 014-era field shape
-- (description + max_hp + statblock_url + tags) which renders as a
-- flat card. The encounter v4 statblock panel reads the full shape
-- documented in 018 (actions[], passives[], stats{}, saves{}, etc.).
--
-- 108 is "upsert + canonicalise":
--   1. INSERT … WHERE NOT EXISTS  — covers the case where 107 was not
--      yet applied (skips otherwise).
--   2. UPDATE fields = …          — overwrites any partial 107 shape
--      with the canonical full statblock.
--
-- Idempotent: re-runs leave the rows in the same canonical state.
--
-- Stats parsed from the dnd.su pages linked in `statblock_url`.
-- Action descriptions are in Russian (matching the page) since the
-- DM (Андрей) reads RU at the table; the SRD migration 019 happens
-- to be EN because Open5e is EN-only.

-- ─── Cloaker Mutate ──────────────────────────────────────────────────

insert into nodes (campaign_id, type_id, title, fields)
select
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000006',
  'Мутировавший плащевик',
  '{}'::jsonb
where not exists (
  select 1 from nodes
   where campaign_id = '00000000-0000-0000-0000-000000000001'
     and type_id    = '10000000-0000-0000-0000-000000000006'
     and title      = 'Мутировавший плащевик'
);

update nodes set fields = '{
  "name": "Мутировавший плащевик",
  "source_doc": "Phandelver and Below: The Shattered Obelisk",
  "statblock_url": "https://dnd.su/bestiary/12548-cloaker-mutate/",
  "cr": "10",
  "type": "aberration",
  "size": "huge",
  "alignment": "chaotic neutral",
  "ac": 14,
  "ac_detail": "природный доспех",
  "max_hp": 143,
  "hp": 143,
  "hit_dice": "22d10+22",
  "proficiency_bonus": 4,
  "speed": {"walk": 10, "fly": 30},
  "stats": {"str": 19, "dex": 15, "con": 12, "int": 18, "wis": 13, "cha": 11},
  "saves": {},
  "skills": {"stealth": 6},
  "senses": {"passive_perception": 11, "darkvision": 60},
  "languages": "Глубинная речь, Подземный, телепатия 60 фт",
  "resistances": "некротическая, психическая, яд",
  "immunities": "",
  "vulnerabilities": "",
  "condition_immunities": "истощение, отравление",
  "passives": [
    {"name": "Увёртливость", "desc": "Если плащевик попадает под эффект, дающий спасбросок Ловкости на половину урона, при успехе он не получает урона, а при провале — половину."},
    {"name": "Чувствительность к свету", "desc": "На ярком свету броски атаки совершаются с помехой."}
  ],
  "actions": [
    {"name": "Мультиатака", "desc": "Один Удар трупом и две атаки Хвостом, либо четыре атаки Хвостом.", "targeting": "self"},
    {"name": "Удар трупом", "desc": "Рукопашная атака оружием: +8 к попаданию, досягаемость 5 фт, одна цель. Попадание: 20 (3к10 + 4) дробящего урона. Если цель — существо, спасбросок Тел Сл 16 или отравлено на 1 минуту (не может восстанавливать хиты).", "targeting": "single"},
    {"name": "Хвост", "desc": "Рукопашная атака оружием: +8 к попаданию, досягаемость 10 фт, одна цель. Попадание: 13 (2к8 + 4) рубящего урона.", "targeting": "single"}
  ],
  "bonus_actions": [
    {"name": "Призрачные двойники", "desc": "Проецирует до четырёх иллюзорных копий до конца следующего хода. Пока двойники существуют, броски атаки против плащевика — с помехой.", "targeting": "self"},
    {"name": "Психический стон (перезарядка 6)", "desc": "Все существа в 60 фт, не являющиеся Аберрацией, спасбросок Мдр Сл 16 или 17 (5к6) психического урона + испуганы до конца следующего хода плащевика.", "targeting": "area"}
  ],
  "reactions": [],
  "legendary_actions": [],
  "tags": ["мутант","абберация"]
}'::jsonb
where campaign_id = '00000000-0000-0000-0000-000000000001'
  and type_id    = '10000000-0000-0000-0000-000000000006'
  and title      = 'Мутировавший плащевик';


-- ─── Troll Mutate ────────────────────────────────────────────────────

insert into nodes (campaign_id, type_id, title, fields)
select
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000006',
  'Мутировавший тролль',
  '{}'::jsonb
where not exists (
  select 1 from nodes
   where campaign_id = '00000000-0000-0000-0000-000000000001'
     and type_id    = '10000000-0000-0000-0000-000000000006'
     and title      = 'Мутировавший тролль'
);

update nodes set fields = '{
  "name": "Мутировавший тролль",
  "source_doc": "Bigby Presents: Glory of the Giants",
  "statblock_url": "https://dnd.su/bestiary/12271-troll-mutate/",
  "cr": "7",
  "type": "giant",
  "size": "large",
  "alignment": "обычно хаотично-злой",
  "ac": 16,
  "ac_detail": "природный доспех",
  "max_hp": 95,
  "hp": 95,
  "hit_dice": "10d10+40",
  "proficiency_bonus": 3,
  "speed": {"walk": 30, "fly": 30},
  "stats": {"str": 19, "dex": 13, "con": 18, "int": 17, "wis": 9, "cha": 12},
  "saves": {"con": 7, "int": 6},
  "skills": {"perception": 5, "stealth": 4},
  "senses": {"passive_perception": 15, "blindsight": 60},
  "languages": "Великаний, телепатия 60 фт",
  "resistances": "",
  "immunities": "",
  "vulnerabilities": "",
  "condition_immunities": "",
  "passives": [
    {"name": "Мутация", "desc": "При появлении случайно получает 1 из 4 мутаций: 1 — Эластичное тело; 2 — Псионическое зеркало; 3 — Шрамированный заклинаниями; 4 — Крылатая форма. От мутации зависят остальные особенности."},
    {"name": "Аморфный (Эластичное тело)", "desc": "Может перемещаться сквозь пространство шириной в 1 дюйм без протискивания."},
    {"name": "Сопротивление магии (Шрамированный заклинаниями)", "desc": "Преимущество на спасброски от заклинаний и магических эффектов."},
    {"name": "Психическое возмездие (Псионическое зеркало)", "desc": "Когда тролль получает урон психической энергией, каждое существо в 20 фт также получает этот урон."},
    {"name": "Регенерация", "desc": "Восстанавливает 10 хитов в начале своего хода. Если получил урон кислотой или огнём, эта особенность не действует в начале следующего хода. Умирает только если начинает ход с 0 хитов и не может регенерировать. Если регенерирует с 0 хитов — случайно получает ещё одну мутацию (макс. 4)."}
  ],
  "actions": [
    {"name": "Мультиатака", "desc": "Две атаки Разрывом.", "targeting": "self"},
    {"name": "Разрыв", "desc": "Рукопашная атака оружием: +7 к попаданию, досягаемость 5 фт (15 фт с Эластичным телом), одна цель. Попадание: 15 (2к10 + 4) рубящего + 9 (2к8) урона силовым полем.", "targeting": "single"},
    {"name": "Психический взрыв (перезарядка 5-6)", "desc": "Волна психической энергии. Все существа в 30 фт от тролля — спасбросок Инт Сл 14, 28 (8к6) психического урона при провале, половина при успехе.", "targeting": "area"}
  ],
  "bonus_actions": [],
  "reactions": [],
  "legendary_actions": [],
  "tags": ["мутант","великан"]
}'::jsonb
where campaign_id = '00000000-0000-0000-0000-000000000001'
  and type_id    = '10000000-0000-0000-0000-000000000006'
  and title      = 'Мутировавший тролль';


-- ─── Otyugh Mutate ───────────────────────────────────────────────────

insert into nodes (campaign_id, type_id, title, fields)
select
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000006',
  'Мутирующий отидж',
  '{}'::jsonb
where not exists (
  select 1 from nodes
   where campaign_id = '00000000-0000-0000-0000-000000000001'
     and type_id    = '10000000-0000-0000-0000-000000000006'
     and title      = 'Мутирующий отидж'
);

update nodes set fields = '{
  "name": "Мутирующий отидж",
  "source_doc": "Phandelver and Below: The Shattered Obelisk",
  "statblock_url": "https://dnd.su/bestiary/12550-otyugh-mutate/",
  "cr": "6",
  "type": "aberration",
  "size": "large",
  "alignment": "neutral",
  "ac": 16,
  "ac_detail": "природный доспех",
  "max_hp": 68,
  "hp": 68,
  "hit_dice": "8d8+32",
  "proficiency_bonus": 3,
  "speed": {"walk": 30},
  "stats": {"str": 19, "dex": 11, "con": 18, "int": 10, "wis": 15, "cha": 6},
  "saves": {"str": 7, "con": 7},
  "skills": {},
  "senses": {"passive_perception": 12, "darkvision": 120},
  "languages": "Отиджский, телепатия 120 фт",
  "resistances": "",
  "immunities": "яд",
  "vulnerabilities": "",
  "condition_immunities": "отравление",
  "passives": [
    {"name": "Ядовитое дыхание", "desc": "В начале хода отиджа все существа в 5 фт — спасбросок Тел Сл 15 или 3 (1к6) урона ядом."}
  ],
  "actions": [
    {"name": "Мультиатака", "desc": "Две атаки Укусом или Щупальцем. Одну из атак можно заменить на Удар хитином.", "targeting": "self"},
    {"name": "Укус", "desc": "Рукопашная атака оружием: +7 к попаданию, досягаемость 5 фт, одна цель. Попадание: 13 (2к8 + 4) колющего урона. Спасбросок Тел Сл 15 или отравлено. Каждые 24 часа повторный спасбросок: при провале макс. хиты −5 (1к10), при успехе яд снимается. Цель умирает, если макс. хиты падают до 0. Снижение длится, пока цель отравлена.", "targeting": "single"},
    {"name": "Щупальце", "desc": "Рукопашная атака оружием: +7 к попаданию, досягаемость 10 фт, одна цель. Попадание: 13 (2к8 + 4) дробящего урона. Если цель Среднего размера или меньше — схвачена (Сл высвобождения 15) и опутана. У отиджа 2 щупальца, каждое держит одну цель.", "targeting": "single"},
    {"name": "Удар о хитин", "desc": "Цель — существо, схваченное отиджем. Спасбросок Тел Сл 15 или 16 (3к10) дробящего урона + ошеломление до конца следующего хода отиджа.", "targeting": "single"}
  ],
  "bonus_actions": [],
  "reactions": [],
  "legendary_actions": [],
  "tags": ["мутант","абберация"]
}'::jsonb
where campaign_id = '00000000-0000-0000-0000-000000000001'
  and type_id    = '10000000-0000-0000-0000-000000000006'
  and title      = 'Мутирующий отидж';
