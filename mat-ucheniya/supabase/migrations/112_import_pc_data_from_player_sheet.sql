-- Migration 112: import PC data from the player Google Sheet (xlsx export).
--
-- Source: docs.google.com/spreadsheets/d/1O8KM25y1wdyorNHYc2mXvnl0A84JX2gxFlN0jRVk-jY
-- (sheet "PC", 31 rows). One-time bulk import — sheet is the canonical
-- source of player-facing PC data; this lands it inside `nodes.fields`
-- alongside what was seeded in 001/030/106.
--
-- This is the xlsx-based re-do of an earlier CSV-based draft. CSV-export
-- stripped hyperlinks; xlsx preserves them. Hyperlinks now imported:
--   - 14 `art_url`     — Google-Drive links from col C "Арт"
--   - 29  `ai_art_url`  — Google-Drive links from col D "AI Арт"
--
-- Two steps:
--
--   1. UPDATE — merge new keys onto 29 already-existing PC nodes via
--      `fields = fields || patch`. Keys added (omitted when sheet cell
--      was blank or "-"):
--        description       — overwrites the previous short stub UNLESS
--                            the sheet itself says "Описание пока не
--                            указано" (those PCs keep whatever they had)
--        class             — full string from "Класс" column
--        age               — string ("17", "17-18", "3" …)
--        height_cm         — integer
--        familiar          — string from "Фамильяр/спутник"
--        player_full_name  — full sheet form ("Андрей Новосёлов")
--        alt_name          — alternate title from "X / Y" patterns
--        art_name          — col "Арт"     (visible label of art-file link)
--        art_url           — col "Арт"     (Google-Drive hyperlink target)
--        ai_art_name       — col "AI Арт"  (visible label)
--        ai_art_url        — col "AI Арт"  (Google-Drive hyperlink target)
--      `fields.player`, `fields.tags`, `fields.stats` are NOT touched —
--      they stay as they were (the short `player` value still drives
--      seed-players.ts ownership wiring).
--
--   2. INSERT — 2 new PC nodes:
--        Доминика        (Саша / Александр Третьяков)
--        Астерион Молок  (Алексей Домашний — new player, NOT yet in
--                         players.json; add him there and re-run
--                         seed-players if you want the user→PC link)
--      Same node shape as 030: player + description + stats={} +
--      tags=["3-курс"], plus the same enriched keys as the UPDATE block.
--
-- Title-mapping decisions (CSV → DB; preserved in alt_name where lossy):
--   Альд Манкод/Арнальдо Манкод           → Альд Манкод
--   Локи Лафейсон                         → Локи
--   Аврора Монро                          → Аврора
--   Маркус «Хоппер» Грейсон               → Маркус Грэйсон   (Стасян's canonical
--                                                              spelling — sheet's
--                                                              «Грейсон» normalized
--                                                              to «Грэйсон» in fields)
--   Бальтазар Аннигилятор/Бальтазар …     → Бальтазар        (both forms in alt_name)
--   Тонни Вурнар                          → Тони
--   Киллиан                               → Киллиан Дрейфус
--   Рион Д'Арвалет                        → Рион Д'Арвалет   (curly → straight apostrophe)
--
-- Idempotent: UPDATEs are deterministic jsonb merges; INSERTs guard with
-- WHERE NOT EXISTS by (campaign_id, type_id, title).

BEGIN;

-- ────────────── 1. UPDATE existing 29 PCs ──────────────

with desired (db_title, patch) as (values
  ('Альд Манкод', '{"description": "Жрец Багряного Конклава из небогатой аристократической семьи Манкод. Отмечен Святым Ихором: мутные глаза и седые волосы с детства. Обучался медицине, исцелению и погребальным обрядам; сопровождает души к Великой Реке и помогает нуждающимся.", "class": "Жрец, Домен Упокоения 8", "age": "17", "height_cm": 174, "player_full_name": "Алек", "alt_name": "Арнальдо Манкод", "art_name": "Арнальдо Манкод", "art_url": "https://drive.google.com/file/d/1CUyqAbEkWmNeF2vWygu7-TzDuSaLQE5_/view?usp=drive_link", "ai_art_name": "Альд Манкод", "ai_art_url": "https://drive.google.com/file/d/1D49isgIjgcZgXj3lBpCUlAHYJARRpPSb/view"}'::jsonb),
  ('Карина Форамен', '{"description": "Девушка из 3 группы, жрица Бури, воспитанная приёмным отцом-моряком. Тянется к морю, навигации, звёздным атласам и астрологии. Использует магию лечения, поддержки, грома и молнии.", "class": "Жрица, Домен Бури 8", "age": "17-18", "height_cm": 171, "familiar": "Кукля — фамильяр-чернильник", "player_full_name": "Алек", "art_name": "Карина Форамен / Норвина", "art_url": "https://drive.google.com/file/d/1fMuSsHzbUB5lySTrxIpsDknI-ua-Wg9s/view?usp=drive_link", "ai_art_name": "Карина Форамен, начало петли\nКарина Форамен", "ai_art_url": "https://drive.google.com/file/d/1pCFUgJsdZZvBYmMqmWaFtqLIbtxRU6vm/view"}'::jsonb),
  ('Анарион Ларс', '{"description": "Студент из республики Фалкриния, выросший в портовом городе Ларса. Увлекается фехтованием и мечтает создать корабль-голем.", "class": "Чародей, аберрантный разум", "familiar": "Депресняк — фамильяр плешивый трессим", "player_full_name": "Алексей Морозов", "art_name": "Анарион Ларс", "art_url": "https://drive.google.com/file/d/1o5RQMY6f8L3Bauf2tG7Ye-h5X8zAREiM/view?usp=drivesdk", "ai_art_name": "Анарион Ларс", "ai_art_url": "https://drive.google.com/file/d/1ofmSi80cIan9pVFFdwcCGSRDMxP93BF0/view"}'::jsonb),
  ('Британия Мерц', '{"description": "Капитанка чирлидеров, эмпатка и менталистка из богатой семьи пивовара. Добрая, энергичная, любит поддерживать других, разбирается в военной истории и тактике. После переосмысления стала собраннее, больше читает и проявляет интерес к богам, пророчествам и ангельской символике.", "class": "Чародейка, божественная душа 1 / Бард, коллегия чирлидинга 7", "height_cm": 191, "familiar": "Сокол-фамильяр?", "player_full_name": "Андрей Новосёлов", "art_name": "Британия Мерц", "art_url": "https://drive.google.com/file/d/10xrRxormiuRTeZjIISxWX8qVfGtWrFxZ/view?usp=drive_link", "ai_art_name": "Британия Мерц", "ai_art_url": "https://drive.google.com/file/d/192Bv22yXyJQpye-5eHqO76N09voDYSfF/view"}'::jsonb),
  ('Миряна Кастиль', '{"description": "Волшебница и артефакторка из бедной семьи Суламнона. Хорошо разбирается в точных науках, формулах, рунах и заклинательных двигателях. Ограничена в средствах и болезненно воспринимает богатство одноклассников.", "class": "Изобретательница 1 / Волшебница хронургии 7", "age": "18", "height_cm": 170, "familiar": "Мяу — фамильяр трессим", "player_full_name": "Андрей Новосёлов", "ai_art_name": "Миряна Кастиль", "ai_art_url": "https://drive.google.com/file/d/13pQ_0-4Uflq9sT7Vhx0QF5P3dBCUYJ5q/view"}'::jsonb),
  ('Дрипли Вирион', '{"description": "Разумная слизь, студент Академии и основатель Клуба начинающих приключенцев. Обожает волшебство, алхимию, артефакты и героические легенды; мечтает стать великим героем.", "class": "Изобретатель, алхимик", "age": "3", "height_cm": 170, "familiar": "Капля — фамильяр/часть Дрипли", "player_full_name": "Егор Пинжаков", "art_name": "Дрипли Вирион", "art_url": "https://drive.google.com/file/d/1SYZXeWAqKPB6Vt4Ylb_asmzGq8Ag23ba/view?usp=drive_link", "ai_art_name": "Дрипли Вирион", "ai_art_url": "https://drive.google.com/file/d/11B0PuX4K-0u2P0kr7YU2eS2D2yvznjPF/view"}'::jsonb),
  ('Дрюс Вылис', '{"description": "Чужеземец, тронутый феями и тесно связанный с природой после крайне странного мистического опыта. Воспринимает мир через звериный, хаотичный и фейский фильтр.", "class": "Друид круга Дикого огня", "player_full_name": "Андрей Меньщиков", "art_name": "Дрюс Вылис", "art_url": "https://drive.google.com/file/d/1ee6cvNvVEeOorysvxuf-HOj77-kSEt2J/view?usp=drive_link", "ai_art_name": "Дрюс Вылис", "ai_art_url": "https://drive.google.com/file/d/1dgx0r9S0UlPA0A9Mr__iUv8Y_bccroZm/view"}'::jsonb),
  ('Каэл Дренвик', '{"description": "Сын писца, поступивший в Академию, чтобы изучать временные аномалии и разгадать пропажу наставника Орвена Даллара. Работал в алхимической лавке: ремонтировал предметы, готовил зелья и занимался опознанием вещей.", "class": "Волшебник хронургии", "age": "22", "familiar": "Сова-фамильяр", "player_full_name": "Женя Юрченков", "art_name": "Каэл Дренвик", "art_url": "https://drive.google.com/file/d/1KJsIc7pmEpxRoal5cc074zZS8I0Iorff/view?usp=drive_link", "ai_art_name": "Каэл Дренвик", "ai_art_url": "https://drive.google.com/file/d/1FyL-AC7i-0loYfYLqIAI7jabnh-_ZQj6/view"}'::jsonb),
  ('Клим Бэлан', '{"description": "Наследник рода магов-карабинеров, сочетающих боевую магию и огнестрел. Род Бэланов пострадал от Плача, а Клим стремится восстановить и превзойти славу предков. Подрабатывает авантюристом.", "class": "Чародей", "age": "17", "player_full_name": "Паша Недзвецкий", "art_name": "Клим Бэлан", "art_url": "https://drive.google.com/file/d/1StZYa74Es2AWov4A6LATk66YTaWPCOw2/view?usp=drive_link", "ai_art_name": "Клим Бэлан", "ai_art_url": "https://drive.google.com/file/d/1SMh3h-PufKiCdfmF3kPi_GEKDliCZ09W/view"}'::jsonb),
  ('Локи', '{"description": "Трикстер, мастер иллюзий и обменный студент, любящий загадки, веселье и драматичные появления. Сам по себе, как его волшебный чёрный кот.", "class": "Волшебник, школа иллюзий / Плут / Колдун", "familiar": "Йотун — фамильяр крокодил; Оливия Форсейл — возлюбленная и спутница", "player_full_name": "Сергей Лядов", "ai_art_name": "Локи Лафейсон", "ai_art_url": "https://drive.google.com/file/d/1IlvADPUtFHDkbQCByP7Lad_OiHtv9X3m/view"}'::jsonb),
  ('Офелия Эрос', '{"description": "Жрица жизни и любви из благородного дома Эрос. Розоволосая, яркая, дружелюбная, любит лечение, вечеринки, алхимию, танцы, руны, волшебные вещи и розовое игристое.", "class": "Жрица, домен жизни", "familiar": "Церебро — фамильяр-фрактал в виде розовой лисички", "player_full_name": "Сергей Лядов", "ai_art_name": "Офелия Эрос", "ai_art_url": "https://drive.google.com/file/d/1AyL8-ajJiY_E5hmIdnH8EjcawjnwLjvw/view"}'::jsonb),
  ('Аврора', '{"description": "Чужестранка с юга Фалкринеи из семьи виноделов. Очень высокая, мечтательная, амбициозная, справедливая и хаотичная девушка, связанная с лунной, сумеречной и ведьмовской магией; заботлива к близким, легка на подъём и склонна к ночной жизни.", "class": "Чародейка, лунная магия / Жрици, домен сумерек / Колдунья, ведьмовский клинок", "age": "17", "height_cm": 192, "familiar": "Софа — фамильяр чёрная сова; Рейндир — фамильяр северный олень", "player_full_name": "Сергей Лядов", "ai_art_name": "Аврора Монро", "ai_art_url": "https://drive.google.com/file/d/1WRK6ID76RcRNvj80wl2kXUPTKz8BuzJs/view"}'::jsonb),
  ('Маркус Грэйсон', '{"description": "Звезда сборной Академии по борьбе, спортивная гордость учебного заведения и душа вечеринок. Харизматичный тусовщик, «пьяный мастер», автор песни «шняга шняжная».", "class": "Монах альтернативный", "height_cm": 192, "familiar": "Красавчик — фамильяр пëс", "player_full_name": "Стасян", "art_name": "Маркус Хоппер", "art_url": "https://drive.google.com/file/d/1jOQMaRjeuVketLBJoK35uPO-7s08aais/view?usp=drive_link", "ai_art_name": "Маркус Грэйсон", "ai_art_url": "https://drive.google.com/file/d/1DjfR8WknDeJsJfYKjpKR98ji_AMWtJCp/view", "alt_name": "Маркус «Хоппер» Грэйсон"}'::jsonb),
  ('Бальтазар', '{"description": "Мрачный и молчаливый студент из параллельного класса, связанный с группой «Кровавый Снегопад из выколотых глаз распятых грешников». Почти не представляется, просто стоит и смотрит.", "class": "Бард, коллегия Апокалипсиса / коллегия Очарования", "height_cm": 195, "familiar": "Вельзевул Обольститель — фамильяр гигантская бабочка (муха)", "player_full_name": "Стасян", "alt_name": "Бальтазар Аннигилятор / Бальтазар Неотразимый", "ai_art_name": "Бальтазар Неотразимый", "ai_art_url": "https://drive.google.com/file/d/1U6Oe0bIlRbFRWcgqBK9PAYNxWxQwpXt8/view"}'::jsonb),
  ('Роза Тиссмур', '{"description": "Застенчивая колдунья, которая избегает внимания и предпочитает тишину. Просит называть её просто Роза и не трогать её вещи.", "class": "Колдунья", "age": "15", "height_cm": 150, "familiar": "Ворон — фамильяр? Амон", "player_full_name": "Лена Ардашева", "art_name": "Роза Тиссмур", "art_url": "https://drive.google.com/file/d/1gWxszP095fuSdTwPSrpOswTIqBCF-tf4/view?usp=drive_link", "ai_art_name": "Роза Тиссмур, в чёрном\nРоза Тиссмур", "ai_art_url": "https://drive.google.com/file/d/1sBpkZGFvHk84C_uwgnqi9yUQT1gr379A/view"}'::jsonb),
  ('Эрик Листер', '{"description": "Бывший студент Сиории, два года проведший в Академии, затем сменивший направление и ушедший в военную академию в Эльдемаре. Уверенный, обаятельный и расчётливый собеседник; уже помолвлен и подчёркивает, что всегда «играет честно».", "class": "Паладин 2 / Плут, Дуэлянт 6", "player_full_name": "Лена Ардашева", "ai_art_name": "Эрик Листер", "ai_art_url": "https://drive.google.com/file/d/1vfcP_PQBP39kRfege6VptVeMhBvw5Osk/view"}'::jsonb),
  ('Фред Белум', '{"description": "«Мистер книжный червь», волшебник-прорицатель, постоянно пропадающий в библиотеке и клубах вместо занятий. Исследует пределы магии, влияние магии на растения и животных, состоит в клубе «Исследования всего», который объединился с Клубом начинающих приключенцев.", "class": "Волшебник, школа прорицания", "player_full_name": "Максим", "art_name": "Фрэд Белум", "art_url": "https://drive.google.com/file/d/1zoJZaKa5y3QU45eC4vIlVVRgJ-ya5zma/view?usp=drive_link", "ai_art_name": "Фрэд Белум", "ai_art_url": "https://drive.google.com/file/d/1AQzPgS0UCpY-91jZ7BsqfkqkPbS5WRwx/view"}'::jsonb),
  ('Энтони Вурнар', '{"description": "Богатый гений-изобретатель с магическим осколком в груди. Создаёт доспехи, механизмы, взрывоопасные устройства и великие замыслы; мечтает сделать доспех, способный защитить королевство.", "class": "Изобретатель, бронник", "player_full_name": "Евгений Росляков", "art_name": "Энтони Вурнар", "art_url": "https://drive.google.com/file/d/19lJZJmSnC7EH4G0_5mIGtE3LGmTWLIyx/view?usp=drive_link", "ai_art_name": "Энтони Вурнар", "ai_art_url": "https://drive.google.com/file/d/1VGD-Pt_gqDDLSTM1-AmHZ0U9QSecFJYS/view"}'::jsonb),
  ('Тони', '{"class": "Бард коллегии красноречия", "player_full_name": "Евгений Росляков"}'::jsonb),
  ('Янка Мавики', '{"description": "Хаотичная ученица с непостоянным характером, играет на цимбалах в школьном оркестре и обладает артистическим талантом. Плохо учится, раздражается на одноклассников и хочет вступить в самый крутой кружок без «благородных крыс».", "class": "Чародейка, дикая магия", "age": "15", "familiar": "Альбус — фамильяр ворон-альбинос", "player_full_name": "Катя", "art_name": "Янка Мавики", "art_url": "https://drive.google.com/file/d/1JE0jbD01ZigM-TDC4QMcz_WebwSe_2Z5/view?usp=drive_link", "ai_art_name": "Янка Мавики", "ai_art_url": "https://drive.google.com/file/d/1G19AmN-rhOe_uolwxZPruri4UAV0wheA/view"}'::jsonb),
  ('Тулуна', '{"description": "Девушка из далёкого племени за северными горами, приехала учиться икосианской магии. Помнит последние месяцы урывками: траву, дождь, волков, лес и знакомые лица.", "class": "Друидка круга первобытности", "age": "17", "familiar": "Первобытный компаньон", "player_full_name": "Катя", "ai_art_name": "Тулуна", "ai_art_url": "https://drive.google.com/file/d/1f3Erkif5Y_MC1LbWOzKDtHC-GuBsSyf1/view"}'::jsonb),
  ('Лекс Лексингтон', '{"description": "Писатель фэнтезийных романов, бард и наследник типографии «Вечное Слово», сбежавший от семейных ожиданий. Собирает истории окружающих как материал для будущего шедевра.", "class": "Бард, коллегия авантюристов", "age": "19", "height_cm": 168, "familiar": "Инки — робот-писарь", "player_full_name": "Никита Пинжаков", "art_name": "Лекс Лексингтон", "art_url": "https://drive.google.com/open?id=1pqGZtHwwQ9dU_iIsw0BokAu2fElrzrGw", "ai_art_name": "Лекс Лексингтон", "ai_art_url": "https://drive.google.com/file/d/14iLlV6765e-tHFFsXO7oSmRgRw5llBDV/view"}'::jsonb),
  ('Гектор Грейвс', '{"description": "Волшебник-некромант на коляске, ведущий рискованные самостоятельные исследования на границе академических запретов. Холодно-аналитичный экспериментатор, изучающий кости, магические потоки, резонансные цепи и протоколы выживания в экстремальных условиях.", "class": "Некромант, книга призывателя", "age": "14", "height_cm": 161, "player_full_name": "Никита Пинжаков", "ai_art_name": "Гектор Грейвс", "ai_art_url": "https://drive.google.com/file/d/1wx5WtvNqRrhPYPlosyogIaHVbnEKkeCP/view"}'::jsonb),
  ('Уинифред Прескотт', '{"description": "Паладинша из дома Прескотт, потерявшая семью на войне. Идёт путём мести и веры, стремясь стать рыцарем, которому не страшны злодеи.", "class": "Паладин, клятва мести", "familiar": "Бриньольф — фамильяр крабик", "player_full_name": "Оля", "ai_art_name": "Уинифред Прескотт", "ai_art_url": "https://drive.google.com/file/d/1MYwEL_VP9i7xRp4wEaKJF_UX8ipSHzr2/view"}'::jsonb),
  ('Рион Д''Арвалет', '{"description": "Наследник дома Арвалет, связанного с войнами и оружейным делом. Бунтарь в «консервной банке», интересуется инженерией, магией, артефактами, механизмами и монстрами.", "class": "Изобретатель / Волшебник", "familiar": "Нил — фамильяр-фрактал в виде змеи; другая форма — ворон", "player_full_name": "Александр Третьяков", "ai_art_name": "Рион Д’Арвалет", "ai_art_url": "https://drive.google.com/file/d/1lF1EI5Gq9BbYYlRP1LZA2kiwliFG4pCB/view"}'::jsonb),
  ('Никандр Астериос', '{"description": "Друг Маркуса из секции борьбы. Хочет веселья, славы легендарного приключенца и верит, что иногда дубина по голове убедительнее магии.", "class": "Воин", "player_full_name": "Гриша", "ai_art_name": "Никандр Астериос", "ai_art_url": "https://drive.google.com/file/d/1aSJtW3NsPMuYqQQuX8rgOij8o7dKgaxx/view"}'::jsonb),
  ('Киллиан Дрейфус', '{"description": "Волшебник из богатой, но не знатной семьи портного. Был отчислен из суламнонской школы колдовства за торговлю алкоголем, перехватил письмо об отчислении и подделал документы для поступления в Академию Сиории.", "class": "Волшебник, Орден писцов / второй класс в разработке", "player_full_name": "Дима Гончаренко", "ai_art_name": "Киллиан", "ai_art_url": "https://drive.google.com/file/d/1PZI1wyLznmCigJjg-nV-LxBxIZx3AYLm/view"}'::jsonb),
  ('Торд', '{"class": "Варвар", "player_full_name": "Гриша Емельянов", "ai_art_name": "Торд", "ai_art_url": "https://drive.google.com/file/d/1VpKr_zaVp6hwby0gxBGsVMUo8CZJ1M0u/view"}'::jsonb),
  ('Зак Новеда', '{"description": "Гостевой персонаж для игроков без персонажа или с погибшими персонажами. Последний из дома Новеда, связанный с ангельской темой, сильной потерей памяти и стремлением восстановить себя и свой род. Требует прочтения «Мать учения».", "class": "Чародей божественной души / Колдун проклятого клинка", "age": "16", "height_cm": 185, "player_full_name": "Катя/Алексей Морозов/Сергей Морозов", "ai_art_name": "Зак Новеда", "ai_art_url": "https://drive.google.com/file/d/1NExVw_24Q5b_wdiGkRXRwOHhXcwKkqdA/view"}'::jsonb)
)
update nodes n
   set fields     = n.fields || d.patch,
       updated_at = now()
  from desired d
 where n.campaign_id = '00000000-0000-0000-0000-000000000001'
   and n.type_id    = '10000000-0000-0000-0000-000000000001'
   and n.title      = d.db_title;

-- ────────────── 2. INSERT 2 new PCs ──────────────

insert into nodes (campaign_id, type_id, title, fields)
select '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Доминика', '{"player": "Саша", "description": "", "stats": {}, "tags": ["3-курс"], "familiar": "Скакун в форме Кошмара", "player_full_name": "Александр Третьяков"}'::jsonb
where not exists (
  select 1 from nodes n
   where n.campaign_id = '00000000-0000-0000-0000-000000000001'
     and n.type_id    = '10000000-0000-0000-0000-000000000001'
     and n.title      = 'Доминика'
);

insert into nodes (campaign_id, type_id, title, fields)
select '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Астерион Молок', '{"player": "Алексей Домашний", "description": "Боевой студент с северных окраин Эльдемара, специалист по глефе и манакристаллическому экзоскелету. Дисциплинирован, молчалив и устойчив под нагрузкой; перспективен для глубинных операций, но склонен брать критический риск на себя.", "stats": {}, "tags": ["3-курс"], "class": "Воин, Мастер Боя 6/ Плут 2", "age": "20", "player_full_name": "Алексей Домашний", "ai_art_name": "Астерион Молок", "ai_art_url": "https://drive.google.com/file/d/1DAJZ6BnACJV20oUmdPlRilJONw0kG94j/view"}'::jsonb
where not exists (
  select 1 from nodes n
   where n.campaign_id = '00000000-0000-0000-0000-000000000001'
     and n.type_id    = '10000000-0000-0000-0000-000000000001'
     and n.title      = 'Астерион Молок'
);

COMMIT;
