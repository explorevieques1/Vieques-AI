#!/usr/bin/env bash
# Wait until every deploy GitHub knows about for a commit has finished.
#
# Both Vercel projects (vieques-ai, vieques-ai-bgjx) and Railway (explore-vieques)
# post commit statuses to GitHub. The Vercel MCP connector can't see this team's
# projects, so GitHub is the one place all three deploys show up together.
#
# Usage: scripts/ship/wait-live.sh [sha] [timeout_seconds]
# Exit:  0 all success · 1 any failure/error · 2 timed out
set -uo pipefail

REPO="explorevieques1/Vieques-AI"
SHA="${1:-$(git rev-parse HEAD)}"
TIMEOUT="${2:-600}"
deadline=$(( $(date +%s) + TIMEOUT ))
seen_any=0

while :; do
  # Statuses come newest-first; keep only the latest state per context.
  latest=$(gh api "repos/$REPO/commits/$SHA/statuses" --paginate \
    --jq '.[] | [.context, .state, .target_url] | @tsv' 2>/dev/null \
    | awk -F'\t' '!seen[$1]++')

  if [ -n "$latest" ]; then
    seen_any=1
    if ! printf '%s\n' "$latest" | awk -F'\t' '$2=="pending"{f=1} END{exit !f}'; then
      printf '%s\n' "$latest" | awk -F'\t' '{printf "%-34s %-8s %s\n", $1, $2, $3}'
      printf '%s\n' "$latest" | awk -F'\t' '$2=="failure"||$2=="error"{f=1} END{exit f}' && exit 0
      exit 1
    fi
  fi

  if [ "$(date +%s)" -ge "$deadline" ]; then
    [ "$seen_any" = 0 ] && echo "No deploy statuses appeared for $SHA (is the push on main?)"
    printf '%s\n' "$latest" | awk -F'\t' 'NF{printf "%-34s %-8s %s\n", $1, $2, $3}'
    exit 2
  fi
  sleep 10
done
