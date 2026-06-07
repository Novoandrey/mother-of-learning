# Feature Specification: Auto-Deploy / CI on push (spec-028) — STUB

**Feature Branch**: `028-auto-deploy`
**Created**: 2026-06-07
**Status**: 🌱 Stub / backlog — **not started** (заготовка; полноценный Specify позже)
**Depends on**: spec-027 cutover (приложение должно жить на боксе/Dokploy и быть
боевым) — берётся **после** закрытия 027.

> Это **заготовка**, не готовая спека. Зафиксировать намерение и слот 028.
> Когда возьмём в работу — пройти Specify → Clarify → Plan → Tasks → Implement.

## Зачем (one-liner)

После 027 деплой ручной (`git pull` + redeploy в Dokploy). Хотим vercel-подобный
**push → main → автосборка → подъём**, чтобы не ходить руками. Это «довосстановление
CI-парити с Vercel», вынесенное из Out of Scope эпика «своя инфра».

## Что внутри (грубо, до спецификации)

- **Встроенный auto-deploy Dokploy:** webhook от GitHub на приложение, ветка
  **`main`** (branch-matching — триггер только на выбранной ветке). Push в main →
  Dokploy сам подтягивает, собирает (Dockerfile, Build Path `/mat-ucheniya`,
  standalone) и поднимает, ~1–5 мин. Build/deploy-логи и rollback **уже есть** в
  дашборде Dokploy (наследие 023).
- **Альтернатива / fallback — GitHub Actions:** workflow на push в main →
  (опц. собрать образ) → дёрнуть Dokploy deploy API (`x-api-key` +
  `applicationId`) либо deploy-webhook. Надёжнее встроенного хука (см. caveat),
  и даёт место под gate (lint/tsc/vitest до деплоя).
- **Решение Plan:** встроенный webhook (просто) vs Actions (надёжнее + CI-gate).
  Для начала вероятно встроенный; CI-gate — апгрейд.

## Caveat (из ресёрча chat 87)

Есть репорты, что встроенный GitHub-webhook Dokploy **иногда не триггерит**
автодеплой и требует ручного redeploy (issue Dokploy#3787). Если упрёмся —
переключаемся на Actions-путь (надёжнее).

## Не в спеке (out of scope, на сейчас)

- **Preview-окружения на каждый PR** (vercel-style per-PR URL) — Dokploy умеет
  isolated-окружения, но это отдельный, более крупный шаг; не здесь.
- **Multi-env (prod + staging автоматизированно)** — после 027 staging убран
  (один env); вернётся только если заведём отдельный staging заново.
- **Нотификации (Slack/Discord) о деплое**, blue-green/zero-downtime стратегии —
  кандидаты-апгрейды, не MVP.

## Связь

- Переносимый кусок (Dokploy CI-паттерн) — кандидат в `infra/` runbook (как и
  остальной эпик), app-specific (Actions workflow в репо) — в `mat-ucheniya/`.
- Завершает «Vercel-парити»: дашборд+логи (есть) + rollback (есть) + **auto-deploy
  (эта спека)**. Edge/CDN/serverless-скейл/аналитика Vercel — осознанно не
  переносим (один бокс, хобби-нагрузка).
