---
description: Commit all current files and push to the explore-vieques GitHub repo
---

Commit the current working files and push them to the `explore-vieques` GitHub repository (https://github.com/explorevieques1/explore-vieques).

Steps:

1. Run `git status` and `git diff --stat` to see what will be committed. Show the user a brief summary.
2. Ensure a remote named `explore-vieques` exists pointing at `https://github.com/explorevieques1/explore-vieques.git`. If it doesn't, add it:
   `git remote add explore-vieques https://github.com/explorevieques1/explore-vieques.git`
3. Stage all changes: `git add -A`
4. Commit with a concise, descriptive message summarizing the actual changes (not a generic message). End the commit message with:
   ```
   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   ```
5. Push the current branch to the `explore-vieques` remote:
   `git push explore-vieques HEAD`
   - If the branch has no upstream on that remote, use `git push -u explore-vieques HEAD`.
6. Report the result: the commit hash, the branch, and confirm the push succeeded (or surface any error, e.g. auth failure or rejected push).

If `$ARGUMENTS` is provided, use it as the commit message instead of generating one.

Do not force-push. If the push is rejected because the remote is ahead, stop and tell the user rather than overwriting.
