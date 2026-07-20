-- 144: transparent portrait cutouts are PNG renditions; existing delivery
-- renditions remain WebP so consumers cannot silently change their contract.

begin;

alter table public.media_asset_variants
  drop constraint if exists media_asset_variants_rendition_check,
  drop constraint if exists media_asset_variants_mime_type_check;

alter table public.media_asset_variants
  add constraint media_asset_variants_rendition_check
    check (rendition in ('thumb', 'preview', 'scene', 'cutout')),
  add constraint media_asset_variants_mime_type_check
    check (
      (rendition = 'cutout' and mime_type = 'image/png')
      or (rendition in ('thumb', 'preview', 'scene') and mime_type = 'image/webp')
    );

commit;
