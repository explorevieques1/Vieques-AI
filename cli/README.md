# vqctl — Explore Vieques Control Panel

A zero-dependency, BIOS-style terminal cockpit for running the Vieques AI stack.
Arrow-key menus, live status, log streaming — no npm install required.

## Run

```bash
./cli/vqctl
# or
node cli/vqctl.js
```

Tip: add it to your PATH for a global `vqctl` command:

```bash
ln -s "$PWD/cli/vqctl" ~/.local/bin/vqctl
```

## Controls

**Main screen**

| Key | Action |
| --- | --- |
| ↑ / ↓ (or j/k) | Move selection |
| ⏎ / Space | Activate item |
| A | Start all services |
| H | Halt all services |
| R | Reboot (restart all) |
| L | Open the log viewer |
| O | Open a service in the browser |
| Q / Ctrl-C | Power off (stops running services, then quits) |

**Log viewer**

| Key | Action |
| --- | --- |
| Tab / ← → | Switch service tab |
| ↑ / ↓ | Scroll up / down |
| PgUp / PgDn | Scroll by 10 |
| G | Jump to bottom (tail) |
| Esc / Q | Back to main |

## Services

| Service | Command | Port |
| --- | --- | --- |
| Backend API | `npm run dev` (backend/) | 3001 |
| Frontend App | `npm run dev` (frontend/) | 5173 |
| Landing Page | `npm run dev` (landing/) | 5174 |

Status badges probe each TCP port every 2s:

- `● ONLINE` — started by vqctl, port answering
- `◐ BOOTING` — process up, port not ready yet
- `◆ EXTERNAL` — port is live but the process wasn't started by vqctl (e.g. a
  dev server you launched in another terminal). The status strip shows its PID.
  The menu item becomes **Claim** — selecting it (or **Start All**) asks for
  confirmation, then SIGTERMs the owning process (SIGKILL after 4s) and starts
  the service under vqctl. **Halt All** offers to kill external processes too.
  PIDs are resolved with `ss` (falling back to `lsof`).
- `○ OFFLINE` — nothing listening
- `✖ ERROR` — the process exited non-zero (check the logs)

Logs are written to `cli/logs/<service>-<timestamp>.log` (git-ignored) and
mirrored in the in-app viewer.

To change ports/commands, edit the `SERVICES` map at the top of `vqctl.js`.
