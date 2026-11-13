---
name: vault-log
description: Write a session's work into the Explore Vieques knowledge vault (an Obsidian vault at "/Users/giancarlo/Desktop/Exlpore VIeques", separate git repo from this code repo). Use after shipping code changes, after a /ship, or whenever the user asks to "log this in the vault", "update the vault", "write version notes", or similar — not for editing this project's own code or docs.
---

# vault-log

Record what happened this session as a dated entry in the vault, so the vault stays
the single source of "what we did and when" across sessions. The vault lives at:

```
/Users/giancarlo/Desktop/Exlpore VIeques
```

It is its own git repo (remote: `explore-vieques-vault` on GitHub), independent of
this code repo. Read `"How this vault works.md"` in the vault root once per session
before writing, in case conventions changed.

## When to run this
- Right after `/ship` pushes code — chain this in automatically unless the user says
  not to.
- Whenever the user explicitly asks to log/record/update the vault or "write version
  notes" for a change.
- Don't run it for trivial no-op sessions (pure research, answering a question) unless
  something was actually built, fixed, or decided.

## Steps

1. **Read current state.**
   - `cat "/Users/giancarlo/Desktop/Exlpore VIeques/03 - Updates Log/_Update Log.md"` to
     see the last entry and its date/format.
   - `cat "/Users/giancarlo/Desktop/Exlpore VIeques/Templates/Update entry.md"` for the
     exact template to follow.
   - Check vault git status (`git -C "/Users/giancarlo/Desktop/Exlpore VIeques" status`)
     — if there are already uncommitted changes from a prior session, commit or at
     least note them before adding yours, don't silently bundle unrelated work.

2. **Summarize this session** from what actually happened in the conversation (commits
   made, bugs fixed, features shipped, decisions made, things discovered) — not a
   restatement of every tool call. Pull the real commit hashes/messages with
   `git log` in the code repo if useful context.

3. **Create the dated entry.** Copy the template's shape into a new file:
   ```
   03 - Updates Log/YYYY-MM-DD — <short title>.md
   ```
   using today's actual date. Fill in:
   - `Context` — why this session happened (one or two sentences).
   - `What was done` — concrete, specific bullets (what changed, which files/areas,
     what shipped).
   - `Key findings` — anything surprising or non-obvious uncovered along the way.
     Omit the section if there's nothing there.
   - `Still open / handed to TODOs` — link to `[[_TODO Board]]` for anything left
     unresolved.
   - `Created / changed` — the actual files/repos touched, including new agents or
     skills added to the code repo.

   If an entry for today's date already exists (e.g. a second session same day), add
   to the existing file's bullets instead of creating a second file for the same date.

4. **Update the index.** Add a new row at the top of the table in
   `03 - Updates Log/_Update Log.md` (reverse-chronological, newest first):
   `| YYYY-MM-DD | [[entry title]] | one-line headline |`

5. **Commit in the vault repo** (separate from the code repo — don't mix commits
   across the two):
   ```
   cd "/Users/giancarlo/Desktop/Exlpore VIeques"
   git add -A
   git commit -m "<short summary of the session>"
   ```
   Ask before pushing (`git push`) unless the user has said to push vault commits
   automatically — the vault push is a separate, lower-stakes action than shipping
   code, but still confirm once per session.

6. **Report back** with the entry's path and a one-line summary — don't dump the
   full file contents into chat, the vault note is the artifact.

## Boundaries
- Never edit files in this code repo as part of this skill — it only writes into the
  vault.
- Don't rewrite `Home.md`'s "30-second status" table or other index pages unless the
  user explicitly asks for a status refresh — this skill only adds an update entry
  and updates `_Update Log.md`.
- Don't fabricate findings, numbers, or revenue figures — if something needs a real
  number (e.g. from Supabase/Stripe) and you don't have it this session, write
  "needs checking" rather than guessing.
