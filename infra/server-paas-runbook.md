# Runbook: Server & PaaS foundation (spec-023)

Executable steps for standing up the box. **Operator (Andrey + Степан)
runs these on the server; Claude can't SSH in.** Paste errors/logs back to
Claude for debugging. Tied to `.specify/specs/023-server-paas-foundation/`.

Conventions: `<domain>` = **theloopers.org** (Cloudflare registrar + DNS);
`<SERVER_IP>` = box public IP; `<user>` = your non-root sudo user. Run as
root unless noted.

Subdomain plan (theloopers.org):
- `panel.theloopers.org` → Dokploy dashboard (HTTPS)
- `staging.theloopers.org` → the app (staging deploy, this slice)
- `db.theloopers.org` → self-hosted Supabase (later, slice 024)
- apex `theloopers.org` → stays on Vercel until cutover (027)

---

## Step 0 — Prerequisites (do before touching the box)

- [ ] **Create a Hetzner Cloud account** (console.hetzner.cloud) and add a
      payment method. New here → expect ID/payment verification, which can
      take a few minutes to a day before you can spin up servers.
- [ ] SSH **public** key ready (`~/.ssh/id_ed25519.pub`). If you don't have
      one: `ssh-keygen -t ed25519`.
- [ ] Domain registered (Cloudflare Registrar recommended) and its DNS
      managed in Cloudflare.
- [ ] Subdomains decided (theloopers.org): `panel` (Dokploy UI), `staging`
      (app), `db` (Supabase, later). Apex stays on Vercel for now. Nothing
      to add in DNS yet — A-records come at Steps 4–5.

## Step 1 — Provision the VPS

- [ ] Create a **Hetzner Cloud CX23** server (2 vCPU / 4 GB / 40 GB,
      Cost-Optimized, x86), image **Ubuntu 24.04 LTS**, **Helsinki** (EU),
      and attach your SSH key during creation (so root login is key-only
      from the start).
      - NB: CX33 (8 GB) was the original target but Cost-Optimized is
        "limited availability"; CX23 (4 GB) is enough for THIS slice
        (Dokploy + Next staging, no Supabase yet). **Rescale up at slice
        024** when self-hosted Supabase lands (power off → change type →
        power on; if CX33 still limited, target Regular-Performance CPX31,
        8 GB). Disk can only grow on rescale, never shrink.
- [ ] Note `<SERVER_IP>`. Confirm SSH: `ssh root@<SERVER_IP>`.
- [ ] **Fallback access (FR-005):** confirm the Hetzner web **Console**
      works (Cloud console → server → Console) so a bad firewall rule
      can't lock you out permanently.

## Step 2 — Harden the box

```bash
# 2.1 Update
apt update && apt upgrade -y

# 2.2 Non-root sudo user (example user: andrey)
adduser andrey                      # set a password (used for sudo)
usermod -aG sudo andrey
# copy root's authorized_keys to the new user so key login works:
mkdir -p /home/andrey/.ssh
cp /root/.ssh/authorized_keys /home/andrey/.ssh/
chown -R andrey:andrey /home/andrey/.ssh
chmod 700 /home/andrey/.ssh
chmod 600 /home/andrey/.ssh/authorized_keys

# 2.3 Lock down SSH: key-only, no root login.
#   Use a high-priority drop-in: it sorts before 50-cloud-init.conf (which
#   on cloud images may re-enable PasswordAuthentication). sshd reads the
#   Include glob near the top and "first value wins", so 00-* wins.
cat > /etc/ssh/sshd_config.d/00-hardening.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
EOF
sshd -t && systemctl restart ssh     # sshd -t validates config before restart
# VERIFY before closing root: in a NEW terminal, `ssh <user>@<SERVER_IP>`
# still works AND `ssh root@<SERVER_IP>` is now refused.

# 2.4 Firewall — allow SSH FIRST, then enable. Do NOT open 3000.
apt install ufw -y
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp        # SSH  (allow BEFORE enable!)
ufw allow 80/tcp        # HTTP  (Traefik / ACME)
ufw allow 443/tcp       # HTTPS (Traefik)
ufw enable
ufw status verbose

# 2.5 fail2ban (SSH brute-force) + auto security patches
apt install fail2ban unattended-upgrades -y
systemctl enable --now fail2ban
dpkg-reconfigure -plow unattended-upgrades   # choose "Yes"
```

✅ **SC-001/SC-002 check:** from another machine, `ssh root@<SERVER_IP>`
must be refused; `ssh <user>@<SERVER_IP>` works by key only; and
`nmap <SERVER_IP>` (or a port check) shows only 22/80/443 open.

## Step 3 — Install Dokploy

```bash
# You're now `andrey` (root SSH was disabled in Step 2), so use sudo.
# Installs Docker (if absent) + Swarm + Traefik + postgres + redis.
curl -sSL https://dokploy.com/install.sh | sudo sh
# add your user to docker group (so you can run docker without sudo later;
# takes effect after you log out and back in)
sudo usermod -aG docker andrey
# verify services (sudo until you've re-logged in)
sudo docker service ls   # expect dokploy, dokploy-postgres, dokploy-redis (1/1)
# Traefik runs as a plain container (not a swarm service) — verify with:
sudo docker ps | grep -i traefik
```

## Step 4 — Secure dashboard access (no public port 3000)

We will **not** expose port 3000. Register via an SSH tunnel, then move the
dashboard to `panel.<domain>` over HTTPS.

```bash
# 4.1 From your LAPTOP, tunnel 3000 over SSH (port 3000 stays closed in ufw):
ssh -L 3000:localhost:3000 <user>@<SERVER_IP>
# leave this open, then browse http://localhost:3000 on your laptop
```

- [ ] In the browser: create the **admin account** (first user).
- [ ] Enable **2FA** on the admin account (Settings → Profile/Security).
- [ ] In Cloudflare DNS: add an **A record** `panel` → `<SERVER_IP>`,
      **DNS-only (grey cloud)**.
- [ ] In Dokploy: **Settings → Web Server** → set server domain to
      `panel.<domain>`, enable HTTPS (Let's Encrypt). Save; wait for cert.
- [ ] Confirm `https://panel.<domain>` loads with a valid cert.
- [ ] Keep port 3000 closed (it already is in ufw). Optional belt-and-
      suspenders to unpublish it from Swarm:
      `docker service update --publish-rm "published=3000,target=3000,mode=host" dokploy`

✅ **SC-003 check:** `https://panel.<domain>` works behind login + 2FA;
`curl -v http://<SERVER_IP>:3000 --connect-timeout 5` from outside **times out**.

## Step 5 — DNS for the app

- [ ] Cloudflare DNS: add **A record** `staging` → `<SERVER_IP>`,
      **DNS-only (grey cloud)** (so Traefik can complete ACME).
- [ ] Verify propagation: `dig +short staging.<domain>` → `<SERVER_IP>`.

## Step 6 — Prepare `mat-ucheniya` for a Docker build

These files are added to the repo (Claude commits them on Implement;
shown here so they're ready). They make Next 16 produce a standalone image.

**`mat-ucheniya/next.config.ts`** — add `output: 'standalone'`:
```ts
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "standalone",
};
export default nextConfig;
```

**`mat-ucheniya/Dockerfile`:**
```dockerfile
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* must be present at build time (Next inlines them).
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# /docs reads .md from disk at runtime (lib/docs.ts) — ship the folder.
COPY --from=builder /app/docs ./docs
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

**`mat-ucheniya/.dockerignore`:**
```
node_modules
.next
.git
.env*
npm-debug.log*
.DS_Store
```
> NB: don't ignore `*.md` — `/docs` ships 63 markdown files read at runtime.

## Step 7 — Create the app in Dokploy

- [ ] New **Project** → **Application** → source **GitHub**, repo
      `Novoandrey/mother-of-learning`, branch `main`.
- [ ] **Build type: Dockerfile.** Set **build context / path** to the
      monorepo subdir `mat-ucheniya` and Dockerfile `mat-ucheniya/Dockerfile`.
- [ ] **Environment** (point at the EXISTING managed Supabase — staging,
      read-mostly; self-hosted comes in 024). Set BEFORE first build so
      `NEXT_PUBLIC_*` are inlined:
      ```
      NEXT_PUBLIC_SUPABASE_URL=...        # current managed project
      NEXT_PUBLIC_SUPABASE_ANON_KEY=...
      SUPABASE_SERVICE_ROLE_KEY=...
      APP_URL=https://staging.<domain>
      ```
- [ ] **Domain**: add `staging.<domain>`, container port **3000**, enable
      **HTTPS (Let's Encrypt)**.

⚠️ Staging shares the prod DB — **don't do destructive writes** on staging,
or spin a separate free Supabase project for it.

## Step 8 — Deploy + verify + rollback

- [ ] Click **Deploy**. Watch build/deploy **logs** in Dokploy.
- [ ] Open `https://staging.<domain>` — valid cert; the login page loads.
- [ ] Sanity: a read-only page renders (auth against managed Supabase works).
- [ ] **Rollback test:** push a deliberately broken commit (or redeploy a
      previous one) and confirm Dokploy lets you **roll back** to the prior
      deployment and the broken build didn't take down the running one.

✅ **SC-004/SC-005 check:** app served from git over HTTPS; rollback works;
logs visible.

## Step 9 — Reboot resilience

```bash
sudo reboot
```
- [ ] After reboot: `ufw status` active; `systemctl is-active fail2ban` →
      active; `docker service ls` shows Dokploy + app back; `https://staging.<domain>` loads.

✅ **SC-006 check:** everything self-starts after reboot.

## Step 10 — Back up Dokploy config

- [ ] In Dokploy: configure **automated backups** (destination can be S3-
      compatible, e.g. an R2 bucket later) and/or export project/settings.
- [ ] Verify you can read back the exported config.

✅ **SC-007 check:** Dokploy config exported and restorable.

---

## Done = ready for 024

When all ✅ pass: the box is hardened, Dokploy serves a real `mat-ucheniya`
staging over HTTPS with rollback, survives reboot, and its config is backed
up. Next slice **024** stands up self-hosted Supabase on `db.<domain>` and
repoints the staging app's env to it.

## If something breaks

Paste into chat: the failing command + its full output, `docker service ls`,
relevant `docker service logs <svc>`, and `ufw status`. Claude will diagnose
and amend this runbook.
