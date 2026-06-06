# Tasks — 025 Backups & Restore Drill

> Трекинг-чеклист среза. **Не дублирует runbook** — исполняемые команды живут в
> `infra/backup-restore-runbook.md`. Каждая задача ссылается на plan-шаг и US.
> Источник правды по фазам: Specify → Clarify → Plan (готовы) → **Tasks (здесь)**
> → Implement.
>
> Легенда владельца: 🧑 = оператор на боксе (Claude не может SSH/деплоить),
> 🤖 = Claude (скрипты/runbook в репо, close-out).
> `[P]` = можно параллельно с соседними. Отмечать `[x]` по факту прохождения
> ✅-check соответствующего Step из runbook.

## Setup — R2 + rclone

- [ ] **T001** 🧑 Завести R2 bucket `mat-ucheniya-backups` + **scoped** API-токен
      (Object Read & Write, ограничить **только** этим бакетом). Креды (account
      id, key id, secret) — в env на боксе, **не** в git. _(plan-шаг 1, US1)_
- [ ] **T002** 🤖 `[P]` `infra/rclone.conf.example` — шаблон S3-remote типа
      Cloudflare R2 (endpoint, placeholder-ключи), без значений. _(артефакт)_
- [ ] **T003** 🧑 Установить `rclone` на боксе, завести remote из шаблона
      (секреты → `~/.config/rclone/rclone.conf`), проверить доступ:
      `rclone lsd <remote>:` + тестовый `rclone copy` мелкого файла туда-обратно.
      _(plan-шаг 2, US1#2)_

## Backup-скрипт + первый прогон

- [ ] **T004** 🤖 `infra/backup.sh` — `docker exec <db> pg_dumpall` → `gzip` →
      `rclone copy` в `daily/` под **timestamped именем**
      (`YYYY-MM-DD[-HHMM].sql.gz` — основа ротации по дате, иначе перезапись
      одного файла); лог в файл; **ненулевой exit при любом сбое** (дамп/
      заливка/нет места); временный файл чистится в любом исходе.
      _(plan-шаг 3, US1#1/#2/#5, edge «бакет недоступен»/«диск»)_
- [ ] **T005** 🧑 Развернуть `backup.sh` на боксе, **ручной прогон**. Проверить:
      файл уехал (`rclone ls <remote>:daily/`), размер ненулевой, `gunzip -t`
      проходит, в дампе есть `CREATE ROLE` для `anon` / `authenticated` /
      `service_role` / `supabase_*`. _(plan-шаг 4, US1#1–2, edge «роли»)_

## Cron + ротация

- [ ] **T006** 🤖 Ротация — воскресная копия `daily/` → `weekly/`; чистка
      `daily/` старше **30 дн**, `weekly/` старше **28 дн** (часть `backup.sh`
      или отдельный `infra/rotate.sh` — решим по размеру на Implement).
      _(plan-шаг 6, US1#4)_
- [ ] **T007** 🧑 Cron daily-задание (ориентир 03:00 UTC), служба cron запущена;
      подтвердить `crontab -l` / лог следующего прогона. _(plan-шаг 5, US1#3)_
- [ ] **T008** 🧑 Проверить ротацию на подкрученных метках: бэкапы за пределами
      окна удаляются, свежие остаются. _(plan-шаг 6, US1#4)_

## Drill «снёс → поднял» (ядро среза)

- [ ] **T009** 🤖 Drill-секция runbook (+ `restore.sh` или блок): выбрать дамп,
      **pre-restore guard** (`gunzip -t` целостность + `df` свободное место —
      закрывает edge «битый бэкап» / «мало места»), отложить текущее состояние,
      снести, восстановить, health-check. **Расписать обход конфликта
      инициализации** (3 кандидата из plan: ванильный Postgres /
      `--clean --if-exists` / `pg_dump public` + `--roles-only`).
      _(plan-шаг 7, US2, edge «битый бэкап»/«мало места»)_
- [ ] **T010** 🧑 Прогнать drill на пустом стеке: отложить состояние (`mv … .old`/
      снапшот) → снести → restore → стек healthy (`pg_isready`, `SELECT 1`,
      служебные схемы Supabase на месте, Auth/REST стартуют). **Отладить
      `role already exists`, зафиксировать рабочий путь.** _(plan-шаг 7, US2#1–4)_
- [ ] **T011** 🧑 Замерить время stop→healthy (ориентир **< 5 мин**); проверить
      путь назад — вернуть `.old` за **< 1 мин**. _(plan-шаг 7, US2#5–6)_

## Артефакты в репо

- [ ] **T012** 🤖 `infra/backup-restore-runbook.md` — полный copy-paste прогон +
      чек-лист (выбор дампа → stop → restore → health → план Б). **Черновик** со
      всеми шагами выдаётся оператору до drill'а; после T010 **финализировать**
      вписав отлаженный restore-путь. Обновить `infra/README.md`
      (`backup-restore-runbook.md`: planned → written). _(plan-шаг 8, US3)_

## Close-out

- [ ] **T013** 🤖 Close-out: `NEXT.md` (025 done → next 026), `backlog.md` (только
      если всплыли баги/идеи), `chatlog/YYYY-MM-DD-chatNN-*.md`, commit + push.
      **Версию приложения НЕ бампаем** — инфра, app-код не менялся (бамп на
      cutover 027). _(process hygiene)_

---

**Implement-правило:** Claude пишет 🤖-артефакты (скрипты + черновик runbook)
пакетом — оператор идёт на бокс с полным комплектом. Дальше 🧑-шаги гоняются по
runbook Step за Step'ом; оператор кидает вывод/ошибки в чат, Claude разбирает,
правит скрипты/runbook. Задача `[x]` — когда её ✅-check пройден. Drill (T010) —
точка, где вскрываем и чиним боль восстановления на пустом стеке.
