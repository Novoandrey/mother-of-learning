# Загрузка портретов (арты → ноды) — шпаргалка

Заливка нейро-артов персонажей/NPC в R2 + запись в `character_portraits`
(spec-030/046). Скрипт: `mat-ucheniya/scripts/seed-portraits.ts`.

## 1. Папка с картинками

Имя файла = **точный title ноды** (`Оливия Форсейл.png`). Несколько артов
на одного персонажа с запятой → карусель (`Кватач-Ичл, лич.png`). Расхождения
имён — в `ALIASES` внутри скрипта. Текущий набор распакован в **`AI-Art/AI/`**
в корне репо (в `.gitignore`, в git не кладём).

## 2. Секреты → `mat-ucheniya/.env.local`

**Уже есть (БД):**
```
NEXT_PUBLIC_SUPABASE_URL=...        # определяет, в какую БД пишем (см. §4)
SUPABASE_SERVICE_ROLE_KEY=...
```

**Добавить (R2 — нужны ТОЛЬКО для реальной заливки `--commit`):**
```
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
R2_BUCKET=<имя-бакета>
```
Где взять: **Cloudflare → R2 → Manage R2 API Tokens** (Access Key ID + Secret);
`R2_ENDPOINT` и `R2_BUCKET` — на странице бакета. Это те же ключи, что при
сиде 31 портрета в spec-046.

## 3. Команды (из папки `mat-ucheniya/`)

`tsx` НЕ подхватывает `.env.local` сам — поэтому `--env-file` обязателен:
```bash
# dry-run: печатает план, НИЧЕГО не пишет
npx tsx --env-file=.env.local scripts/seed-portraits.ts --dir ../AI-Art/AI

# заливка: R2 + строки character_portraits (идемпотентно)
npx tsx --env-file=.env.local scripts/seed-portraits.ts --dir ../AI-Art/AI --commit
```
Сначала всегда dry-run — сверь «Сопоставлено / Не сопоставлено», потом `--commit`.

## 4. Staging vs прод

Скрипт пишет в ту БД, что в `NEXT_PUBLIC_SUPABASE_URL`.
- **Staging** (по умолчанию `.env.local`): `...supabase.co` (облачный проект).
- **Прод**: `https://db.theloopers.org` + прод `SUPABASE_SERVICE_ROLE_KEY`
  (тот же ключ, что в Dokploy env приложения). Заведи отдельный `.env.prod`
  и гоняй с `--env-file=.env.prod`, чтобы не путать со staging.

node_id разные в staging и прод (разные БД) → R2-ключи не сталкиваются;
каждую среду сидишь отдельно.

## 5. Чтобы арты РЕНДЕРИЛИСЬ в приложении

В env **самого приложения** (Dokploy, и staging, и prod) должна быть:
```
NEXT_PUBLIC_R2_PORTRAIT_BASE=<публичный URL бакета>   # напр. https://pub-xxxx.r2.dev или свой домен
```
Без неё `portraitUrl()` вернёт `null` — портреты не покажутся, хотя строки в БД
есть. Бакет должен быть **public-read**. (Опционально Cloudflare Image Resizing
для thumbnail'ов — иначе грузится оригинал, работает через onError-fallback.)
