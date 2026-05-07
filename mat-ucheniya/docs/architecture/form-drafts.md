# Автосохранение черновиков

> Заглушка. Содержание будет наполняться постепенно.

Хук `hooks/use-form-draft.ts` (~150 строк): debounce 600мс снапшота формы в localStorage, при возврате — янтарный баннер «найден несохранённый черновик от {time}» с кнопками Восстановить/Отбросить. Pristine state (совпадает с тем, что в БД) не пишется — иначе пустая форма затёрла бы черновик. На save и cancel черновик чистится. Подключён в трёх местах: CreateNodeForm, MarkdownContent, Chronicles ChronicleForm.

## Что планируется в статье

- Контракт хука: key, value, enabled, isEmpty, onRestore
- Жизненный цикл: dirty → save → wipe (или cancel → wipe)
- Pristine-state predicate: зачем и как
- TECH-021: useSyncExternalStore рефактор на горизонте
