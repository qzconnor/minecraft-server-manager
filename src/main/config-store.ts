import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import type { AppConfig } from '../shared/ipc-types'

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json')

const DEFAULTS: AppConfig = {
  serversFolder: null
}

export function readConfig(): AppConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function writeConfig(patch: Partial<AppConfig>): AppConfig {
  const current = readConfig()
  const next = { ...current, ...patch }
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true })
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf-8')
  return next
}
