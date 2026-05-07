# [draft] Quests

> Заглушка. Содержание будет наполняться постепенно.

Quest как nodeType, родственный encounter. Привязан к локациям и NPC, имеет состояние (`offered` / `accepted` / `in_progress` / `completed` / `failed`), награды, дедлайны (в тиках) и watchers (PC, у которых quest в актуальных). Откладывается до encounter rework, потому что quest и encounter — родственники, проектировать первого без второго рискованно.

## Что планируется в статье

- Жизненный цикл квеста и события
- Связи с локациями, NPC, encounter'ами
- Награды и дедлайны (в тиках/днях)
- Watchers и UI «мои активные квесты»
- Three Clue Rule в quest design (Alexandrian)
- Зависимость от encounter rework
