---
description: Review, commit, and push all current files to the explore-vieques GitHub repo, then log the session to the vault
---

Commit the current working files and push them to the `explore-vieques` GitHub repository (https://github.com/explorevieques1/explore-vieques). Vercel is wired to auto-deploy frontend/landing on push to `main` via its GitHub integration — no separate deploy step needed here.

Steps:

1. Run `git status` and `git diff --stat` to see what will be committed. Show the user a brief summary.
2. If there are non-trivial code changes (not just docs/config), dispatch the `vieques-diff-reviewer` agent on the pending diff before committing. If it reports `DO NOT SHIP`, stop and show the findings to the user instead of proceeding. If it reports `SHIP WITH NITS`, show the nits, then proceed unless the user says to fix first.
3. Ensure a remote named `explore-vieques` exists pointing at `https://github.com/explorevieques1/explore-vieques.git`. If it doesn't, add it:
   `git remote add explore-vieques https://github.com/explorevieques1/explore-vieques.git`
4. Stage all changes: `git add -A`
5. Commit with a concise, descriptive message summarizing the actual changes (not a generic message), ending with the attribution lines given in the conversation's system-reminder, when one is present.
6. Push the current branch to the `explore-vieques` remote:
   `git push explore-vieques HEAD`
   - If the branch has no upstream on that remote, use `git push -u explore-vieques HEAD`.
7. Report the result: the commit hash, the branch, and confirm the push succeeded (or surface any error, e.g. auth failure or rejected push).
8. Run the `vault-log` skill to record this session in the knowledge vault (`/Users/giancarlo/Desktop/Exlpore VIeques`), using the review findings and commit info as the session summary.

If `$ARGUMENTS` is provided, use it as the commit message instead of generating one.

Do not force-push. If the push is rejected because the remote is ahead, stop and tell the user rather than overwriting.
