# Production quickstart

1. Apply migration 143, then 144, through the normal production migration path.
2. Deploy the application and run `npx tsx scripts/generate-portrait-cutouts.ts --prod --tag pc`.
   It is dry-run; it must report candidate/skip counts and perform no R2 or DB writes.
3. Review the list. Only with an explicit operator decision run the same command with `--commit`.
4. Open a PC map token on desktop and reload; it should use cutout after completion, or
   the existing preview while no cutout exists.
5. Open the same map in Telegram Mini App and reload. Verify the token background is
   transparent and no original image is requested. If the Telegram login cannot be
   automated, this is the user-owned smoke step.
