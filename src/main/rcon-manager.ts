import { Rcon } from 'rcon-client'
import type { BrowserWindow } from 'electron'
import { readConfig } from './config-store'
import { listServers } from './server-manager'

const connections = new Map<string, Rcon>()

function getServerInfo(serverName: string) {
  const { serversFolder } = readConfig()
  if (!serversFolder) throw new Error('No servers folder configured.')
  const server = listServers(serversFolder).find((s) => s.name === serverName)
  if (!server) throw new Error(`Server "${serverName}" not found.`)
  return server
}

export async function rconConnect(serverName: string, win: BrowserWindow | null): Promise<void> {
  // Clean up any stale connection
  await rconDisconnect(serverName)

  const server = getServerInfo(serverName)

  const rcon = new Rcon({
    host: '127.0.0.1',
    port: server.rconPort,
    password: server.rconPassword,
    timeout: 5000
  })

  // Push disconnect event to renderer when connection drops
  rcon.on('end', () => {
    connections.delete(serverName)
    win?.webContents.send('rcon:disconnected', { serverName })
  })

  // Absorb socket errors (e.g. ECONNRESET when server stops) so they don't
  // crash the main process as unhandled exceptions.
  rcon.on('error', () => {
    connections.delete(serverName)
    win?.webContents.send('rcon:disconnected', { serverName })
  })

  await rcon.connect()
  connections.set(serverName, rcon)
}

export async function rconDisconnect(serverName: string): Promise<void> {
  const rcon = connections.get(serverName)
  if (!rcon) return
  connections.delete(serverName)
  try { await rcon.end() } catch { /* already closed */ }
}

export async function rconSend(serverName: string, command: string): Promise<string> {
  const rcon = connections.get(serverName)
  if (!rcon) throw new Error('Not connected to RCON. Is the server running?')
  return rcon.send(command)
}

export function rconIsConnected(serverName: string): boolean {
  return connections.has(serverName)
}
