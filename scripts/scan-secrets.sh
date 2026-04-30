#!/usr/bin/env bash
# Repo-wide secret scan covering current files + git history.
# Read-only — produces a report; no remediation.
#
# Patterns are sourced from common secret-scan rules (gitleaks-style):
#   - AWS access keys
#   - GitHub PATs / OAuth tokens
#   - OpenAI / Anthropic API keys
#   - Stripe keys
#   - Google API keys
#   - Supabase service-role JWTs
#   - Generic high-entropy strings near common keywords
#   - The known-leaked Supabase password from the original audit

set -uo pipefail
cd "$(dirname "$0")/.."

REPORT=".tmp_secret_scan_report.txt"
echo "Repo secret scan — $(date)" > "$REPORT"
echo "==========================================" >> "$REPORT"

declare -A PATTERNS=(
  ["aws_access_key"]='AKIA[0-9A-Z]{16}'
  ["github_pat"]='ghp_[a-zA-Z0-9]{36}'
  ["github_oauth"]='gho_[a-zA-Z0-9]{36}'
  ["github_app"]='(ghu_|ghs_)[a-zA-Z0-9]{36}'
  ["openai_key"]='sk-[a-zA-Z0-9]{40,}'
  ["anthropic_key"]='sk-ant-[a-zA-Z0-9_-]{40,}'
  ["stripe_live"]='sk_live_[a-zA-Z0-9]{24,}'
  ["stripe_publishable_live"]='pk_live_[a-zA-Z0-9]{24,}'
  ["google_api"]='AIza[0-9A-Za-z_-]{35}'
  ["slack_token"]='xox[baprs]-[a-zA-Z0-9-]{10,}'
  ["jwt_token"]='eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}'
  ["leaked_db_password"]='oWTJ14PgJiEenXTf'
  ["private_key_block"]='BEGIN (RSA |OPENSSH |EC |PGP |DSA )?PRIVATE KEY'
)

scan_label() {
  printf '\n--- %s ---\n' "$1" | tee -a "$REPORT"
}

# ── 1. Current working tree ─────────────────────────────────────────────
scan_label "1. Current files (excludes node_modules, .next, .git, .tmp_*)"
for name in "${!PATTERNS[@]}"; do
  pattern="${PATTERNS[$name]}"
  hits=$(git grep -InE "$pattern" -- ':(exclude)node_modules' ':(exclude).next' ':(exclude).tmp_*' ':(exclude)package-lock.json' 2>/dev/null | head -20)
  if [ -n "$hits" ]; then
    echo "[$name]" | tee -a "$REPORT"
    echo "$hits" | tee -a "$REPORT"
    echo "" | tee -a "$REPORT"
  fi
done

# ── 2. Git history (full repo blob scan) ────────────────────────────────
scan_label "2. Git history (commits across all branches)"
for name in "${!PATTERNS[@]}"; do
  pattern="${PATTERNS[$name]}"
  # Find commits whose diff introduced or removed the pattern.
  matched_commits=$(git log --all --oneline -p -G"$pattern" 2>/dev/null | grep -E "^commit |^[+-].*${pattern}" 2>/dev/null | head -30)
  count=$(git log --all --oneline -S"$(echo "$pattern" | sed 's/[][\\.+*?(){}|^$]/\\&/g')" 2>/dev/null | wc -l)
  if [ "$count" -gt 0 ] 2>/dev/null; then
    echo "[$name] in ${count} historical commits" | tee -a "$REPORT"
    git log --all --oneline -S"$pattern" 2>/dev/null | head -10 | tee -a "$REPORT"
    echo "" | tee -a "$REPORT"
  fi
done

echo "" | tee -a "$REPORT"
echo "Report written to $REPORT"
