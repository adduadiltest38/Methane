#!/usr/bin/env bash
# Fail if any banned word (ci/banned_words.txt + optional $BANNED_OPERATOR_NAMES) appears in
# user-facing code or docs.
set -euo pipefail
cd "$(dirname "$0")/.."

PATHS=(README.md DATA_SOURCES.md web/app web/components web/lib worker/flarewatch)

terms_file="$(mktemp)"
trap 'rm -f "$terms_file"' EXIT
grep -vE '^\s*(#|$)' ci/banned_words.txt > "$terms_file"
if [[ -n "${BANNED_OPERATOR_NAMES:-}" ]]; then
  printf '%s\n' "$BANNED_OPERATOR_NAMES" | grep -vE '^\s*$' >> "$terms_file"
fi

status=0
while IFS= read -r term; do
  term="$(echo "$term" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  [[ -z "$term" ]] && continue
  if matches=$(grep -rIniwF --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=__pycache__ -- "$term" "${PATHS[@]}" 2>/dev/null); then
    echo "Banned term found: '$term'"
    echo "$matches" | sed 's/^/  /'
    status=1
  fi
done < "$terms_file"

if [[ $status -eq 0 ]]; then
  echo "Banned-words check passed ($(wc -l < "$terms_file") terms)."
fi
exit $status
