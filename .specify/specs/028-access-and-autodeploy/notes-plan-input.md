# Notes for Plan — auto-deploy (spec-028 US2)

> **NOT part of the Specify artifact.** WHAT/WHY lives in `spec.md`; the HOW below
> is captured from the old chat-87 auto-deploy stub (was spec-043) so the research
> isn't lost. Decide these at the **Plan** phase, not before.

## Implementation options for US2 (push→deploy)

- **Встроенный auto-deploy Dokploy:** webhook от GitHub на приложение, ветка
  `main` (branch-matching). Push в main → Dokploy сам подтягивает, собирает
  (Dockerfile, Build Path `/mat-ucheniya`, standalone) и поднимает, ~1–5 мин.
  Build/deploy-логи и rollback **уже есть** в дашборде (наследие 023).
- **Альтернатива / fallback — GitHub Actions:** workflow на push в main →
  (опц. собрать образ) → дёрнуть Dokploy deploy API (`x-api-key` + `applicationId`)
  либо deploy-webhook. Надёжнее встроенного хука, и даёт место под gate
  (lint/tsc/vitest до деплоя) → закрывает FR-012, если решим гейтить.

## Caveat (ресёрч chat 87)

Есть репорты, что встроенный GitHub-webhook Dokploy **иногда не триггерит**
автодеплой и требует ручного redeploy (issue Dokploy#3787). Если упрёмся —
переключаемся на Actions-путь.

## Решение Plan

Встроенный webhook (просто) vs Actions (надёжнее + место под CI-gate). Для начала
вероятно встроенный; гейт/Actions — апгрейд. **Перепроверить актуальность
Dokploy#3787 на момент Plan.**

## Переносимость

Переносимый кусок (Dokploy CI-паттерн) — кандидат в `infra/` runbook;
app-specific (Actions workflow) — в `mat-ucheniya/`.
