# Quickstart: проверить MEDIA-02

## Preconditions

1. Migration 140 is applied to the target database.
2. Web app and `media-worker` run the same rendition version and have server
   R2/Supabase credentials.
3. `portraits.theloopers.org` serves versioned rendition keys through CDN cache.
4. A campaign has at least 100 testable media rows; production verification does
   not create hundreds of throwaway permanent files.

## Automated gate

From `mat-ucheniya/`:

```powershell
npm test
npm run typecheck
npm run lint
npm run build
docker build -f Dockerfile.media-worker -t mol-media-worker .
```

## Primary production journey (P1)

1. Sign in as a DM and open `/c/<slug>/media` for a campaign with more than one
   page of assets.
2. Confirm the initial grid contains at most 48 cards and requests `thumb`
   rendition URLs, not original media keys.
3. Load the next page; confirm new cards append without duplicates or a changed
   order in the first page.
4. Upload a supported image. Confirm the card first indicates processing and,
   after worker completion, renders a thumb.
5. Reload before and after completion; confirm the asset and its state remain.
6. Confirm the worker logs one successful job and R2 contains one each of
   `thumb`, `preview`, and `scene` for the current rendition version.

## Failure and recovery journey

1. Force one worker job to fail using a controlled invalid source fixture.
2. Confirm the original metadata/card shows `failed`, no broken image is shown,
   and only owner/DM sees retry.
3. Retry as DM; confirm one job is requeued and ready variants are not
   duplicated.
4. Restart the worker while a job is leased; after lease expiry confirm the job
   is recoverable and no original was lost.

## Consumer contract check

1. Invoke the test consumer/server helper for one ready asset with `scene`.
2. Confirm it returns exactly the scene rendition URL.
3. Confirm no media-list request and no original URL is made.
4. Invoke it for a foreign campaign asset; confirm no URL is returned.

## Evidence to record

- campaign slug and role;
- count/limit of first page, plus cursor boundary result;
- network evidence that grid uses thumbnails;
- sample job id/state transition and rendition keys (without credentials);
- worker restart/retry result;
- production deployment revision and date.
