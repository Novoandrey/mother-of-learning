#!/usr/bin/env bash
# scripts/dev/status.sh — boot-статус проекта + meta-lint.
#
# Запускается первым делом в каждой сессии (после clone). Печатает:
# версию, дедлайны, активную работу, таблицу статусов всех спек,
# и линт мета-слоя (документы не должны врать и распухать).
#
# Status-словарь (строка `**Status**:` в шапке spec.md):
#   Specify draft — awaiting Clarify
#   Clarified — awaiting Plan
#   Plan ready — awaiting Tasks
#   Tasks ready — awaiting Implement
#   Implement (next: T0NN ...)
#   Written — awaiting execution (operator runbook)
#   Done — in prod [(детали)]
#   Archived
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

WARN=0; ERR=0
w() { echo "  ⚠️  $1"; WARN=$((WARN+1)); }
e() { echo "  ❌ $1"; ERR=$((ERR+1)); }

VERSION=$(grep -m1 '"version"' mat-ucheniya/package.json | sed 's/[^0-9.]*//g')
echo "═══ Mother of Learning — status $(date +%F) ═══"
echo "  v${VERSION} · prod: https://theloopers.org"
echo ""

# ── Дедлайны (NEXT.md, секция '## Дедлайны', строки '- YYYY-MM-DD — …') ──
echo "── Дедлайны ──"
NOW=$(date +%s)
awk '/^## Дедлайны/{f=1;next} /^## /{f=0} f' NEXT.md | grep -E '^- [0-9]{4}-' | \
while IFS= read -r line; do
  d=$(echo "$line" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1)
  ds=$(date -d "$d" +%s 2>/dev/null || echo 0)
  diff=$(( (ds - NOW) / 86400 ))
  if   [ "$diff" -lt 0 ];  then echo "  🔴 ПРОСРОЧЕНО (${diff#-} дн.): ${line#- }"
  elif [ "$diff" -le 7 ];  then echo "  ⏰ через ${diff} дн.: ${line#- }"
  else                          echo "  • ${line#- }"
  fi
done
echo ""

# ── Активная работа (печатаем секцию из NEXT.md как есть) ──
echo "── Активная работа ──"
awk '/^## Активная работа/{f=1;next} /^## /{f=0} f' NEXT.md | sed 's/^/  /' | sed '/^  *$/d'
echo ""

# ── Спеки: Status + незакрытые таски ──
echo "── Спеки (.specify/specs) ──"
for dir in .specify/specs/*/; do
  name=$(basename "$dir")
  [ "$name" = "_archive" ] && continue
  spec="$dir/spec.md"; tasks="$dir/tasks.md"
  status=$(grep -m1 '^\*\*Status\*\*:' "$spec" 2>/dev/null | sed 's/^\*\*Status\*\*: //')
  if [ -z "$status" ]; then e "$name: нет строки **Status** в spec.md"; continue; fi
  open="-"
  [ -f "$tasks" ] && open=$(grep -c '^[[:space:]]*- \[ \]' "$tasks" || true)
  printf "  %-28s %s" "$name" "$status"
  [ "$open" != "-" ] && [ "$open" != "0" ] && printf "  [открыто: %s]" "$open"
  echo ""
  # lint: Done не может иметь открытых чекбоксов
  if echo "$status" | grep -q '^Done' && [ "$open" != "-" ] && [ "$open" != "0" ]; then
    e "$name: Status=Done, но $open незакрытых '- [ ]' в tasks.md"
  fi
done
echo ""

# ── Meta-lint размеров/гигиены ──
echo "── Meta-lint ──"
nb=$(stat -c %s NEXT.md); nl=$(grep -c '' NEXT.md)
[ "$nl" -gt 160 ] || [ "$nb" -gt 10240 ] && \
  w "NEXT.md распух: ${nl} строк / $((nb/1024))KB (лимит 150 строк / 10KB) — историю в CHANGELOG/chatlog"
bb=$(stat -c %s backlog.md)
[ "$bb" -gt 143360 ] && \
  w "backlog.md > 140KB ($((bb/1024))KB) — пора архивный проход (✅-записи → backlog-archive.md)"
echo "  backlog.md: $((bb/1024))KB (ratchet-цель <100KB; ✅-маркируй сделанное — архивируется meta-проходом)"
# рассинхрон активной спеки: NEXT 'Активная работа' vs Status
active_specs=$(awk '/^## Активная работа/{f=1;next} /^## /{f=0} f' NEXT.md | grep -oE 'spec-[0-9]{3}')
for s in $active_specs; do
  num=${s#spec-}
  d=$(ls -d .specify/specs/${num}-* 2>/dev/null | head -1)
  if [ -z "$d" ]; then
    grep -q "$s" NEXT.md && [ "$num" = "021" ] || w "$s в «Активной работе», но папки .specify/specs/${num}-* нет"
  else
    st=$(grep -m1 '^\*\*Status\*\*:' "$d/spec.md" | sed 's/^\*\*Status\*\*: //')
    echo "$st" | grep -qE '^(Done|Archived)' && \
      e "$s активна в NEXT.md, но Status='$st' — рассинхрон"
  fi
done

echo ""
if [ "$ERR" -gt 0 ]; then echo "❌ Мета-слой: $ERR ошибок, $WARN предупреждений — чинить до фичевой работы."
elif [ "$WARN" -gt 0 ]; then echo "⚠️  Мета-слой: $WARN предупреждений."
else echo "✅ Мета-слой чист."
fi
