import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannel, IpcResponse, InvokeArgs, PushEvent, PushEvents } from '../shared/ipc-types'

const api = {
  invoke<C extends IpcChannel>(...[channel, request]: InvokeArgs<C>): Promise<IpcResponse<C>> {
    return ipcRenderer.invoke(channel, request) as Promise<IpcResponse<C>>
  },

  /** Subscribe to a push event from the main process. Returns an unsubscribe fn. */
  on<E extends PushEvent>(channel: E, listener: (payload: PushEvents[E]) => void): () => void {
    const wrapped = (_: Electron.IpcRendererEvent, payload: PushEvents[E]): void =>
      listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.off(channel, wrapped)
  }
}

export type Api = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
