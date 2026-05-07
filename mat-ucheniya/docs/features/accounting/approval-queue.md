# [draft] Очередь заявок (approval workflow)

> Заглушка. Содержание будет наполняться постепенно.

Игрок в роли `player` создаёт транзакции в статусе `pending`, DM их проверяет в очереди и approve/reject'ит. Multi-row submit: одна пачка транзакций (например, набег на торговца) уходит как batch. Optimistic concurrency через сравнение `updated_at`. DM-only badge на вкладке «Бухгалтерия» показывает количество pending'ов.

## Что планируется в статье

- Жизненный цикл заявки: pending → approved | rejected → withdrawn
- Batch — что это и зачем (multi-row submit)
- Optimistic concurrency: как ловим stale-edit
- Withdrawal — author-only hard-delete до approve
- Toast «DM рассмотрел вашу заявку» для player
