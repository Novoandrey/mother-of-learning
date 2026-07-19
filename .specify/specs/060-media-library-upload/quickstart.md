# Quickstart: проверить MEDIA-01

## Preconditions

1. Migration for `media_assets` is applied to the target database.
2. The application has working R2 write credentials and the existing public
   asset base URL.
3. Test accounts exist for owner/DM and player in the same campaign, and a user
   outside the campaign.

## Automated gate

From `mat-ucheniya/`:

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

## Primary journey

1. Sign in as any campaign member and open `/c/<slug>/media`.
2. Confirm the empty state explains the library and shows the upload control.
3. Upload a PNG/JPEG/WebP smaller than 12 MiB.
4. Confirm a success message and a card with preview and original filename.
5. Reload the browser page.
6. Confirm the same card and image remain.

## Failure journey

1. Try a text file renamed to `.png`; confirm a clear error and no new card.
2. Try an image larger than 12 MiB; confirm rejection and no new card.
3. Reload; confirm earlier valid assets still render.

## Role journey

1. Sign in as a player in the same campaign; confirm the asset is visible and
   the upload control is rendered.
2. Sign in as a user outside the campaign; confirm `/c/<slug>/media` is not
   accessible.
3. Upload an allowed image as that player; confirm it succeeds and creates an
   asset in the shared library.

## Production evidence

Record the tested campaign, account roles, filenames, result and date in the
session chatlog before marking the spec complete.

### 2026-07-20 — local and automated evidence

- `npm test`: PASS — 45 test files, 633 tests. This includes route-level member
  success, outside-campaign denial, Postgres failure cleanup and thrown-client cleanup.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS with 0 errors and 5 pre-existing warnings outside
  MEDIA-01.
- `npm run build`: PASS; the output contains `/api/media/upload` and
  `/c/[slug]/media`.
- Unauthenticated requests to `/` and `/c/example/media`: PASS — both return
  `307` to `/login`, confirming the application auth gate.
- `git diff --check`: PASS.

### 2026-07-20 — production database evidence

- Target: self-hosted production Supabase on `db.theloopers.org`; staging was
  not modified.
- Applied `supabase/migrations/139_media_assets.sql` transactionally through
  `psql -v ON_ERROR_STOP=1` inside the production `supabase-db` container.
- Verification: table and campaign-created index present; RLS enabled; the
  only application policy is authenticated-member `SELECT`; initial row count
  is zero.

### 2026-07-20 — production deployment and DM journey

- PR #54 was merged into `main`; the Dokploy production deployment completed.
- Production has the server-side R2 credentials and build-time
  `NEXT_PUBLIC_R2_ASSET_BASE=https://portraits.theloopers.org` configured.
- As the `admin` owner/DM of campaign `mat-ucheniya`, opened
  `/c/mat-ucheniya/media` and confirmed the empty-state upload control.
- Negative check: a JPEG payload named `logo.png` was rejected with the expected
  format error. This confirms MIME/signature mismatch is not accepted.
- Positive check: uploaded `media-01-upload-test.jpg` (43 KiB); the card and
  preview appeared. After a page reload, the same card remained and its visible
  preview resolved from `https://portraits.theloopers.org/media/...`.

### Remaining membership evidence

1. Sign in as a player who belongs to `mat-ucheniya`; verify the shared image
   is visible and the upload control accepts an allowed image.
2. Sign in as a user outside the campaign; verify the media page is inaccessible.
