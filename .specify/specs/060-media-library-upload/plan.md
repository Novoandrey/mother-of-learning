# Implementation Plan: Медиатека — загрузка и библиотека

**Branch**: `codex/epic-media-library` | **Date**: 2026-07-20 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `.specify/specs/060-media-library-upload/spec.md`

## Summary

Добавить кампейн-скоупированную таблицу медиа-ассетов, защищённый путь одиночной
загрузки через уже существующий общий image-upload слой и desktop-страницу
медиатеки. Owner/DM загружает один проверенный файл в R2 и создаёт запись;
любой участник кампании видит newest-first сетку и результат после reload.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19, Next.js 16.2 App Router  
**Primary Dependencies**: Next.js, Supabase SSR/PostgREST, `aws4fetch`, Tailwind CSS  
**Storage**: self-hosted PostgreSQL for metadata; Cloudflare R2 for bytes  
**Testing**: Vitest, TypeScript compiler, ESLint, Next production build, manual production quickstart  
**Target Platform**: self-hosted Linux container on Hetzner/Dokploy; desktop browser first  
**Project Type**: full-stack web application  
**Performance Goals**: one accepted file appears within 60 seconds; library renders a small campaign collection without pagination in MEDIA-01  
**Constraints**: one file, 12 MiB maximum, PNG/JPEG/WebP, server-held R2 credentials, current bucket is public-read  
**Scale/Scope**: one campaign, hundreds of initial images; no search, editing, deletion, bulk upload or consumer bindings

## Constitution Check

### Project constitution

- **Data correctness first**: PASS — schema/RLS and compensating cleanup precede UI success.
- **Desktop UX before mobile**: PASS — the requested DM surface is desktop; no `/tg` work.
- **Simple stack**: PASS — reuses PostgreSQL, current R2 and current Route Handler pattern.
- **Reusable patterns**: PASS — extends `lib/server/image-upload.ts`, does not clone validation.
- **Every release playable/useful**: PASS — upload→library→reload is independently usable.
- **Server auth gating**: PASS — route resolves membership and owner/DM role before storage write.

### Media epic constitution

- **M1/M2 asset separate from usage**: PASS — no portrait/map foreign keys in this slice.
- **M3 immutable original**: PASS — no update operation exists.
- **M4 campaign boundary**: PASS — RLS membership read, owner/DM upload.
- **M5 data owns lifecycle**: PASS — every listed object has a metadata row.
- **M6 one intake mechanism**: PASS — common validation/upload helper.
- **M7 one tested path**: PASS — one user story and production quickstart.

No violations require complexity exceptions. Re-check after implementation.

## Project Structure

### Documentation

```text
.specify/specs/060-media-library-upload/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/upload.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code

```text
mat-ucheniya/
├── Dockerfile
├── app/
│   ├── api/media/upload/route.ts
│   └── c/[slug]/media/page.tsx
├── components/
│   ├── media-library.tsx
│   ├── media-upload-form.tsx
│   └── nav-tabs.tsx
├── lib/
│   ├── media.ts
│   ├── queries/media.ts
│   ├── server/image-upload.ts
│   └── __tests__/media.test.ts
└── supabase/migrations/139_media_assets.sql
```

**Structure Decision**: сохранить текущий App Router layout: server page читает
данные напрямую, отдельный client form выполняет upload, pure media module
содержит DTO/URL/name helpers, query module изолирует read model.

## Design

### Request flow

1. Server page validates campaign membership and queries visible assets through RLS.
2. Owner/DM sees the upload form; player sees only the grid.
3. Form posts `campaignId + file` to the protected route.
4. Route validates role, size, MIME and signature.
5. Shared image layer writes `media/<campaignId>/<uuid>.<ext>`.
6. Route inserts metadata with service role.
7. On insert failure, route best-effort deletes the just-written object.
8. On success, client refreshes the Server Component and the new card appears.

`NEXT_PUBLIC_R2_ASSET_BASE` is the canonical public base for the shared library;
the existing portrait base remains a compatibility fallback during migration.

### Error model

- User errors return 400/403 with Russian actionable text.
- Missing configuration returns 503.
- R2 or Postgres failures return 502 without infrastructure details.
- Logs record event name, campaign, user and byte count, never file bytes or credentials.

## Post-design Constitution Re-check

PASS. The design adds one table, one endpoint and one surface, reuses existing
upload/auth/query patterns and leaves all later epic concepts deferred.

## Complexity Tracking

No constitution violations.
