# Каталог предметов — под капотом

> Заглушка. Содержание будет наполняться постепенно.

Three-layer pipeline: Python scraper `scripts/scrape_dndsu.py` → JSON intermediate `dndsu_items.json` → TS codegen `scripts/items-dndsu-codegen.ts` → SQL миграции (per-book, идемпотентные). SHA1-cache в `scripts/dndsu-cache/`. Hand-curated SRD seed (`lib/seeds/items-srd.ts`) выигрывает у dnd.su при конфликте slug'ов — у SRD есть `priceGp`. Перформансные обходы: pagination loop ×3 на 10k cap, embed `!inner` join'ы вместо двухступенчатых IN-query'ев.

## Что планируется в статье

- scrape → JSON → codegen — каждая фаза подробно
- Слаги, дедуп и umbrella expansion
- FR-012: один source bucket для импорта, имя книги в `source_detail`
- URL-overflow и pagination workaround
- Phase 2 backfill `transactions.item_node_id`
