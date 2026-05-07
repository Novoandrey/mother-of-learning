# [draft] Бухгалтерия — под капотом

> Заглушка. Содержание будет наполняться постепенно.

Pure helpers `lib/transaction-dedup.ts`, `lib/approval.ts`, `lib/autogen-reconcile.ts` — каждый со своим vitest-набором. Server actions в `app/actions/transactions.ts` + `app/actions/approval.ts` гейтятся по статусу и роли. Categories scoped до 5 типов через CHECK-constraint. CONSTRAINT `transactions_approval_consistency` — per-status field-bleed protection.

## Что планируется в статье

- Reconcile core: computeAutogenDiff + applyAutogenDiff
- Wizard keys и source nodes (как отличаются автогенерации)
- Transfer-pair atomic: оба leg'а или ни одного
- Item ownership guard: `createItemTransfer` агрегирует перед insert
- Pure helpers и их vitest-coverage
