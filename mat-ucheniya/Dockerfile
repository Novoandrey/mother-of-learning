# mat-ucheniya — Next 16 standalone image.
# Built on the box by Dokploy (not in CI / not locally). See
# infra/server-paas-runbook.md (spec-023).

FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
# libc6-compat: alpine doesn't ship glibc; some deps expect it.
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# NOTE: NEXT_PUBLIC_* must be present at build time (Next inlines them).
# Set them in Dokploy's Environment before the build.
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# /docs reads its .md from disk at runtime (lib/docs.ts, process.cwd()/docs);
# standalone tracing won't include it, so ship the folder explicitly.
COPY --from=builder /app/docs ./docs
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
