# Research: auto-deploy trigger (spec-028 US2)

Version-sensitive findings for triggering a Dokploy deploy from GitHub Actions.
Captured chat 88 (2026-06-07). Re-verify against the running Dokploy version at
Implement.

## Trigger mechanism — Dokploy API (chosen)

Per Dokploy docs (Going Production / Auto Deploy), trigger a deploy from CI via the
API:

```
curl -X POST 'https://panel.theloopers.org/api/application.deploy' \
  -H 'accept: application/json' \
  -H 'x-api-key: <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{ "applicationId": "<APP_ID>" }'
```

- **Token**: Dokploy profile → *Generate API Key*.
- **applicationId**: tail of the app URL in Dokploy
  (`…/services/application/<APP_ID>`).
- Community wrappers exist: `benbristow/dokploy-deploy-action`, marketplace
  "Dokploy Deployment" / "Dokploy Webhook Deploy Action". Plain `curl` is enough;
  an action only adds commit metadata.

## Why NOT Dokploy's built-in GitHub auto-deploy

Built-in auto-deploy fires a Dokploy webhook on every push and deploys
**unconditionally** — no slot for a pre-deploy gate. We need `lint+tsc+vitest` to
pass first (FR-012), so Actions must own the flow: gate → (green) → API deploy.
This also sidesteps reports of the built-in GitHub webhook intermittently not
triggering (Dokploy#3787). **Action:** if the app's "Auto Deploy" toggle is on,
turn it OFF (avoid double-deploys).

## ⚠️ Cloudflare proxy can block the Actions→Dokploy call (#3542)

`panel.theloopers.org` is Cloudflare-proxied. Reports: the curl from GitHub Actions
to the Dokploy API/webhook gets Cloudflare's bot challenge ("Just a moment…",
returns the challenge HTML instead of deploying), while the same curl from a
laptop works. Fixes that worked for others:

- **Cloudflare WAF skip / custom allow rule** scoped to the deploy path
  (`/api/application.deploy`) or to the Actions caller.
- **Gotcha**: setting a user-agent match value in the Cloudflare UI stores it with
  **escaped quotes**, so the expression matches `"Github Actions"` (with literal
  quotes) instead of `Github Actions` — match on path or a custom header instead,
  or watch the quoting.

**Plan stance:** run the first smoke (T013); if the deploy step gets the challenge,
add the WAF rule. Alternative (more work, not chosen): a separate unproxied
hostname for the deploy endpoint.

## Cosmetic — no commit metadata on API deploys (#3398, #3378)

API-triggered deploys show as "Manual deployment" / "NEW CHANGES" (no commit
message/SHA) — Dokploy doesn't yet take commit metadata on the API path (webhook
path does). Cosmetic only; ignore, or use a webhook-payload action later if we want
commit info in the deploy log.

## Version note (#3086)

A past Dokploy release (v0.25.10) broke webhook deploys for **Docker-image**
applications. Ours is a **Dockerfile/git** application driven via the **API**, so
likely unaffected — but confirm `application.deploy` works on the box's current
Dokploy version during the smoke.

## Gate specifics

- **Node 20** in CI (match `mat-ucheniya/Dockerfile` `node:20-alpine`).
- Gate = `npm run lint` (`eslint`, flat config) + `npm run typecheck`
  (`tsc --noEmit`, new script) + `npm run test` (`vitest run`).
- **No `next build` in CI** — Dokploy builds the image on the box. (Also avoids the
  known local/sandbox build hang; irrelevant in Actions anyway.)
- `npm ci` provides `node_modules`, so `tsc` won't emit the missing-module
  false-positives seen in the bare sandbox.
