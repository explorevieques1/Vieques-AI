#!/usr/bin/env node
/*
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  VQCTL — Explore Vieques Control Panel                           ║
 * ║  A BIOS-style terminal cockpit for the Vieques AI stack.         ║
 * ║  Zero dependencies. Arrow keys to move, Enter to select.         ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

'use strict'

const { spawn } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')
const net = require('node:net')

// ─── Paths ──────────────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..')
const LOG_DIR = path.join(__dirname, 'logs')
try { fs.mkdirSync(LOG_DIR, { recursive: true }) } catch {}

// ─── ANSI helpers ───────────────────────────────────────────────────
const ESC = '\x1b['
const C = {
  reset: ESC + '0m',
  bold: ESC + '1m',
  dim: ESC + '2m',
  inv: ESC + '7m',
  // 256-color palette tuned for a "BIOS" look
  cyan: ESC + '38;5;51m',
  amber: ESC + '38;5;214m',
  green: ESC + '38;5;46m',
  red: ESC + '38;5;196m',
  grey: ESC + '38;5;244m',
  white: ESC + '38;5;231m',
  blue: ESC + '38;5;39m',
  magenta: ESC + '38;5;207m',
  bgBlue: ESC + '48;5;24m',
  bgCyan: ESC + '48;5;30m',
}
const paint = (s, ...codes) => codes.join('') + s + C.reset
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '')

// ─── Terminal control ───────────────────────────────────────────────
const out = (s) => process.stdout.write(s)
const clear = () => out(ESC + '2J' + ESC + '3J' + ESC + 'H')
const hideCursor = () => out(ESC + '?25l')
const showCursor = () => out(ESC + '?25h')
const moveTo = (r, c) => out(ESC + r + ';' + c + 'H')
const cols = () => process.stdout.columns || 80

// ─── Service definitions ────────────────────────────────────────────
const SERVICES = {
  backend: {
    key: 'backend',
    label: 'BACKEND API',
    cwd: path.join(ROOT, 'backend'),
    cmd: 'npm',
    args: ['run', 'dev'],
    port: 3001,
    url: 'http://localhost:3001',
  },
  frontend: {
    key: 'frontend',
    label: 'FRONTEND APP',
    cwd: path.join(ROOT, 'frontend'),
    cmd: 'npm',
    args: ['run', 'dev'],
    port: 5173,
    url: 'http://localhost:5173',
  },
  landing: {
    key: 'landing',
    label: 'LANDING PAGE',
    cwd: path.join(ROOT, 'landing'),
    cmd: 'npm',
    args: ['run', 'dev'],
    port: 5174,
    url: 'http://localhost:5174',
  },
}

// Runtime state per service: { proc, status, logFile, logStream, lines[], startedAt }
const state = {}
for (const k of Object.keys(SERVICES)) {
  state[k] = { proc: null, status: 'stopped', logFile: null, logStream: null, lines: [], startedAt: null }
}

const RING = 400 // max log lines kept in memory per service

// ─── Process management ─────────────────────────────────────────────
function pushLine(k, text) {
  const st = state[k]
  for (const raw of String(text).split(/\r?\n/)) {
    if (raw === '') continue
    st.lines.push(raw)
  }
  if (st.lines.length > RING) st.lines.splice(0, st.lines.length - RING)
}

function startService(k) {
  const svc = SERVICES[k]
  const st = state[k]
  if (st.proc) return // already running

  // Refuse to spawn a process that is guaranteed to die on "port in use".
  // Something outside vqctl already owns this port — report it instead.
  if (portHealth[k]) {
    setToast(`${svc.label}: port ${svc.port} already in use by another process — not started.`, 4000)
    return
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  st.logFile = path.join(LOG_DIR, `${k}-${stamp}.log`)
  st.logStream = fs.createWriteStream(st.logFile, { flags: 'a' })
  st.lines = []
  st.status = 'starting'
  st.startedAt = Date.now()

  const proc = spawn(svc.cmd, svc.args, {
    cwd: svc.cwd,
    env: { ...process.env, FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  st.proc = proc

  const onData = (buf) => {
    const s = buf.toString()
    st.logStream && st.logStream.write(s)
    pushLine(k, s)
    if (st.status === 'starting') st.status = 'running'
    if (screen === 'logs' && logView === k) renderLogs()
  }
  proc.stdout.on('data', onData)
  proc.stderr.on('data', onData)

  proc.on('error', (err) => {
    pushLine(k, `[vqctl] spawn error: ${err.message}`)
    st.status = 'error'
    st.proc = null
    render()
  })
  proc.on('exit', (code, sig) => {
    pushLine(k, `[vqctl] exited (code=${code} signal=${sig || '-'})`)
    st.status = code && code !== 0 && !st.stopping ? 'error' : 'stopped'
    st.stopping = false
    st.proc = null
    st.startedAt = null
    // Clear the cached probe so the badge doesn't flash "EXTERNAL" in the gap
    // between our process exiting and the next port sweep.
    portHealth[k] = false
    if (st.logStream) { st.logStream.end(); st.logStream = null }
    render()
  })

  render()
}

function stopService(k) {
  const st = state[k]
  if (!st.proc) return
  st.stopping = true
  st.status = 'stopping'
  try { st.proc.kill('SIGTERM') } catch {}
  const proc = st.proc
  setTimeout(() => { if (proc && !proc.killed) { try { proc.kill('SIGKILL') } catch {} } }, 4000)
  render()
}

function toggleService(k) {
  if (state[k].proc) stopService(k)
  else if (isExternal(k)) claimService(k)   // port held by a foreign process
  else startService(k)
}

// Batch helpers. Anything vqctl owns is handled immediately; foreign-held
// ports are gathered into a single confirm so one keypress can't kill three
// processes the user didn't realise were someone else's.
function externalKeys() { return Object.keys(SERVICES).filter(isExternal) }

function describeExternals(keys) {
  return keys.map((k) => {
    const o = portOwner[k]
    return `  ${SERVICES[k].label.padEnd(14)} :${SERVICES[k].port}  ` +
      (o ? `pid ${String(o.pid).padEnd(7)} ${o.cmd.slice(0, 34)}` : 'pid unknown')
  })
}

function startAll() {
  for (const k of Object.keys(SERVICES)) {
    if (!state[k].proc && !isExternal(k)) startService(k)
  }
  const ext = externalKeys()
  if (!ext.length) { setToast('Booting all services…'); return }
  askConfirm('RECLAIM PORTS', [
    'These ports are held by processes vqctl did not start:',
    '',
    ...describeExternals(ext),
    '',
    'Terminate them and start all services under vqctl?',
  ], () => {
    let pending = ext.length
    for (const k of ext) killExternal(k, () => { startService(k); pending-- })
  })
}

function stopAll() {
  let stopped = 0
  for (const k of Object.keys(SERVICES)) if (state[k].proc) { stopService(k); stopped++ }
  const ext = externalKeys()
  if (!ext.length) {
    setToast(stopped ? 'Shutting down all services…' : 'Nothing running under vqctl.')
    return
  }
  askConfirm('HALT EXTERNAL PROCESSES', [
    'These ports are held by processes vqctl did not start:',
    '',
    ...describeExternals(ext),
    '',
    'Send SIGTERM (then SIGKILL after 4s) to each?',
  ], () => { for (const k of ext) killExternal(k) })
}

function restartService(k) {
  if (state[k].proc) {
    const st = state[k]
    st.stopping = true
    st.status = 'stopping'
    try { st.proc.once('exit', () => setTimeout(() => startService(k), 250)) } catch {}
    try { st.proc.kill('SIGTERM') } catch {}
  } else {
    startService(k)
  }
  render()
}

function openUrl(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).unref() } catch {}
}

// Check if a TCP port is accepting connections (health probe)
const portHealth = {} // k -> bool
function probePorts() {
  for (const k of Object.keys(SERVICES)) {
    const { port } = SERVICES[k]
    const sock = net.connect({ host: '127.0.0.1', port, timeout: 400 })
    sock.on('connect', () => { portHealth[k] = true; sock.destroy() })
    sock.on('error', () => { portHealth[k] = false })
    sock.on('timeout', () => { portHealth[k] = false; sock.destroy() })
  }
}

// ─── External process discovery ─────────────────────────────────────
//  A port can be held by a dev server we didn't spawn. To make those
//  actionable (rather than just reporting EXTERNAL) we resolve the owning
//  PID via `ss`, falling back to `lsof`, and read the real command from
//  /proc so the confirm dialog can show what it is about to kill.
const portOwner = {} // k -> { pid, cmd }

function cmdlineFor(pid) {
  try {
    const raw = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8')
    const parts = raw.split('\0').filter(Boolean)
    if (parts.length) return parts.join(' ')
  } catch {}
  try { return fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim() } catch {}
  return 'unknown'
}

function discoverPortOwners() {
  const wanted = new Map()
  for (const k of Object.keys(SERVICES)) wanted.set(SERVICES[k].port, k)

  const parse = (text) => {
    const found = {}
    for (const line of text.split('\n')) {
      // ss: "LISTEN 0 511 *:5174 *:* users:(("name",pid=13537,fd=25))"
      const portMatch = line.match(/[:\][]\s*(\d+)\s/) || line.match(/:(\d+)\s/)
      const pidMatch = line.match(/pid=(\d+)/)
      if (!portMatch || !pidMatch) continue
      const port = Number(portMatch[1])
      if (!wanted.has(port)) continue
      found[wanted.get(port)] = { pid: Number(pidMatch[1]), cmd: cmdlineFor(pidMatch[1]) }
    }
    return found
  }

  const child = spawn('ss', ['-ltnpH'], { stdio: ['ignore', 'pipe', 'ignore'] })
  let buf = ''
  child.stdout.on('data', (d) => { buf += d.toString() })
  child.on('error', () => lsofFallback())
  child.on('close', () => {
    const found = parse(buf)
    for (const k of Object.keys(SERVICES)) portOwner[k] = found[k] || null
    if (!buf.trim()) lsofFallback()
  })

  function lsofFallback() {
    const ports = [...wanted.keys()].join(',')
    const l = spawn('lsof', ['-nP', `-iTCP:${ports}`, '-sTCP:LISTEN'], { stdio: ['ignore', 'pipe', 'ignore'] })
    let lb = ''
    l.stdout.on('data', (d) => { lb += d.toString() })
    l.on('error', () => {})
    l.on('close', () => {
      for (const line of lb.split('\n').slice(1)) {
        const cells = line.trim().split(/\s+/)
        if (cells.length < 9) continue
        const pid = Number(cells[1])
        const pm = cells[8].match(/:(\d+)$/)
        if (!pm || !wanted.has(Number(pm[1]))) continue
        portOwner[wanted.get(Number(pm[1]))] = { pid, cmd: cmdlineFor(pid) }
      }
    })
  }
}

// True when the port is live but the process is not one of ours.
function isExternal(k) { return !state[k].proc && !!portHealth[k] }

// Kill a process we did not spawn: SIGTERM, then SIGKILL if it lingers.
function killExternal(k, then) {
  const owner = portOwner[k]
  if (!owner) { setToast(`${SERVICES[k].label}: could not resolve the PID holding port ${SERVICES[k].port}.`, 4000); return }
  try { process.kill(owner.pid, 'SIGTERM') } catch (e) {
    setToast(`${SERVICES[k].label}: kill failed — ${e.code || e.message}`, 4000)
    return
  }
  setToast(`Sent SIGTERM to pid ${owner.pid} (port ${SERVICES[k].port})…`, 3000)
  let waited = 0
  const tick = setInterval(() => {
    waited += 400
    let alive = true
    try { process.kill(owner.pid, 0) } catch { alive = false }
    if (!alive) {
      clearInterval(tick)
      portHealth[k] = false
      portOwner[k] = null
      render()
      if (then) setTimeout(then, 300)
    } else if (waited >= 4000) {
      clearInterval(tick)
      try { process.kill(owner.pid, 'SIGKILL') } catch {}
      portHealth[k] = false
      portOwner[k] = null
      render()
      if (then) setTimeout(then, 500)
    }
  }, 400)
}

// ─── UI state ───────────────────────────────────────────────────────
let screen = 'main'   // 'main' | 'logs' | 'confirm'
let confirmBox = null // { title, lines[], onYes }
let cursor = 0
let logView = 'backend'
let logScroll = 0     // 0 = follow tail
let toast = ''
let toastUntil = 0

function setToast(msg, ms = 2500) { toast = msg; toastUntil = Date.now() + ms; render() }

function askConfirm(title, lines, onYes) {
  confirmBox = { title, lines, onYes }
  screen = 'confirm'
  render()
}

// Take over a port held by a foreign process: confirm, kill, then start ours.
function claimService(k) {
  const svc = SERVICES[k]
  const owner = portOwner[k]
  askConfirm(
    `RECLAIM PORT ${svc.port}`,
    [
      `${svc.label} is held by a process vqctl did not start.`,
      '',
      owner ? `  pid ${owner.pid}` : '  pid unknown (ss/lsof gave no owner)',
      owner ? `  ${owner.cmd.slice(0, 60)}` : '',
      '',
      'Terminate it and start this service under vqctl?',
    ].filter((l) => l !== null),
    () => killExternal(k, () => startService(k)),
  )
}

// Free a foreign-held port without starting anything in its place.
function freeService(k) {
  const svc = SERVICES[k]
  const owner = portOwner[k]
  askConfirm(
    `HALT EXTERNAL PROCESS`,
    [
      `${svc.label} — port ${svc.port} is held by a foreign process.`,
      '',
      owner ? `  pid ${owner.pid}` : '  pid unknown (ss/lsof gave no owner)',
      owner ? `  ${owner.cmd.slice(0, 60)}` : '',
      '',
      'Send SIGTERM (then SIGKILL after 4s)?',
    ],
    () => killExternal(k),
  )
}

// Menu items are computed dynamically so labels reflect live state.
function mainMenu() {
  const items = []
  for (const k of Object.keys(SERVICES)) {
    const running = !!state[k].proc
    const ext = isExternal(k)
    items.push({
      type: 'svc', key: k,
      label: ext
        ? `Claim  ${SERVICES[k].label}  (external)`
        : `${running ? 'Stop ' : 'Start'}  ${SERVICES[k].label}`,
      action: () => toggleService(k),
    })
  }
  items.push({ type: 'sep' })
  items.push({ type: 'act', label: 'START ALL SYSTEMS', action: () => startAll() })
  items.push({ type: 'act', label: 'HALT  ALL SYSTEMS', action: () => stopAll() })
  items.push({ type: 'sep' })
  items.push({ type: 'act', label: 'VIEW LOGS  ▸', action: () => { screen = 'logs'; logScroll = 0; render() } })
  items.push({ type: 'act', label: 'OPEN IN BROWSER  ▸', action: () => openMenu() })
  items.push({ type: 'sep' })
  items.push({ type: 'act', label: 'REBOOT (restart all)', action: () => { for (const k of Object.keys(SERVICES)) restartService(k); setToast('Rebooting stack…') } })
  items.push({ type: 'act', label: 'POWER OFF (quit)', action: () => quit() })
  return items
}

// Sub-flow: pick a URL to open
let openMode = false
function openMenu() {
  openMode = true
  cursor = 0
  render()
}

// ─── Rendering ──────────────────────────────────────────────────────
const BANNER = [
  ' ▓█████ ▒██   ██▒ ██▓███   ██▓     ▒█████   ██▀███  ▓█████ ',
  ' ▓█   ▀ ▒▒ █ █ ▒░▓██░  ██▒▓██▒    ▒██▒  ██▒▓██ ▒ ██▒▓█   ▀ ',
  ' ▒███   ░░  █   ░▓██░ ██▓▒▒██░    ▒██░  ██▒▓██ ░▄█ ▒▒███   ',
  ' ▒▓█  ▄  ░ █ █ ▒ ▒██▄█▓▒ ▒▒██░    ▒██   ██░▒██▀▀█▄  ▒▓█  ▄ ',
  ' ░▒████▒▒██▒ ▒██▒▒██▒ ░  ░░██████▒░ ████▓▒░░██▓ ▒██▒░▒████▒',
  ' ░░ ▒░ ░▒▒ ░ ░▓ ░▒▓▒░ ░  ░░ ▒░▓  ░░ ▒░▒░▒░ ░ ▒▓ ░▒▓░░░ ▒░ ░',
]
const SUBTITLE = 'V I E Q U E S     A I     ·     C O N T R O L     P A N E L'

function statusBadge(k) {
  const st = state[k]
  const healthy = portHealth[k]
  let txt, col
  if (st.status === 'running' || st.status === 'starting') {
    if (healthy) { txt = '● ONLINE '; col = C.green }
    else { txt = '◐ BOOTING'; col = C.amber }
  } else if (st.status === 'stopping') { txt = '◌ STOPPING'; col = C.amber }
  // Port is live but the process isn't ours — a dev server started outside vqctl.
  else if (healthy) { txt = '◆ EXTERNAL'; col = C.magenta }
  else if (st.status === 'error') { txt = '✖ ERROR  '; col = C.red }
  else { txt = '○ OFFLINE'; col = C.grey }
  return paint(txt, C.bold, col)
}

function uptime(k) {
  const st = state[k]
  if (!st.startedAt) return '  --:--'
  const s = Math.floor((Date.now() - st.startedAt) / 1000)
  const m = Math.floor(s / 60)
  return `${String(m).padStart(3, ' ')}:${String(s % 60).padStart(2, '0')}`
}

function hr(ch, w) { return ch.repeat(w) }

function frameLine(inner, w, lc = '║', rc = '║') {
  const pad = w - 2 - strip(inner).length
  return paint(lc, C.cyan) + inner + ' '.repeat(Math.max(0, pad)) + paint(rc, C.cyan)
}

function renderConfirm() {
  clear()
  const w = Math.min(cols(), 78)
  const lines = []
  lines.push('')
  lines.push(paint('╔' + hr('═', w - 2) + '╗', C.red))
  lines.push(paint('║', C.red) +
    paint(centerText('⚠  ' + confirmBox.title + '  ⚠', w - 2), C.red, C.bold) +
    paint('║', C.red))
  lines.push(paint('╠' + hr('═', w - 2) + '╣', C.red))
  for (const l of confirmBox.lines) {
    const text = ' ' + l
    const pad = w - 2 - strip(text).length
    lines.push(paint('║', C.red) + paint(text, C.white) + ' '.repeat(Math.max(0, pad)) + paint('║', C.red))
  }
  lines.push(paint('╠' + hr('═', w - 2) + '╣', C.red))
  const prompt = '  [ Y ] confirm     [ N / Esc ] cancel  '
  lines.push(paint('║', C.red) + paint(centerText(prompt, w - 2), C.amber, C.bold) + paint('║', C.red))
  lines.push(paint('╚' + hr('═', w - 2) + '╝', C.red))
  out(lines.join('\n') + '\n')
}

function render() {
  if (screen === 'logs') return renderLogs()
  if (screen === 'confirm' && confirmBox) return renderConfirm()
  clear()
  const w = Math.min(cols(), 78)
  const lines = []

  // Top border
  lines.push(paint('╔' + hr('═', w - 2) + '╗', C.cyan))
  // Banner
  for (const b of BANNER) {
    const centered = centerText(b, w - 2)
    lines.push(frameLine(paint(centered, C.amber, C.bold), w))
  }
  lines.push(frameLine(paint(centerText(SUBTITLE, w - 2), C.cyan), w))
  lines.push(paint('╠' + hr('═', w - 2) + '╣', C.cyan))

  // Status strip
  lines.push(frameLine(paint(' SYSTEM STATUS', C.white, C.bold), w))
  for (const k of Object.keys(SERVICES)) {
    const svc = SERVICES[k]
    // For foreign-held ports the uptime column is meaningless — show the
    // owning PID instead, so the user knows exactly what Claim would kill.
    const owner = portOwner[k]
    const tail = isExternal(k)
      ? (owner ? `pid ${owner.pid}` : 'pid ?')
      : 'up ' + uptime(k)
    const seg = ' ' +
      paint(svc.label.padEnd(14), C.white) + ' ' +
      statusBadge(k) + '  ' +
      paint(svc.url.padEnd(24), C.blue) +
      paint(tail, C.grey)
    lines.push(frameLine(seg, w))
  }
  lines.push(paint('╠' + hr('═', w - 2) + '╣', C.cyan))

  // Menu
  const menu = openMode ? openMenuItems() : mainMenu()
  lines.push(frameLine(paint(openMode ? ' OPEN IN BROWSER — select target' : ' CONTROL MENU', C.white, C.bold), w))
  menu.forEach((item, i) => {
    if (item.type === 'sep') { lines.push(frameLine(paint('   ' + hr('─', w - 8), C.dim, C.grey), w)); return }
    const selected = i === cursor
    let text = item.label
    let inner
    if (selected) {
      inner = paint(' ▸ ' + text.padEnd(w - 5), C.bgBlue, C.white, C.bold)
    } else {
      inner = paint('   ' + text, C.grey)
    }
    lines.push(frameLine(inner, w))
  })

  lines.push(paint('╚' + hr('═', w - 2) + '╝', C.cyan))

  // Footer / hint bar
  const hint = openMode
    ? ' ↑↓ move   ⏎ open   Esc back'
    : ' ↑↓ move   ⏎ select   L logs   O open   R reboot   Q quit'
  lines.push(paint(hint, C.dim, C.grey))
  if (toast && Date.now() < toastUntil) {
    lines.push(paint(' » ' + toast, C.amber, C.bold))
  }

  out(lines.join('\n') + '\n')
  positionCursorOffscreen()
}

function centerText(s, w) {
  const len = strip(s).length
  if (len >= w) return s.slice(0, w)
  const left = Math.floor((w - len) / 2)
  return ' '.repeat(left) + s + ' '.repeat(w - len - left)
}

function positionCursorOffscreen() { /* cursor hidden; noop */ }

// Open-in-browser submenu items
function openMenuItems() {
  const items = Object.keys(SERVICES).map((k) => ({
    type: 'act',
    label: `${SERVICES[k].label}  →  ${SERVICES[k].url}`,
    action: () => { openUrl(SERVICES[k].url); setToast('Opening ' + SERVICES[k].url); openMode = false },
  }))
  items.push({ type: 'sep' })
  items.push({ type: 'act', label: '◂ Back', action: () => { openMode = false; cursor = 0; render() } })
  return items
}

// ─── Logs screen ────────────────────────────────────────────────────
function renderLogs() {
  clear()
  const w = Math.min(cols(), 100)
  const rows = (process.stdout.rows || 30)
  const bodyRows = rows - 6
  const lines = []

  const tabs = Object.keys(SERVICES).map((k) => {
    const active = k === logView
    const dot = portHealth[k] ? paint('●', C.green) : (state[k].proc ? paint('◐', C.amber) : paint('○', C.grey))
    const label = ` ${dot} ${SERVICES[k].label} `
    return active ? paint(label, C.bgCyan, C.white, C.bold) : paint(label, C.grey)
  }).join(paint('│', C.dim, C.grey))

  lines.push(paint('╔' + hr('═', w - 2) + '╗', C.cyan))
  lines.push(frameLine(' ' + tabs, w))
  lines.push(paint('╠' + hr('═', w - 2) + '╣', C.cyan))

  const buf = state[logView].lines
  const maxScroll = Math.max(0, buf.length - bodyRows)
  const scroll = Math.min(logScroll, maxScroll)
  const start = Math.max(0, buf.length - bodyRows - scroll)
  const slice = buf.slice(start, start + bodyRows)
  for (let i = 0; i < bodyRows; i++) {
    const raw = slice[i] !== undefined ? slice[i] : ''
    const clipped = strip(raw).slice(0, w - 4)
    lines.push(frameLine(' ' + paint(clipped, C.white), w))
  }
  lines.push(paint('╚' + hr('═', w - 2) + '╝', C.cyan))
  const follow = scroll === 0 ? paint('TAIL', C.green, C.bold) : paint(`SCROLL -${scroll}`, C.amber)
  lines.push(paint(' [', C.dim, C.grey) + follow + paint(']', C.dim, C.grey) +
    paint('  Tab/←→ switch service   ↑↓ scroll   G bottom   Esc back', C.dim, C.grey))

  out(lines.join('\n') + '\n')
}

// ─── Input handling ─────────────────────────────────────────────────
function selectableIndexes(menu) {
  return menu.map((m, i) => (m.type === 'sep' ? -1 : i)).filter((i) => i >= 0)
}
function moveCursor(dir) {
  const menu = openMode ? openMenuItems() : mainMenu()
  const sel = selectableIndexes(menu)
  let pos = sel.indexOf(cursor)
  if (pos === -1) pos = 0
  pos = (pos + dir + sel.length) % sel.length
  cursor = sel[pos]
  render()
}
function activate() {
  const menu = openMode ? openMenuItems() : mainMenu()
  const item = menu[cursor]
  if (item && item.action) item.action()
  render()
}

function onKey(str, key) {
  if (!key) key = {}
  const name = key.name
  // Global quit
  if (key.ctrl && name === 'c') return quit()

  // Modal: swallow every key except the explicit yes/no answer.
  if (screen === 'confirm') {
    if (name === 'y') {
      const fn = confirmBox && confirmBox.onYes
      confirmBox = null
      screen = 'main'
      if (fn) fn()
      render()
    } else if (name === 'n' || name === 'escape' || name === 'q') {
      confirmBox = null
      screen = 'main'
      setToast('Cancelled — nothing was killed.')
    }
    return
  }

  if (screen === 'logs') {
    const keys = Object.keys(SERVICES)
    if (name === 'escape' || name === 'q') { screen = 'main'; render(); return }
    if (name === 'tab' || name === 'right') { logView = keys[(keys.indexOf(logView) + 1) % keys.length]; logScroll = 0; render(); return }
    if (name === 'left') { logView = keys[(keys.indexOf(logView) - 1 + keys.length) % keys.length]; logScroll = 0; render(); return }
    if (name === 'up') { logScroll += 1; render(); return }
    if (name === 'down') { logScroll = Math.max(0, logScroll - 1); render(); return }
    if (name === 'g') { logScroll = 0; render(); return }
    if (name === 'pageup') { logScroll += 10; render(); return }
    if (name === 'pagedown') { logScroll = Math.max(0, logScroll - 10); render(); return }
    return
  }

  // main screen
  if (name === 'up' || name === 'k') return moveCursor(-1)
  if (name === 'down' || name === 'j') return moveCursor(1)
  if (name === 'return' || name === 'space') return activate()
  if (name === 'escape') { if (openMode) { openMode = false; cursor = 0; render() } return }
  if (openMode) return
  // hotkeys
  if (name === 'q') return quit()
  if (name === 'l') { screen = 'logs'; logScroll = 0; render(); return }
  if (name === 'o') { openMenu(); return }
  if (name === 'r') { for (const k of Object.keys(SERVICES)) restartService(k); setToast('Rebooting stack…'); return }
  if (name === 'a') { startAll(); setToast('Booting all services…'); return }
  if (name === 'h') { stopAll(); setToast('Halting all services…'); return }
}

// ─── Lifecycle ──────────────────────────────────────────────────────
let quitting = false
function quit() {
  if (quitting) return
  quitting = true
  const anyRunning = Object.keys(SERVICES).some((k) => state[k].proc)
  clear()
  showCursor()
  if (anyRunning) {
    out(paint('\n  Shutting down running services…\n', C.amber))
    stopAll()
    setTimeout(finalize, 1200)
  } else {
    finalize()
  }
}
function finalize() {
  // force kill any stragglers
  for (const k of Object.keys(SERVICES)) {
    const st = state[k]
    if (st.proc) { try { st.proc.kill('SIGKILL') } catch {} }
  }
  out(paint('\n  vqctl offline. See you in Vieques. 🌴\n\n', C.cyan, C.bold))
  process.exit(0)
}

function bootstrap() {
  // First selectable item
  cursor = selectableIndexes(mainMenu())[0]
  hideCursor()

  // Raw key input
  const readline = require('node:readline')
  readline.emitKeypressEvents(process.stdin)
  if (process.stdin.isTTY) process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.on('keypress', (str, key) => {
    try { onKey(str, key) } catch (e) { setToast('err: ' + e.message) }
  })

  process.stdout.on('resize', () => render())

  // Periodic refresh: uptime ticks + port health
  probePorts()
  discoverPortOwners()
  setInterval(() => { probePorts(); discoverPortOwners() }, 2000)
  setInterval(() => { if (!quitting) render() }, 1000)

  process.on('SIGINT', quit)
  process.on('SIGTERM', quit)
  process.on('exit', () => showCursor())

  render()
}

bootstrap()
