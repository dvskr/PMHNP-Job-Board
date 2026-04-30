#!/usr/bin/env bash
# Fast secret scan — current files via git grep, history via git log -S (literal,
# index-backed, much faster than -G regex). Read-only.

set -u
cd "$(dirname "$0")/.."

REPORT=".tmp_secret_scan_report.txt"
echo "Repo secret scan — $(date)" > "$REPORT"
echo "==========================================" >> "$REPORT"
echo "" >> "$REPORT"

# Known literal strings (fast). Add more as needed.
LITERAL_HISTORY=(
  "oWTJ14PgJiEenXTf"           # leaked Supabase password
)

# Regex patterns for current-tree only (fast on a single tree).
declare -A REGEX_CURRENT=(
  ["aws_access_key"]='AKIA[0-9A-Z]{16}'
  ["github_pat"]='ghp_[a-zA-Z0-9]{36}'
  ["openai_key"]='sk-[a-zA-Z0-9]{40,}'
  ["anthropic_key"]='sk-ant-[a-zA-Z0-9_-]{40,}'
  ["stripe_live"]='sk_live_[a-zA-Z0-9]{20,}'
  ["google_api"]='AIza[0-9A-Za-z_-]{35}'
  ["slack_token"]='xox[baprs]-[a-zA-Z0-9-]{10,}'
  ["jwt_token"]='eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}'
  ["private_key"]='BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY'
  ["leaked_db_pw"]='oWTJ14PgJiEenXTf'
)

echo "--- 1. Current files ---" | tee -a "$REPORT"
for name in "${!REGEX_CURRENT[@]}"; do
  pat="${REGEX_CURRENT[$name]}"
  hits=$(git grep -InE "$pat" -- ':(exclude)node_modules' ':(exclude).next' ':(exclude).tmp_*' ':(exclude)package-lock.json' ':(exclude)scripts/scan-secrets*.sh' ':(exclude)scripts/diagnose-dedup-failure.ts' 2>/dev/null | head -10)
  if [ -n "$hits" ]; then
    echo "" | tee -a "$REPORT"
    echo "[$name]" | tee -a "$REPORT"
    echo "$hits" | tee -a "$REPORT"
  fi
done

echo "" | tee -a "$REPORT"
echo "--- 2. Git history (literal -S only, fast) ---" | tee -a "$REPORT"
for s in "${LITERAL_HISTORY[@]}"; do
  echo "" | tee -a "$REPORT"
  echo "[literal: $s]" | tee -a "$REPORT"
  count=$(git log --all --oneline -S"$s" 2>/dev/null | wc -l)
  echo "  found in $count commits across all refs" | tee -a "$REPORT"
  if [ "$count" -gt 0 ]; then
    git log --all --oneline -S"$s" 2>/dev/null | head -15 | tee -a "$REPORT"
  fi
done

echo "" | tee -a "$REPORT"
echo "Report written to $REPORT"
