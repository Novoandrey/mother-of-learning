# [draft] Кэш сайдбара и инвалидация

> Заглушка. Содержание будет наполняться постепенно.

Сайдбар кампании читает `getSidebarData(campaignId)`, обёрнутую в `unstable_cache` с тегом `sidebar:<campaignId>` и 60s revalidate. После любой записи, влияющей на сайдбар (создание ноды, переименование, удаление) call-site обязан инвалидировать тег через `revalidateTag`. Контракт по типу call-site: server action, route handler, client hook, CLI script — у каждого свой способ.

## Что планируется в статье

- Контракт по call-site (формула из AGENTS.md)
- TECH-007: CLI-скрипты вне Next runtime → endpoint workaround
- Что попадает в кэш и какого размера он бывает
- Pagination loop: 10k hard cap (TECH-008 на горизонте)
