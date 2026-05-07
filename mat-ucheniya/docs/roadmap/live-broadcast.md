# Live broadcast и spectators

> Заглушка. Содержание будет наполняться постепенно.

Кампания разворачивается на глазах у зрителей, лог рассказывает историю каждой петли. Spectator-аккаунт без `see_all` — это participant без controlled_characters; видит поток событий с `visibility.mode='all'`, `dm_only` остаётся скрытым автоматически. Интерактивный лог с богатым текстом, иконками типа event'а, фильтрами по локации/PC/петле, режимом автообновления.

## Что планируется в статье

- Spectator-аккаунт: создание, права, опциональный see_all
- Visibility-фильтр для feed'а
- UI лога: layout, фильтры, авто-обновление, scroll-anchor
- Public-link broadcast: токен-доступ без аккаунта
- Realtime: Supabase Realtime + reconnect стратегия
- Disco-Elysium-вдохновлённая визуализация (long term)
