# Доступ к серверу theloopers.org — вводная для коллабораторов

Короткая инструкция «что это за коробка и как в неё заходить» для **Лёши** и
**Никиты**. Ссылка на спеку: `.specify/specs/028-infra-access/`.
Подробный runbook по самой коробке — `infra/server-paas-runbook.md`.

---

## 1. Что это за сервер

Один VPS (Hetzner CPX32, 8 ГБ / 40 ГБ SSD, Helsinki), под **Dokploy** (PaaS,
вроде self-hosted Vercel). На нём живёт:

- **боевое приложение** «Mother of Learning» (Next.js, standalone, в Dokploy);
- **self-hosted Supabase** (обрезанный стек db/auth/rest/kong/studio/meta, PG17)
  — боевая БД того же приложения;
- ночные бэкапы БД в Cloudflare R2 (ротация 30/28).

Прод-домен — **https://theloopers.org**. Своя инфра поднята осознанно (DevOps-
навык + данные вне РФ-юрисдикции, бокс в EU).

## 2. Карта доменов

| Домен | Что это |
|---|---|
| `theloopers.org` | боевое приложение (Cloudflare → Traefik на боксе) |
| `panel.theloopers.org` | дашборд **Dokploy** (HTTPS, 2FA) |
| `db.theloopers.org` | self-hosted Supabase API (kong за Traefik, LE-серт) |

Прямой Postgres-порт **5432 закрыт** фаерволом. БД-консоль (Studio) — только
через SSH-туннель (см. §6).

## 3. Контексты команд

В проекте команды помечаются контекстом, чтобы не путать, где их выполнять:

- 🖥️ **LOCAL** — твоя машина (PowerShell / терминал).
- 🐧 **SERVER** — внутри SSH-сессии на боксе.
- 🌐 **WEB** — в браузере (панель Dokploy, Studio).

## 4. Заводим SSH-ключ (делаешь ты, один раз)

🖥️ LOCAL — если ключа ещё нет:

```bash
ssh-keygen -t ed25519 -C "lesha@theloopers"
```

Отдай Андрею **только публичную часть** (`~/.ssh/id_ed25519.pub`, одна строка
`ssh-ed25519 AAAA…`). Приватный ключ никому не передаём.

## 5. Заходим на сервер

🖥️ LOCAL (после того как Андрей добавил твой ключ — см. §8):

```bash
ssh lesha@37.27.254.49      # или ssh nikita@…
```

Root-логин и вход по паролю отключены — только по ключу. Внутри ты обычный
sudo-пользователь.

## 6. Supabase Studio (БД-консоль)

Studio наружу не торчит — туннелим локальный порт в сессию:

🖥️ LOCAL:

```bash
ssh -L 8001:localhost:8001 lesha@37.27.254.49
```

Не закрывая это окно, 🌐 WEB → открой **http://localhost:8001**. Это полноценный
Supabase Studio боевой БД.

> ⚠️ **Studio = полный доступ к прод-данным** (service-role, обходит RLS).
> Любые массовые/удаляющие правки — только через ревью-миграции
> (`BEGIN; … COMMIT;`, idempotency guards), не руками в SQL-редакторе.
> Если сомневаешься — спроси в чате. Бэкапы есть, но не повод проверять их грудью.

## 7. Деплой через Dokploy

🌐 WEB → `panel.theloopers.org`, логин своим аккаунтом (с 2FA) → приложение
`mother-of-learning` → **Redeploy**. Логи сборки и **rollback** — там же в
дашборде. (Авто-деплой по push в `main` пока не настроен — это будущая spec-043.)

## 8. Команды для Андрея — добавить нового человека

🐧 SERVER (под своим sudo-юзером; пример для `lesha`):

```bash
# 8.1 Завести персональную учётку (без пароля — вход только по ключу)
sudo adduser --disabled-password --gecos "" lesha
sudo usermod -aG sudo lesha

# 8.2 Положить ЕГО публичный ключ (вставь строку, что прислал коллаборатор)
sudo install -d -m 700 -o lesha -g lesha /home/lesha/.ssh
echo 'ssh-ed25519 AAAA...ИХ_КЛЮЧ... lesha@theloopers' \
  | sudo tee /home/lesha/.ssh/authorized_keys > /dev/null
sudo chown lesha:lesha /home/lesha/.ssh/authorized_keys
sudo chmod 600 /home/lesha/.ssh/authorized_keys

# 8.3 Проверить (в НОВОМ окне): ssh lesha@<box> заходит ключом.
```

🌐 WEB → Dokploy `panel.theloopers.org` → Settings → Users/Team → пригласить
`lesha`, включить **2FA**. (Точные пункты зависят от версии Dokploy — свериться
в UI; если мультиюзера нет — общий логин как временный fallback.)

## 9. Отозвать доступ

🐧 SERVER:

```bash
sudo deluser --remove-home lesha     # рубит SSH → и Studio-туннель заодно
```

🌐 WEB → удалить аккаунт `lesha` в Dokploy. Так как 5432 закрыт, а Studio только
за туннелем, удаление SSH-юзера — главный рубильник. Если когда-либо делился с
человеком общим секретом (не должен) — ротируй его.
