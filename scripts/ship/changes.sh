#!/usr/bin/env bash
# List uncommitted changes, one per line, tagged with the app they deploy to and
# whether they touch a surface that must be reviewed before it goes live.
#
#   <app>\t<risk>\t<path>
#   app:  frontend | landing | backend | db | tooling | other
#   risk: review | fast | skip
#
# "skip" = never commit (scratch files, caches, data dumps). The repo is PUBLIC.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

app_of() {
  case "$1" in
    frontend/*) echo frontend ;;
    landing/*)  echo landing ;;
    backend/*)  echo backend ;;
    db/*)       echo db ;;
    .claude/*|scripts/*|CLAUDE.md) echo tooling ;;
    *)          echo other ;;
  esac
}

risk_of() {
  local path="$1"
  # Never ship: scratch notes, data dumps, Python caches, env files.
  case "$path" in
    *.csv|*.txt|*__pycache__*|*.pyc|*.env|*.env.*|.env*) echo skip; return ;;
    *__preview*) echo skip; return ;;   # ui-craft's throwaway 390px harness
  esac

  # TODO(human): return "review" for paths that can break payments, sign-in or
  # the live API if they ship unchecked; everything else falls through to "fast".

  echo fast
}

git status --porcelain=v1 -uall | while IFS= read -r line; do
  path="${line:3}"
  path="${path#\"}"; path="${path%\"}"        # git quotes names with spaces
  path="${path##* -> }"                        # renames: keep the new name
  printf '%s\t%s\t%s\n' "$(app_of "$path")" "$(risk_of "$path")" "$path"
done
