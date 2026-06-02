# Chat 83 — план переезда на свою инфру + spec-022/023, 2026-06-02

## Контекст (откуда пришли)
Пользователь захотел: (1) новую спеку с анализом стека + предложением по
инфре; (2) мобилку для игроков (деньги/предметы/чарник/энкаунтер) как
PWA, без App Store/Google Play; (3) разобраться, дешевле ли свой сервер
вместо Supabase, нужны несколько ГБ под картинки.

По ходу решение сместилось: цель не экономия, а **DevOps-навык** — съехать
на свой сервер и научиться (бэкапы, падения, восстановление). Степан
(друг-devops) помогает.

## Что сделано
- **Аудит использования Supabase** (по коду): реально используются Postgres
  + Auth (GoTrue: signInWithPassword/signOut/getUser/updateUser + admin
  create/update/delete) + PostgREST (313 `.from()` по 27 таблицам; отсюда
  упор в лимит 1000 строк) + RLS (76 политик на 35 таблицах, `auth.uid()`
  ×22) + RPC (2 из кода, 5 SECURITY DEFINER, 4 триггера). **НЕ используются:
  Storage (0), Realtime (0), Edge Functions (нет папки).** Вывод: несущая
  Supabase-специфичная связка = Auth + PostgREST + RLS на `auth.uid()`;
  «голый Postgres» = переписать auth + слой запросов. Дроп-ин =
  self-hosted Supabase Docker-стек.
- **Инфра-решения:** PaaS = **Dokploy** (легче Coolify, без его CVE янв-2026).
  VPS-кандидат Hetzner CX33 (8 ГБ, ~€5.5). Картинки → **Cloudflare R2**
  (managed: zero egress + CDN + 10 ГБ free; self-host блобов — плохой
  trade-off). PWA вместо нативных приложений (iOS add-to-home + push 16.4+,
  EU-ограничение iOS 17.4 откатили; Android — полноценно).
- **Создан spec-022 «Player Mobile Mode» (PWA)** — Specify, awaiting
  Clarify. Эпик; MVP = чарник/деньги/предметы + PWA-shell (US1-3, US5);
  US4 живой энкаунтер — P2, кандидат на отдельную спеку (нужен realtime,
  которого сейчас нет). «Как есть»: паритет, не новые фичи. Портреты/push/
  оффлайн — Out of Scope.
- **Эпик «Переезд на свою инфру» нарезан на 5 атомарных спек 023–027:**
  023 фундамент (бокс+Dokploy+SSL+git-деплой) → 024 self-hosted Supabase
  (trimmed) → 025 бэкапы+restore-drill → 026 миграция данных+`auth.users`
  → 027 cutover. **Создан spec-023** (Specify, Dokploy зафиксирован в
  Clarifications; остаток Clarify: Next с Vercel или только бэкенд, домен/VPS).
- **Заведён repo-root `infra/`** (README) под переносимые runbook'и —
  физически отделено от app-specific specs, чтобы будущая вырезка в
  отдельный `infra`-репо была чистым copy-paste.
- **Прояснено:** «общей инфры-сервиса» нет — один бокс + Dokploy
  (многопроектный) + общий R2-аккаунт; у каждого проекта свой бэкенд/БД/
  бакет. R2 — open-step фичи портретов (первый потребитель картинок),
  после мобильного MVP, а не «про запас».
- **Порядок работ:** 023→027 (инфра) → 022 (мобилка) → R2+портреты.
  020 (holdings) / 021 (wiki) / карта / квесты — независимы, встраиваются
  по вкусу.
- **Numbering fix:** старый pencil «spec-023 = карта мира» в NEXT.md
  superseded — 023 теперь Server & PaaS foundation (specs-folder wins);
  карта переназначается при промоушене (вероятно 028+).

## Миграции
- нет (планирование).

## Коммиты
- (этот коммит) `chore(plan): self-hosting epic (023-027) + spec-022/023
  drafts + infra/` — спеки 022/023, infra/README, NEXT.md, chatlog.

## Действия пользователю (после чата)
- [ ] прочитать spec-022 и spec-023 (`git pull`)
- [ ] вернуться в чат на Clarify по 023 (3 вопроса: Next с Vercel?,
      домен/поддомены, подтверждение Hetzner CX33)

## Что помнить следующему чату
- Спек-фаза: 022 и 023 — оба **Specify, awaiting Clarify**. Не уходить в
  Plan без явного «ок».
- Dokploy зафиксирован для 023; два Clarify-вопроса ещё открыты.
- R2/картинки — НЕ часть эпика переезда (в коде картинок нет); едет с
  портретами. R2-runbook → `infra/`, не в `.specify/specs/`.
- Исполнение инфры — на стороне оператора (нет SSH-доступа у Claude);
  Claude поставляет runbook'и/скрипты, разбирает присланные логи.
- backlog.md в этом чате НЕ реструктурировался (только NEXT.md).

## Update (позже в chat 83) — риск-аудит юрисдикции + Clarify-023 закрыт

- **Риск-аудит (РФ-право):** два закона тянут в разные стороны — 152-ФЗ
  (ПД граждан РФ → серверы в РФ, штрафы до 20 млн, обяз. регистрация в
  РКН) vs «ЛГБТ-движение = экстремизм» (ВС РФ ноя-2023, в силе янв-2024;
  участие — до 12 лет, символика — до 4 лет; 100+ приговоров, ~90% за
  онлайн-контент; прецеденты по худлиту с ЛГБТ-референсами и приватным
  чатам/вечеринкам). Вывод: разрез **по риск-профилю данных**, не по
  «российскости» проекта. **Мать учения → за рубеж** (EU/Hetzner), вне
  юрисдикции РФ, минимум ПД россиян. Проекты с ПД РФ → отдельный
  российский бокс (Бокс B), вне эпика; чувствительный контент в РФ не
  кладётся. Зарубежные хостеры (Hetzner/DO/OVH/Cloudflare) в РФ
  троттлятся/блокируются → для этого контента «недоступно из РФ» скорее
  плюс. Оператору рекомендован юрист по РФ (ЛГБТ/экстремизм — уголовка).
  Оператор оценивает ЛГБТ-риск сам (приватно, игроки доверенные, EU +
  французский VPN); жёсткая линия (не в РФ) соблюдается архитектурой.
- **Clarify-023 закрыт (Session 2):** Dokploy; Next тоже переезжает с
  Vercel (фронт+бэк, Vercel гасится на cutover 027; US3 = staging-деплой
  `mat-ucheniya`); Hetzner CX33 (8 ГБ, EU) подтверждён; домен — свой
  дешёвый зарубежный, регистратор Cloudflare Registrar (at-cost ~$10/год,
  без скачка на продлении; альт. Porkbun), DNS позже (в 023 — поддомен на
  бокс, apex на cutover). **spec-023 → Clarified, ready for Plan.**
- Домен — судить по цене **продления**, не первого года (промо $1 у
  GoDaddy/IONOS/Namecheap с продлением $14-20 — ловушка).

## Update (Plan для 023) — chat 83

- **spec-023 → Plan готов.** `.specify/specs/023-server-paas-foundation/plan.md`
  (решения + обоснования + риски + maps-to-spec) и исполняемый
  `infra/server-paas-runbook.md` (10 шагов).
- Решения Plan: Dokploy (one-line install: Docker Swarm + Traefik +
  postgres16 + redis7; ≥2 ГБ/30 ГБ, порты 80/443/3000); Hetzner CX33
  Ubuntu 24.04; Traefik+Let's Encrypt; Cloudflare DNS (A-записи DNS-only
  для ACME); `staging.<domain>` → апп, `panel.<domain>` → дашборд, apex на
  Vercel до cutover; сборка через Dockerfile (Next 16 `output: standalone`)
  из сабдира `mat-ucheniya/`; staging смотрит на текущий managed Supabase
  (self-hosted — 024); доступ к дашборду через SSH-туннель, порт 3000
  закрыт в ufw, затем panel за HTTPS + 2FA.
- **Build authority:** Vercel CI → серверная Docker-сборка Dokploy
  (ENOTEMPTY песочницы больше не на пути; Claude не собирает локально).
- Готовые к Implement файлы (в runbook'е): `mat-ucheniya/Dockerfile`,
  `.dockerignore`, правка `next.config.ts` (standalone). Коммитит Claude на
  Implement; прогон runbook'а — оператор.
- Гейт: после Plan — Tasks/Implement по явному «го». Для одного инфра-среза
  runbook уже упорядочен (чекбоксы) → отдельный tasks.md опционален.

## Update (spec-023 ИМПЛЕМЕНТ — live) — chat 83

Прошли весь runbook вживую с оператором (PowerShell, Hetzner). spec-023 → **в проде**.

- **Бокс:** Hetzner **CX23** (2 vCPU / 4 ГБ / 40 ГБ, Helsinki, Cost-Optimized —
  CX33 был «limited availability»), Ubuntu 24.04.4. IP 37.27.254.49.
- **Хардненинг:** sudo-юзер `andrey`, SSH key-only (drop-in
  `00-hardening.conf`: PermitRootLogin no + PasswordAuthentication no —
  cloud-init не перебил), ufw 22/80/443 (3000 НЕ открыт), fail2ban,
  unattended-upgrades. root-вход отрублен, проверено.
- **Dokploy v0.29.7** (Docker Swarm + Traefik + postgres16 + redis7).
  Traefik — контейнер, не swarm-сервис. Дашборд: первичная регистрация
  через SSH-туннель, затем `https://panel.theloopers.org` (Settings → Web
  Server) + 2FA. **3000 торчал в интернет** (Docker обошёл ufw, проверено
  `Test-NetConnection` → True) → погасили `docker service update
  --publish-rm "published=3000,target=3000,mode=host" dokploy` → стало False.
- **Домен:** theloopers.org (Cloudflare registrar+DNS). A-записи `panel`,
  `staging` → IP, DNS-only (серое облако) для ACME. apex — пока на Vercel.
- **Приложение:** GitHub App, репо public, branch main, Build Path
  `/mat-ucheniya`, Build Type Dockerfile (`Dockerfile`, контекст/стейдж
  пустые). Dockerfile (standalone, libc6-compat, ships `docs/`) собрался на
  4 ГБ без OOM (~60 c). Деплой на `https://staging.theloopers.org` (HTTPS,
  container port 3000), смотрит на текущий managed Supabase (read-mostly).
- **Грабли (записаны в runbook):** в Dokploy `NEXT_PUBLIC_*` НЕ передаются
  из Environment в сборку — их надо дублировать в **Build-time Arguments**,
  иначе билд проходит, но рантайм 500 «Your project's URL and Key are
  required». После дублирования + Rebuild — логин заработал.
- **Reboot-тест (SC-006):** после `sudo reboot` ufw active, fail2ban active,
  все сервисы 1/1 (вкл. `matucheniya-staging-azupkl`), оба сайта живы.
- **SC:** 001..004,006 ✅. 005 (откат) — возможность есть (Dokploy хранит
  деплои), деструктивный тест отложен. 007 (бэкап) — конфиг воспроизводим
  из git+runbook; авто-бэкапы базы = срез 025.
- **App-код:** добавлены `mat-ucheniya/Dockerfile`, `.dockerignore`,
  `next.config.ts` `output: 'standalone'` + build-args для NEXT_PUBLIC.
  (Vercel-прод от standalone не пострадал.)
- **Коммиты:** runbook/Dockerfile/NEXT итерации (~2e64221 … b6c8125 серия).

## Что помнить следующему чату (для 024)
- **Перед 024 — rescale бокса до 8 ГБ** (CX33 если появится, либо
  always-available CPX31). На 4 ГБ Supabase-стек + Next + сборки не влезут.
- 024 = self-hosted Supabase (trimmed) на `db.theloopers.org`, потом
  репойнт env staging-приложения с managed на self-hosted.
- Дашборд: `https://panel.theloopers.org` (2FA). Сервер: `ssh andrey@37.27.254.49`.
- Откат 023 (SC-005) при случае проверить (Deployments → прошлый деплой).
