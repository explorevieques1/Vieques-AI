---
description: Fast path — commit the finished change, push to main, and confirm Vercel + Railway are live (no vault log)
---

Dispatch the `deployer` agent now. Don't ask the owner anything first.

Give it:
- what changed this session, in one line, and the exact files you edited for it
  (from your own Edit/Write calls, not `git status`, since other sessions share this tree)
- the commit attribution lines from the system-reminder
- `$ARGUMENTS` as the commit message, if one was provided

If it returns `NEEDS REVIEW`, run `vieques-diff-reviewer` on those files. On
`SHIP` / `SHIP WITH NITS`, re-dispatch `deployer` with `reviewed: ok`; on
`DO NOT SHIP`, show the findings and stop.

Relay its report as-is. For the full end-of-session flow (review + push + vault log), use `/ship`.
