# Parity report — self-hosted ↔ prod (spec-024, Step 9)

Date: 2026-06-03 (chat 84). Method: `show server_version;` +
`select … from pg_extension` + `select … from pg_namespace`, same SQL on both
sides. Self-hosted PG = `supabase/postgres:17.6.1.132`.

## server_version
- prod: **17.6**
- self-hosted: **17.6**

→ identical PostgreSQL version. Restore-compatible (FR-011, SC-007). ✅

## Extensions (`pg_extension`)

| extension | prod | self-hosted |
|---|---|---|
| pg_net | — | 0.20.3 |
| pg_stat_statements | 1.11 | 1.11 |
| pgcrypto | 1.3 | 1.3 |
| plpgsql | 1.0 | 1.0 |
| supabase_vault | 0.3.1 | 0.3.1 |
| uuid-ossp | 1.1 | 1.1 |

- **self-hosted ⊇ prod** — every prod extension present self-hosted →
  nothing to install before 026 (FR-009). ✅
- Extra self-hosted: `pg_net` (Supabase default; prod just doesn't enable
  it) — harmless for restore.

## Schemas (`pg_namespace`) — classified by 026 restore scope

| schema | prod | self-hosted | classification |
|---|---|---|---|
| auth | ✓ | ✓ | in-scope, present ✅ |
| extensions | ✓ | ✓ | present ✅ |
| graphql | ✓ | ✓ | present ✅ |
| graphql_public | ✓ | ✓ | present ✅ |
| pgbouncer | ✓ | ✓ | present ✅ |
| public | ✓ | ✓ | in-scope (app data), present ✅ |
| realtime | ✓ | ✓ | present (self-hosted via `realtime.sql` init) ✅ |
| storage | ✓ | ✓ | present (schema only; storage-api removed → no service tables; app doesn't use Storage) ✅ |
| vault | ✓ | ✓ | present ✅ |
| _realtime | — | ✓ | extra self-hosted (init) — acceptable |
| net | — | ✓ | extra self-hosted (pg_net) — acceptable |
| supabase_functions | — | ✓ | extra self-hosted (`webhooks.sql` init) — acceptable |

- **Every prod schema exists self-hosted** → no missing-schema blocker for
  026 (FR-010). ✅
- Self-hosted extras (`_realtime`, `net`, `supabase_functions`) are a
  superset — a restore from prod won't touch them.

## Verdict

**Parity proven — no blockers for 026.** PG 17.6 = 17.6; extensions
self-hosted ⊇ prod; all prod schemas present self-hosted. A `pg_restore` of
prod into this instance won't fail on a missing extension or schema.
(FR-009 / FR-010 / FR-011, SC-006 / SC-007 ✅)

**Note for 026:** prod's `storage` / `realtime` schemas exist but the app
doesn't use those products. Their service-specific tables can be restored
as-is or excluded from the dump — either way not a blocker.
