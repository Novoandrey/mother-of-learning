# MEDIA-05 — production quickstart

## Prerequisites

- Deploy the application code; this spec has no database migration.
- Sign in as any member of the target campaign. Keep one disposable image that
  is not a portrait and one asset that can safely be assigned to a disposable
  NPC/creature.

## Verify unused-asset deletion

1. Open `/c/<campaign-slug>/media` and upload a clearly named disposable PNG,
   JPEG or WebP. Wait until its preview is ready.
2. Press `Удалить…`. The dialog must first say it is checking usages.
3. Confirm that there are no portrait usages. Import-linked nodes, if shown,
   are context only and do not block deletion.
4. Press `Удалить ассет`, reload the page and confirm the item has gone.
5. In the deployment activity log, confirm `media.deleted` for the asset ID.
   If an R2 request failed, expect `media.delete.storage_cleanup_failed`; the
   database asset is still correctly deleted, while the operator removes the
   reported orphan object manually.

## Verify used-asset protection

1. Assign the second disposable asset as a portrait through the existing
   portrait picker, then reload the node page.
2. Return to the asset in `/c/<campaign-slug>/media` and press `Удалить…`.
3. Confirm the dialog lists `Портрет: <node title>` with a working node link
   and does not offer `Удалить ассет`.
4. In a second browser tab, keep the delete summary open; assign the asset as
   a portrait before confirming deletion. The delete request must return the
   blocked state rather than remove the asset.
5. Reload `/tg`, open the affected node and confirm its portrait still uses
   the ready `preview`, never the original.

## Access check

From an account outside the campaign, direct requests to both
`/api/media/<asset-id>/usage?campaignId=<campaign-id>` and
`DELETE /api/media/<asset-id>?campaignId=<campaign-id>` must return `403` and
must not disclose usages or storage keys.
