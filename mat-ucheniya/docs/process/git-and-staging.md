# Git-флоу и staging

> Заглушка. Содержание будет наполняться постепенно.

**TBD — отдельная задача.** Сейчас: одна ветка `main`, push напрямую от @andrey, нет PR-флоу. План: staging-окружение (отдельный Vercel project + Supabase project), feature-ветки для соавторов, PR-флоу с превью на Vercel preview, доступы к Supabase preview, конвенция именования веток.

## Что планируется в статье

- Текущее: что есть и его ограничения
- Целевое: feature ветки, PR template, preview deployments
- Доступы: кто что может в Supabase (читать prod, писать staging)
- Migration story: как соавтор пишет миграцию и она докатывается до prod
- Конвенции: имя ветки = spec-NNN-short / fix-N / docs-N
