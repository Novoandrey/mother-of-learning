# Project: Mother of Learning — Claude project instructions (canonical)

> This file is the canon. The text in Claude.ai → Project → Instructions is a
> **paste of this file**. Whenever this file changes, re-paste it there (add a
> user action item in the session's chatlog). Last sync: 2026-06-10 (chat 89).

## Repo

At the start of every new chat, clone fresh:
`git clone https://Novoandrey:<GITHUB_PAT>@github.com/Novoandrey/mother-of-learning.git`
No project files are attached — the cloned repo is the only source of truth.
Token is intentionally shared; don't warn about it.

> `<GITHUB_PAT>` is a placeholder — the live token exists **only** in the
> Claude project settings (never in the repo: push protection + the old
> git-filter-repo lesson). When re-pasting this file into settings, carry
> the real token over from the previous settings text.

Prod: **https://theloopers.org** (self-hosted Hetzner/Dokploy; Vercel is frozen).

## Boot protocol (every new chat)

1. Clone (above).
2. `bash scripts/dev/status.sh` — version, deadlines, active work, Status of
   every spec, meta-lint. **Fix any ❌ before feature work** (they are cheap
   now and expensive later).
3. Read `NEXT.md` (≤150 lines). If working a spec — read its `tasks.md`;
   `plan.md` only if something is unclear.
4. **Trust the repo over memory.** Claude's own memory of spec/infra state may
   lag; `**Status**:` lines + status.sh output are the source of truth.

Do NOT read `backlog.md`, `backlog-archive.md`, `chatlog/`,
`chatlog/_legacy-NEXT-archive.md`, or `.specify/specs/_archive/` by default.
Reading them is a deliberate choice — say why. For vague "what's next"
questions: status.sh + `NEXT.md` already answer it; open `backlog.md` only
when hunting for ideas.

## Languages

- Chat: Russian.
- Code, comments, commits, spec-kit artifacts (`spec.md`, `plan.md`,
  `tasks.md`, `constitution.md`, anything under `.specify/`), `infra/`,
  `meta/`: English. (Russian inline is fine where it quotes UI text.)

## Working mode (vibe-coding, ADHD-friendly)

- Find the first unchecked `[ ]` in the active spec's `tasks.md`, continue
  from there. `(tail)` items are consciously deferred — skip unless asked.
- Write code; don't narrate the process. Show the result.
- One task at a time. Don't offer 5 options — pick the best, state why in one
  sentence, do it. Ask only if the choice is genuinely 50/50.
- No packaging until the code is finished.
- When a feature is done: propose saving progress, bumping the version,
  starting a new chat.

## Spec-kit workflow (hard rule)

Phases: Specify → Clarify → Plan → Tasks → Implement.
- Never advance to the next phase on your own. Finish the current artifact,
  hand it over, wait for explicit "ok" / "continue" / "next". "Continue"
  means "keep going on the current task", not "skip to the next phase".
- During Implement, stop after every completed task — mark `[x]`, report
  briefly, wait for confirmation before the next.
- When a phase completes, update the spec's `**Status**:` line (vocabulary in
  `scripts/dev/status.sh` header).
- If the user tries to skip a phase, push back once, then comply if they
  insist.

## Migrations & SQL

- After creating any `.sql` migration, call `present_files`. No exceptions.
- Every SQL block handed to the user ends with a verification `SELECT` that
  prints an unambiguous ✅/❌ result.

## End of session

1. `bash scripts/dev/close-session.sh <slug>` → fill the created chatlog file.
2. Update `NEXT.md` — **state only** (Активная работа / Дедлайны / Last
   updated). History goes to `CHANGELOG.md` and `chatlog/`, never here.
3. `backlog.md`: add new bugs/ideas; mark shipped items `✅` (the next
   meta-pass auto-archives them). Don't restructure.
4. `bash scripts/dev/status.sh` must end with "✅ Мета-слой чист" (an expected
   deadline ⏰ is fine).
5. Commit and push. Files under `.github/workflows/` must be committed by the
   user — the bot PAT lacks `workflow` scope.

## Stack

Next.js 16 (App Router) + Supabase (self-hosted) + Tailwind v4 + Vitest.
Working directory in the repo is `mat-ucheniya/`. Code rules canon:
`mat-ucheniya/AGENTS.md` (Next.js 16 caveat, sidebar cache invalidation,
mandatory auth gating of server actions). `npm run build` hangs in the
sandbox — rely on `lint` + `typecheck` + `vitest`; CI gate is authoritative.
