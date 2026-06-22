# spec-046 — операторский раннбук (ручные шаги Андрея)

Делает Андрей (не Claude). Порядок: **блок А** можно делать сейчас, параллельно
с имплементом UI; **блок Б** — после того, как Claude добьёт код (UI + сид-скрипт).

Все секреты — серверные, в репо **никогда**. `NEXT_PUBLIC_*` — дублировать в
Dokploy → **Build-time Arguments** (иначе не заинлайнятся в билд).

---

## ✅ T003 — миграции (сделано на staging)

115 + 116 накатаны на staging. На прод — **на шипе**, тем же SQL через
Studio-туннель: 🖥️ `ssh -L 8001:localhost:8001 andrey@37.27.254.49` → 🌐
`http://localhost:8001` → SQL Editor. Idempotent — повторный прогон безопасен,
сразу покажет ✅.

---

## Блок А — можно сейчас (параллельно с имплементом)

### T019 — Telegram-бот (BotFather)
1. @BotFather → `/newbot` → имя + username (напр. `@theloopers_app_bot`).
   **Сохрани bot token** — он понадобится в T021.
2. Привяжи Mini App к роуту `/tg`:
   - `/mybots` → выбери бота → **Bot Settings → Menu Button → Configure menu
     button** → URL = `https://staging.theloopers.org/tg` (на проде потом
     `https://theloopers.org/tg`), текст кнопки напр. «Кабинет».
   - (Опц., богаче: `/newapp` → привяжи Mini App с тем же URL.)
3. Bot token — серверный секрет, идёт в T021.

### T020 — Cloudflare R2 (бакет портретов)
1. Cloudflare → R2 → **Create bucket** (напр. `mol-portraits`).
2. Публичный на чтение: bucket → Settings → Public access → подключи
   **кастомный домен** (рекоменд., напр. `portraits.theloopers.org` через
   Cloudflare DNS) либо включи r2.dev-сабдомен.
3. Публичная база = этот домен. В env приложения:
   **`NEXT_PUBLIC_R2_PORTRAIT_BASE`** = `https://portraits.theloopers.org`
   (без слеша на конце).
   - 🔴 Dokploy: продублируй в **Build-time Arguments** (staging + прод).
4. Для сида (позже) нужны **R2 S3-креды**: R2 → Manage API Tokens → создай токен
   → Access Key ID + Secret + Account ID/endpoint. Запиши — отдашь Claude в
   сид-команду (T023), в env приложения они НЕ нужны.

### T021 — секреты в env приложения (staging + прод; Dokploy → app → Environment)
- **`SUPABASE_JWT_SECRET`** = значение `JWT_SECRET` стека Supabase:
  - **Прод**: `JWT_SECRET` из `.env` self-hosted Supabase на коробке (тот же,
    что кормит `GOTRUE_JWT_SECRET` / `PGRST_JWT_SECRET`).
  - **Staging**: cloud-проект → Settings → API → **JWT Secret**.
- **`TELEGRAM_BOT_TOKEN`** = токен бота из T019.
- Оба — серверные, **НЕ** `NEXT_PUBLIC`, в репо никогда.

---

## Блок Б — после имплемента (Claude добивает UI + сид-скрипт)

### T023 — запустить сид портретов
Claude отдаст скрипт + точную команду. Он: Google Drive → R2 (по R2-кредам из
T020.4) → вставит primary-строки в `character_portraits` (матч имени файла Drive
→ нода персонажа). Запускаешь ты. Ждёт T022 (скрипт). *На T022 Claude спросит,
в какой папке Drive портреты и как имена файлов соответствуют персонажам.*

### T024 — деплой на staging
Когда ветка готова:
```bash
git fetch
git checkout staging && git reset --hard origin/main
git merge --no-ff origin/claude/046-telegram-auth-pc-card
git push --force-with-lease origin staging   # авто-деплой на staging.theloopers.org
```
115/116 на staging уже накатаны (T003).

### T025 — E2E на staging
1. Открой Mini App из бота (staging) → экран «не привязан» покажет твой
   `telegram_id`.
2. В десктоп-вебе staging → ДМ-маппинг-вьюха (Claude сделает, T013) → впиши
   `telegram_id` + выбери аккаунт → привяжи.
3. Переоткрой Mini App → видишь карточку. Проверь: вход без пароля (SC-001),
   `auth.uid()` совпадает с веб-аккаунтом (SC-002), портрет реальный/плейсхолдер
   (SC-006).

### T026 — PR → прод (Claude открывает после зелёного staging)
Claude открывает PR ветки в `main`; ты мерджишь; затем накатываешь 115/116 на
прод (Studio-туннель, см. T003).
