/**
 * Central IPC channel registry — single source of truth for all IPC.
 */
export interface IpcChannels {
  // ── App ──────────────────────────────────────────────────────────────────

  'app:get-version': { request: void; response: string }
  'app:get-system-info': {
    request: void
    response: { platform: NodeJS.Platform; arch: string; nodeVersion: string; electronVersion: string }
  }
  'greeting:say-hello': {
    request: { name: string }
    response: { message: string; timestamp: number }
  }

  // ── Shell ────────────────────────────────────────────────────────────────

  'shell:open-path': { request: { path: string }; response: void }

  // ── Window controls ──────────────────────────────────────────────────────

  'window:minimize':        { request: void; response: void }
  'window:maximize-toggle': { request: void; response: { isMaximized: boolean } }
  'window:close':           { request: void; response: void }
  'window:is-maximized':    { request: void; response: boolean }

  // ── Config store ─────────────────────────────────────────────────────────

  'config:get':         { request: void;               response: AppConfig }
  'config:set':         { request: Partial<AppConfig>; response: AppConfig }
  'config:pick-folder': { request: void;               response: string | null }

  // ── Paper API ────────────────────────────────────────────────────────────

  'paper:get-versions':     { request: void;                response: PaperVersion[] }
  'paper:get-latest-build': { request: { version: string }; response: PaperBuild }

  // ── Server management ────────────────────────────────────────────────────

  'server:list':      { request: void;             response: ServerInfo[] }
  'server:read-log':  { request: { name: string }; response: string | null }
  'server:next-port': { request: void;             response: number }
  'server:get':       { request: { name: string }; response: ServerInfo | null }
  'server:create':    { request: ServerCreateRequest; response: ServerInfo }
  'server:start':   { request: { name: string }; response: void }
  'server:stop':    { request: { name: string }; response: void }
  'server:restart': { request: { name: string }; response: void }
  'server:status':  { request: { name: string }; response: ServerStatus }
  'server:delete':  { request: { name: string }; response: void }

  // ── RCON ─────────────────────────────────────────────────────────────────

  'rcon:connect':      { request: { serverName: string };                  response: void }
  'rcon:disconnect':   { request: { serverName: string };                  response: void }
  'rcon:send':         { request: { serverName: string; command: string }; response: string }
  'rcon:is-connected': { request: { serverName: string };                  response: boolean }

  // ── Plugins ───────────────────────────────────────────────────────────────

  'plugin:list':          { request: { serverName: string };                                                      response: PluginEntry[] }
  'plugin:toggle':        { request: { serverName: string; pluginName: string; enable: boolean };                 response: void }
  'plugin:list-dev':      { request: { serverName: string };                                                      response: DevPlugin[] }
  'plugin:add-dev':       { request: { serverName: string; sourcePath: string; action: 'reload' | 'restart' };   response: DevPlugin }
  'plugin:remove-dev':    { request: { serverName: string; pluginName: string };                                  response: void }
  'plugin:update-action': { request: { serverName: string; pluginName: string; action: 'reload' | 'restart' };   response: void }
  'plugin:pick-jar':      { request: void;                                                                        response: string | null }
}

// ── Domain types ─────────────────────────────────────────────────────────────

export interface AppConfig {
  serversFolder: string | null
}

export type SupportStatus  = 'SUPPORTED' | 'LEGACY' | 'UNSUPPORTED'
export type ServerStatus   = 'stopped' | 'starting' | 'running' | 'stopping'

export interface PaperVersion {
  key: string
  support: { status: SupportStatus }
  channel: string
  build: number
  size: number
}

export interface PaperBuild {
  number: number
  channel: string
  createdAt: string
  download: { name: string; url: string; size: number; sha256: string }
  javaFlags: string[]
}

export interface PluginEntry {
  name:     string   // base JAR filename (without .disabled)
  disabled: boolean
}

export interface DevPlugin {
  pluginName: string   // JAR filename e.g. "MyPlugin-1.0.jar"
  sourcePath: string   // Absolute path to source JAR
  action: 'reload' | 'restart'
}

export interface ServerInfo {
  name: string
  path: string
  version: string
  build: number
  createdAt: string
  port: number
  rconPort: number
  rconPassword: string
  ram: number         // MB  (used as both -Xms and -Xmx)
  jarName: string     // e.g. "paper-1.21.1-123.jar"
  javaFlags: string[] // recommended JVM flags from Paper API
  devPlugins?: DevPlugin[]
}

export interface ServerCreateRequest {
  name: string
  version: string
  build: PaperBuild
  acceptEula: boolean
  port: number
  rconPort: number
  rconPassword: string
  ram: number
}

// ── Push events (main → renderer) ────────────────────────────────────────────

export interface PushEvents {
  'window:maximized':          boolean
  'server:download-progress':  { name: string; percent: number }
  'rcon:disconnected':         { serverName: string }
  'server:status-change':      { name: string; status: ServerStatus }
  'server:output':             { name: string; line: string; source: 'stdout' | 'stderr' }
  'app:shutting-down':         { servers: string[] }
  'plugin:changed':            { serverName: string; pluginName: string; action: 'reload' | 'restart' }
}

export type PushEvent = keyof PushEvents

// ── Utility types ─────────────────────────────────────────────────────────────

export type IpcChannel = keyof IpcChannels
export type IpcRequest<C extends IpcChannel>  = IpcChannels[C]['request']
export type IpcResponse<C extends IpcChannel> = IpcChannels[C]['response']

export type InvokeArgs<C extends IpcChannel> = IpcRequest<C> extends void
  ? [channel: C]
  : [channel: C, request: IpcRequest<C>]
