-- 003_conditions.sql
-- Add DnD 5e conditions as entities + conditions column on encounter participants

-- 1. Add "condition" node type
INSERT INTO node_types (id, campaign_id, slug, label, icon, default_fields, sort_order)
SELECT
  gen_random_uuid(),
  c.id,
  'condition',
  'Состояние',
  '🔴',
  '{"description": "", "name_en": ""}'::jsonb,
  11
FROM campaigns c
WHERE c.slug = 'mat-ucheniya'
ON CONFLICT DO NOTHING;

-- 2. Insert 15 SRD conditions as nodes
WITH campaign AS (SELECT id FROM campaigns WHERE slug = 'mat-ucheniya'),
     ntype AS (SELECT nt.id FROM node_types nt JOIN campaigns c ON nt.campaign_id = c.id WHERE nt.slug = 'condition' AND c.slug = 'mat-ucheniya')
INSERT INTO nodes (id, campaign_id, type_id, title, fields)
VALUES
  (gen_random_uuid(), (SELECT id FROM campaign), (SELECT id FROM ntype), 'Бессознательный', '{
    "name_en": "Unconscious",
    "description": "Существо недееспособно, не способно перемещаться и говорить, не осознаёт окружение. Роняет всё, что держит, падает ничком. Автоматически проваливает спасброски Силы и Ловкости. Броски атаки по существу с преимуществом. Атака в пределах 5 фт — автокрит.",
    "tags": ["негативное", "боевое"]
  }'::jsonb),
  (gen_random_uuid(), (SELECT id FROM campaign), (SELECT id FROM ntype), 'Испуганный', '{
    "name_en": "Frightened",
    "description": "Помеха на проверки характеристик и броски атаки, пока источник страха в линии обзора. Не может добровольно приблизиться к источнику страха.",
    "tags": ["негативное", "ментальное"]
  }'::jsonb),
  (gen_random_uuid(), (SELECT id FROM campaign), (SELECT id FROM ntype), 'Истощённый', '{
    "name_en": "Exhaustion",
    "description": "6 степеней: 1) помеха проверкам, 2) скорость ×½, 3) помеха атакам и спасброскам, 4) макс. ХП ×½, 5) скорость 0, 6) смерть. Эффекты накапливаются. Длинный отдых снижает на 1.",
    "tags": ["негативное", "накапливаемое"]
  }'::jsonb),
  (gen_random_uuid(), (SELECT id FROM campaign), (SELECT id FROM ntype), 'Невидимый', '{
    "name_en": "Invisible",
    "description": "Невозможно увидеть без магии. Считается сильно заслонённым. Местонахождение определяется по шуму или следам. Атаки по существу с помехой, его атаки — с преимуществом.",
    "tags": ["позитивное", "боевое"]
  }'::jsonb),
  (gen_random_uuid(), (SELECT id FROM campaign), (SELECT id FROM ntype), 'Недееспособный', '{
    "name_en": "Incapacitated",
    "description": "Не может совершать действия и реакции. Автоматически проваливает сопротивление захвату/толчку. Теряет концентрацию на заклинании.",
    "tags": ["негативное", "боевое"]
  }'::jsonb),
  (gen_random_uuid(), (SELECT id FROM campaign), (SELECT id FROM ntype), 'Оглохший', '{
    "name_en": "Deafened",
    "description": "Ничего не слышит. Автоматически проваливает все проверки, связанные со слухом.",
    "tags": ["негативное"]
  }'::jsonb),
  (gen_random_uuid(), (SELECT id FROM campaign), (SELECT id FROM ntype), 'Окаменевший', '{
    "name_en": "Petrified",
    "description": "Трансформируется в камень, вес ×10, не стареет. Недееспособен, не двигается, не говорит. Атаки по нему с преимуществом. Проваливает спасброски Силы и Ловкости. Сопротивление всем видам урона. Иммунитет к ядам и болезням.",
    "tags": ["негативное", "боевое"]
  }'::jsonb),
  (gen_random_uuid(), (SELECT id FROM campaign), (SELECT id FROM ntype), 'Опутанный', '{
    "name_en": "Restrained",
    "description": "Скорость 0. Атаки по существу с преимуществом, его атаки — с помехой. Помеха на спасброски Ловкости.",
    "tags": ["негативное", "боевое"]
  }'::jsonb),
  (gen_random_uuid(), (SELECT id FROM campaign), (SELECT id FROM ntype), 'Ослеплённый', '{
    "name_en": "Blinded",
    "description": "Ничего не видит, проваливает проверки зрения. Атаки по существу с преимуществом, его атаки — с помехой.",
    "tags": ["негативное", "боевое"]
  }'::jsonb),
  (gen_random_uuid(), (SELECT id FROM campaign), (SELECT id FROM ntype), 'Отравленный', '{
    "name_en": "Poisoned",
    "description": "Помеха на броски атаки и проверки характеристик.",
    "tags": ["негативное"]
  }'::jsonb),
  (gen_random_uuid(), (SELECT id FROM campaign), (SELECT id FROM ntype), 'Очарованный', '{
    "name_en": "Charmed",
    "description": "Не может атаковать очарователя или делать его целью вредоносных эффектов. Очарователь совершает с преимуществом проверки при социальном взаимодействии.",
    "tags": ["негативное", "ментальное"]
  }'::jsonb),
  (gen_random_uuid(), (SELECT id FROM campaign), (SELECT id FROM ntype), 'Ошеломлённый', '{
    "name_en": "Stunned",
    "description": "Недееспособен, не перемещается, говорит запинаясь. Проваливает спасброски Силы и Ловкости. Атаки по существу с преимуществом.",
    "tags": ["негативное", "боевое"]
  }'::jsonb),
  (gen_random_uuid(), (SELECT id FROM campaign), (SELECT id FROM ntype), 'Парализованный', '{
    "name_en": "Paralyzed",
    "description": "Недееспособен, не перемещается, не говорит. Проваливает спасброски Силы и Ловкости. Атаки с преимуществом. Атака в пределах 5 фт — автокрит.",
    "tags": ["негативное", "боевое"]
  }'::jsonb),
  (gen_random_uuid(), (SELECT id FROM campaign), (SELECT id FROM ntype), 'Сбитый с ног', '{
    "name_en": "Prone",
    "description": "Перемещается только ползком. Помеха на атаки. Атаки в пределах 5 фт — с преимуществом, дальше — с помехой. Встать = ½ перемещения.",
    "tags": ["негативное", "боевое"]
  }'::jsonb),
  (gen_random_uuid(), (SELECT id FROM campaign), (SELECT id FROM ntype), 'Схваченный', '{
    "name_en": "Grappled",
    "description": "Скорость 0. Оканчивается если схвативший недееспособен или эффект выводит из зоны досягаемости.",
    "tags": ["негативное", "боевое"]
  }'::jsonb);

-- 3. Add conditions column to encounter_participants
ALTER TABLE encounter_participants
  ADD COLUMN IF NOT EXISTS conditions text[] DEFAULT '{}';
