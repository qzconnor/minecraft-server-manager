import { spawn } from 'child_process'
import type { ChildProcess } from 'child_process'
import readline from 'readline'
import type { BrowserWindow } from 'electron'
import type { ServerInfo, ServerStatus } from '../shared/ipc-types'

interface ManagedServer {
  proc:        ChildProcess
  status:      ServerStatus
  win:         BrowserWindow | null
  restartInfo: ServerInfo | null   // set when restart was requested
  killTimer?:  NodeJS.Timeout
}

const servers = new Map<string, ManagedServer>()

// ── Helpers ───────────────────────────────────────────────────────────────────

function push(entry: ManagedServer, name: string): void {
  entry.win?.webContents.send('server:status-change', { name, status: entry.status })
}

function pushLine(win: BrowserWindow | null, name: string, line: string, source: 'stdout' | 'stderr'): void {
  win?.webContents.send('server:output', { name, line, source })
}

// ── Public API ────────────────────────────────────────────────────────────────

export function startServer(name: string, info: ServerInfo, win: BrowserWindow | null): void {
  if (servers.has(name)) throw new Error(`Server "${name}" is already running.`)

  const args = [
    `-Xms${info.ram}M`,
    `-Xmx${info.ram}M`,
    ...info.javaFlags,
    '-jar', info.jarName,
    '--nogui'
  ]

  pushLine(win, name, `[MSM] Starting: java ${args.join(' ')}`, 'stdout')

  const proc = spawn('java', args, { cwd: info.path, stdio: ['pipe', 'pipe', 'pipe'] })

  const entry: ManagedServer = { proc, status: 'starting', win, restartInfo: null }
  servers.set(name, entry)
  push(entry, name)

  // stdout — line by line
  readline.createInterface({ input: proc.stdout! }).on('line', (line) => {
    pushLine(win, name, line, 'stdout')
    // Detect "Done" in startup log → server is fully started
    if (entry.status === 'starting' && /\[.*\]: Done/.test(line)) {
      entry.status = 'running'
      push(entry, name)
    }
  })

  // stderr — line by line
  readline.createInterface({ input: proc.stderr! }).on('line', (line) => {
    pushLine(win, name, line, 'stderr')
  })

  proc.on('error', (err) => {
    pushLine(win, name, `[MSM] Failed to start: ${err.message}`, 'stderr')
    servers.delete(name)
    win?.webContents.send('server:status-change', { name, status: 'stopped' })
  })

  proc.on('exit', (code) => {
    clearTimeout(entry.killTimer)
    const { restartInfo, win: w } = entry
    servers.delete(name)
    pushLine(w, name, `[MSM] Process exited (code ${code ?? '?'})`, 'stdout')
    w?.webContents.send('server:status-change', { name, status: 'stopped' })

    if (restartInfo) {
      pushLine(w, name, '[MSM] Restarting…', 'stdout')
      // Small delay to let OS release ports
      setTimeout(() => startServer(name, restartInfo, w), 1500)
    }
  })
}

export function stopServer(name: string): void {
  const entry = servers.get(name)
  if (!entry) throw new Error(`Server "${name}" is not running.`)

  entry.status      = 'stopping'
  entry.restartInfo = null
  push(entry, name)

  _sendStop(entry, name)
}

export function restartServer(name: string, info: ServerInfo): void {
  const entry = servers.get(name)
  if (!entry) throw new Error(`Server "${name}" is not running.`)

  entry.status      = 'stopping'
  entry.restartInfo = info
  push(entry, name)

  _sendStop(entry, name)
}

export function getServerStatus(name: string): ServerStatus {
  return servers.get(name)?.status ?? 'stopped'
}

export function getRunningServers(): string[] {
  return [...servers.keys()]
}

/** Stop all running servers and resolve when every process has exited. */
export function stopAllServers(): Promise<void> {
  const running = getRunningServers()
  if (running.length === 0) return Promise.resolve()

  for (const name of running) {
    try { _sendStop(servers.get(name)!, name) } catch { /* already exiting */ }
  }

  return new Promise((resolve) => {
    const check = (): void => {
      if (getRunningServers().length === 0) { resolve(); return }
      setTimeout(check, 300)
    }
    setTimeout(check, 300)
  })
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _sendStop(entry: ManagedServer, name: string): void {
  pushLine(entry.win, name, '[MSM] Sending stop command…', 'stdout')
  try { entry.proc.stdin?.write('stop\n') } catch { /* stdin closed */ }

  // Force-kill after 30 s if the process hasn't exited
  entry.killTimer = setTimeout(() => {
    pushLine(entry.win, name, '[MSM] Force-killing process (timeout)', 'stderr')
    entry.proc.kill('SIGTERM')
  }, 30_000)
}
