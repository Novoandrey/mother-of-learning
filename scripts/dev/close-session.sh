#!/usr/bin/env bash
# scripts/dev/close-session.sh <short-slug> — скаффолд закрытия сессии.
export TZ=Europe/Paris  # session dates follow Andrey, not UTC
# Вычисляет следующий номер чата, создаёт chatlog-файл по шаблону из
# chatlog/README.md и печатает чеклист закрытия.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

SLUG="${1:?usage: close-session.sh <short-slug>  (например: spec022-clarify)}"
DATE=$(date +%F)
LAST=$(ls chatlog 2>/dev/null | grep -oE 'chat[0-9]+' | grep -oE '[0-9]+' | sort -n | tail -1)
NN=$(( ${LAST:-0} + 1 ))
FILE="chatlog/${DATE}-chat${NN}-${SLUG}.md"

if [ -e "$FILE" ]; then echo "❌ уже существует: $FILE"; exit 1; fi

cat > "$FILE" <<EOF
# Chat ${NN} — <название>, ${DATE}

## Контекст (откуда пришли)
<одна-две строки: что было на входе, что просил пользователь>

## Что сделано
- 

## Миграции
- (нет)

## Коммиты
- \`<sha>\` <title>

## Действия пользователю (после чата)
- [ ] 

## Что помнить следующему чату
- 
EOF

echo "✅ создан $FILE (chat ${NN})"
echo ""
echo "Чеклист закрытия сессии:"
echo "  1. Заполнить $FILE"
echo "  2. NEXT.md: обновить «Активная работа» / «Дедлайны» / Last updated (только состояние!)"
echo "  3. Status-строки затронутых спек (.specify/specs/*/spec.md) — двинуть фазу"
echo "  4. backlog.md: новые баги/идеи добавить; сделанное пометить ✅"
echo "  5. bash scripts/dev/status.sh — мета-слой должен быть ✅"
echo "  6. git add -A && git commit && git push (workflow-файлы коммитит пользователь)"
