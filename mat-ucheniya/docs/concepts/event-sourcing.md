# [draft] Event sourcing

> Заглушка. Содержание будет наполняться постепенно.

В проде event sourcing применён только к транзакциям: `transactions` — append-only лог, баланс PC и стаха считаются через `SUM()` без хранимой колонки `balance`. Парные переводы связаны через `transfer_group_id`. Целевая модель — расширить до универсального `events` лога, где любое значимое изменение мира — это event с `at_tick` / `visibility` / `persistence_scope`.

## Что планируется в статье

- Транзакции в проде: kind, amount/qty, transfer_group, статус (pending/approved/rejected)
- `autogen_*` поля и как они работают с реконсайлом
- Почему `SUM()` вместо хранимого баланса (event sourcing rationale)
- Перекрёстная ссылка на `roadmap/generic-events-table.md`
