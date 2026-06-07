# rollback-runbook — spec-027 (research R9, US4)

Откат cutover'а. Главное: managed жив и заморожен весь грейс-период (~1–2 нед) —
он и есть страховка/эталон. **Но** откат чист только в **узком окне** сразу
после щелчка.

## Правило отката

**Триггеры (когда откатываемся):**
- Smoke реального игрока (T017) не проходит: логин / чтение / запись падают.
- Hairpin (T007) или CORS не чинятся за окно обслуживания.
- apex-серт/DNS не поднялись за разумное время.
- Любой блокер, делающий боевой `https://theloopers.org` непригодным.

**«Чистое окно»:** откат **без потерь** возможен только пока в self-hosted **не
накопились новые боевые записи** (managed заморожен с момента фриза T011 и не
растёт). Практически — минуты/часы сразу после щелчка.

**Поздний откат** (после значимых записей в self-hosted): возврат на managed
**потеряет** эти записи (managed их не видел). Тогда — НЕ откат, а «вперёд +
чинить на self-hosted». Критерий «значимых записей» — на усмотрение оператора
(напр. >0 новых approved-транзакций от реальных игроков).

**После вывода Vercel** (T023, decommission): быстрый возврат на Vercel
недоступен. Страховка тогда — **env приложения назад на managed при живом
приложении на боксе** (managed грейс-период жив). Поэтому Vercel выводим
(T023) **только после** уверенного smoke (T017) и небольшого наблюдения.

## Шаги отката (copy-paste)

### Вариант 1 — откат env приложения (self-hosted → managed)

🌐 Dokploy → приложение → Environment:
- `NEXT_PUBLIC_SUPABASE_URL` → `https://<managed-ref>.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → `<managed anon>`
- `SUPABASE_SERVICE_ROLE_KEY` → `<managed service_role>`
- **Build-time Arguments:** вернуть `NEXT_PUBLIC_*` на managed-значения тоже.
- **Redeploy** (или redeploy предыдущего деплоя — Dokploy их хранит).

Снять фриз managed (если Vercel ещё не выведен — re-enable Vercel prod-деплой;
managed снова принимает запись).

### Вариант 2 — снять apex-запись (откат адреса)

> **Реальность (chat 87):** у apex `theloopers.org` **нет DNS-записи**; прод-адрес
> сегодня = `mother-of-learning.vercel.app`. На cutover apex **создаётся с нуля**
> (T015), это не флип. Поэтому откат адреса = **удалить созданную apex A-запись**
> в Cloudflare → игроки снова идут на **`mother-of-learning.vercel.app`** (Vercel
> на грейс-период жив, если не выведен в T023). 🌐 Vercel: убедиться, что
> production-деплой активен (его на cutover ставят на паузу — re-enable).

### Частичный откат

- Упала **только публикация/подключение к self-hosted** (hairpin/CORS) →
  Вариант 1 (env назад на managed), чинить офлайн.
- Приложение на боксе + self-hosted здоровы, но что-то не так с новым адресом →
  Вариант 2 (снять apex), игроки на `vercel.app`, разбираться без спешки.

## Зафиксировано (chat 87)

- **apex `theloopers.org`:** записи **НЕТ** (`dig +short theloopers.org A` пусто;
  в Cloudflare только `db`/`panel`/`staging`). Прод-адрес сегодня =
  `mother-of-learning.vercel.app`. → На cutover (T015) apex **создаём** A →
  `37.27.254.49` (DNS-only); откат адреса = **удалить** эту запись (Вариант 2).
- **managed-значения тройки env** (цель Варианта 1): **НЕ хранить в git** (там
  `service_role`). Брать из managed Supabase → **Settings → API**
  (`Project URL`, `anon`, `service_role`) либо из истории деплоев Dokploy
  (деплой до смены на self-hosted). Держать в локальной заметке/менеджере паролей.

## Dry-run (T010, на staging, ДО реального cutover)

🌐 На staging-приложении: env-тройка self-hosted → managed → self-hosted,
redeploy на каждом шаге, **засечь время**. Цель — убедиться, что путь назад
рабочий и быстрый.

- Время отката (dry-run): __________ (вписать)
