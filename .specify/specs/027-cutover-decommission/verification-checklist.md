# verification-checklist — spec-027

Заполняется по ходу. Тайминги/даты вписываются на прогоне (финал — T024).

## A) Phase A приёмка (US1#1) — публикация API

- [ ] `curl https://db.theloopers.org/auth/v1/health` снаружи → 200/healthy, валидный серт
- [ ] 5432 закрыт снаружи (`nc -z 37.27.254.49 5432` → CLOSED)
- [ ] Studio наружу недоступен (только SSH-туннель)

## B) Phase B приёмка (US1) — rehearsal на staging→self-hosted

**Hairpin (T007) — точка боли:**
- [ ] из app-контейнера: `curl -sS https://db.theloopers.org/auth/v1/health` →
      ответ kong, **не таймаут**
      _(если фейл → митигация R4: extra_hosts на Traefik / внутренний путь; см. cutover-runbook)_

**Функциональная приёмка (T008):**
- [ ] **Логин** существующего игрока на `https://staging.theloopers.org` текущим
      паролем → успех, сессия держится между переходами (proxy cookie-refresh)
- [ ] **RLS чтение:** под игроком (`authenticated`) каталог/ноды/транзакции
      видны; выборочно — `anon` НЕ видит защищённого
- [ ] **Запись через approval:** игрок подаёт транзакцию (pending) → DM
      аппрувит → запись зафиксирована (server action + RPC отработали)
- [ ] **CORS:** в консоли браузера нет CORS-ошибок на запросах к `db.theloopers.org`
- [ ] **Прод не тронут:** Vercel (`mother-of-learning.vercel.app` / apex на
      Vercel) и managed работают как обычно

## C) Phase C приёмка (US4) — dry-run отката

- [ ] env-тройка staging self-hosted→managed→self-hosted, redeploy — приложение
      поднимается на обоих
- [ ] Время отката замерено: __________ (вписать)

> 🚦 **GATE US1:** всё B+C зелёное → sign-off оператора на Сессию 2.

## D) Phase F приёмка (US2) — counts на момент фриза

- [ ] `check-migration-026.sql`: `public`+`auth.users` self-hosted **==** managed
      (прямой `count(*)`, мимо клэмпа). Вписать выборку:
      nodes ____ / edges ____ / transactions ____ / item_attributes ____ /
      categories ____ / auth.users ____
- [ ] FK-целостность (tx→nodes, edges→endpoints, item_node_id) — 0 сирот
- [ ] **sequence-insert** тест → не падает duplicate-key
- [ ] выборочно: свежая правка игрока **после** 026 присутствует в self-hosted
- [ ] длительность окна синка: __________ (вписать)

## E) Phase H приёмка (US3) — smoke реального игрока на боевом

- [ ] apex `theloopers.org` резолвится в бокс, HTTPS валиден
- [ ] существующий игрок на `https://theloopers.org`: логин текущим паролем →
      читает свои данные → делает запись (полный путь, при необходимости аппрув)
      → успех **(до анонса «готово»)**
- [ ] после щелчка записи идут только в self-hosted; managed боевых записей не получает

## F) Phase K приёмка (US5) — бэкап на боевом self-hosted

- [ ] ночной cron-бэкап после cutover зелёный (exit 0, без ERROR/FATAL)
- [ ] свежий R2-бэкап содержит боевые данные + `auth.users` с хешами (на restore)
- [ ] ротация 30/28 цела
- [ ] версия в `package.json` = 1.0.0 (T019)

## Метаданные прогона

- Дата rehearsal (Сессия 1): __________
- Дата cutover (Сессия 2): __________
- Тайминг restore (физ-drill): __________
- Дата старта грейса managed: __________ (для T025)
