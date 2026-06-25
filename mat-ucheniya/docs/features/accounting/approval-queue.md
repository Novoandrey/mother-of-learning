# Очередь заявок (approval workflow)

> Механизм ревью транзакций игрока DM-ом: `pending → approved | rejected`,
> групповые пачки, optimistic concurrency. Спека 014.

Игроки с ролью `player` не пишут в лedger напрямую — их транзакции
попадают в очередь со статусом `pending` и ждут решения DM. DM/owner
пишут сразу в `approved`. Логика разграничения — в
`lib/approval-policy.ts` (`isAutoApproved(role, autoApprove?)`).

---

## Жизненный цикл заявки

```
player submit
      │
      ▼
  [pending]  ──── withdraw (author, до approve) ────► удалено hard-DELETE
      │
      ├── DM approve ──► [approved]
      │
      └── DM reject  ──► [rejected]  (с опциональным rejection_comment)
```

- **`pending`** — все audit-поля `null` (CHECK-констрейнт
  `transactions_approval_consistency` из миграции 042 запрещает
  «загрязнение» полей).
- **`approved`** — `approved_at IS NOT NULL`; `rejected_*` и
  `rejection_comment` должны быть `null`.
- **`rejected`** — `rejected_at IS NOT NULL`; `approved_*` должны быть `null`.

Отозвать (`withdraw`) заявку может только её автор — и только пока она
в статусе `pending`. Это hard-DELETE (не soft-delete): строка уходит из
таблицы насовсем.

---

## Batch — групповая подача

Когда игрок нажимает «Подать пачку», все введённые строки уходят одним
server-action вызовом с общим `batch_id` (UUID). На странице
`/accounting/queue/` DM видит батч как единую карточку
(`<QueueBatchCard>` в `components/queue-batch-card.tsx`) с суммарной
статистикой — итоговые монеты, количество предметов, участники переводов.

**Зачем батч:** покупка снаряжения после сессии типично выглядит как
3–7 строк (меч, броня, зелья). Без батча DM вынужден approve/reject
каждую строку отдельно. С батчем — одна кнопка «Одобрить всё» или
«Отклонить всё» на карточку.

Батч остаётся в очереди до тех пор, пока хотя бы одна его строка
находится в `pending`. DM может частично обработать батч (approve одни
строки, reject другие) — это отражается в счётчиках
`pendingCount / approvedCount / rejectedCount` батч-агрегата.

Сгруппировать сырые строки в `PendingBatch[]` — задача чистой функции
`groupRowsByBatch()` из `lib/approval.ts`.

---

## Optimistic concurrency

Таблица `transactions` имеет триггер `trg_transactions_updated_at`, который
обновляет `updated_at` при каждом `UPDATE`. Server action в
`app/actions/approval.ts` при approve/reject проверяет, не изменилась ли
строка с момента загрузки страницы — сравнивает переданный клиентом
`updated_at` с текущим значением в БД. Если они расходятся, action
возвращает `{ ok: false, stale: true }`.

Клиент различает staleness через хелпер `isStaleError()` из
`lib/approval.ts` и показывает тост «Данные обновились, обновите
страницу» вместо общей ошибки.

---

## Toast для игрока

Таблица `accounting_player_state` (миграция 042) хранит per-(user, campaign)
timestamp последнего просмотренного DM-действия (`last_seen_acted_at`).
При заходе на `/accounting/` server action `getRecentDMActionSummary()`
из `lib/approval-queries.ts` вычисляет, сколько заявок игрока было
одобрено/отклонено с момента `last_seen_acted_at`. Если есть что показать —
рендерится `<DMActionToast>`. После показа `markDMActionsSeen()` обновляет
timestamp.

RLS на `accounting_player_state` — self-only: пользователь видит и пишет
только свою строку.

---

## Индексы очереди

Миграция 042 добавила три partial-индекса специально для горячих путей:

| Индекс | Назначение |
|---|---|
| `idx_tx_pending` on `(campaign_id, created_at desc)` where `status='pending'` | Лента очереди DM |
| `idx_tx_batch` on `(batch_id)` where `batch_id IS NOT NULL` | Загрузка одного батча |
| `idx_tx_author_pending` on `(author_user_id, campaign_id, created_at desc)` where `status='pending'` | Pending-заявки игрока |

Partial-индексы дёшевы — `pending` составляет ничтожную долю всех строк.

---

> См. также: [`README.md`](README.md) — общий обзор бухгалтерии;
> [`technical.md`](technical.md) — CHECK-констрейнты и чистые хелперы.
