import { ref } from 'vue'
import type { IpcChannel, IpcRequest, IpcResponse, InvokeArgs } from '../../../shared/ipc-types'

/**
 * Composable that wraps `window.api.invoke` with reactive loading/error state.
 *
 * @example
 * const { data, loading, error, execute } = useIpc('greeting:say-hello')
 * await execute({ name: 'Ada' })
 * console.log(data.value?.message)
 */
export function useIpc<C extends IpcChannel>(channel: C) {
  const data = ref<IpcResponse<C> | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function execute(
    ...args: IpcRequest<C> extends void ? [] : [IpcRequest<C>]
  ): Promise<IpcResponse<C> | null> {
    loading.value = true
    error.value = null
    try {
      const result = await (window.api.invoke as (...a: InvokeArgs<C>) => Promise<IpcResponse<C>>)(
        ...[channel, ...args] as InvokeArgs<C>
      )
      data.value = result
      return result
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      return null
    } finally {
      loading.value = false
    }
  }

  return { data, loading, error, execute }
}
