import { getLanguage, t } from '../i18n'
import { readTables, type ImportTable } from './imports'

export type WorkerReply<O> = { ok: true; result: O } | { ok: false; message: string }
export type WorkerTask<O> = { promise: Promise<O>; cancel(): void }

/** Error message sent deliberately by the worker (as opposed to a crash or a transport failure). */
export class WorkerReplyError extends Error {}

const abortError = () => new DOMException('The operation was aborted.', 'AbortError')

/** Runs one request in a fresh worker. The worker is always terminated once the task ends. */
export function runWorkerTask<I, O>(create: () => Worker, input: I, transfer: Transferable[] = []): WorkerTask<O> {
  const instance = create()
  let cancel = () => {}
  const promise = new Promise<O>((resolve, reject) => {
    let done = false
    const settle = (finish: () => void) => { if (done) return; done = true; instance.terminate(); finish() }
    cancel = () => settle(() => reject(abortError()))
    instance.onmessage = (event: MessageEvent<WorkerReply<O>>) => {
      const reply = event.data
      settle(() => reply.ok ? resolve(reply.result) : reject(new WorkerReplyError(reply.message)))
    }
    instance.onerror = event => settle(() => reject(new Error(event?.message || t('El proceso en segundo plano no pudo completarse.'))))
    try { instance.postMessage(input, transfer) } catch (error) { settle(() => reject(error)) }
  })
  return { promise, cancel: () => cancel() }
}

const createImportWorker = () => new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' })

/**
 * Reads CSV/TSV/Excel tables off the main thread. When the worker cannot be created or fails to load (not a deliberate
 * error reply from readTables), it falls back to the main thread; cancel() also discards a fallback in progress.
 */
export function readTablesInBackground(file: File, create: () => Worker = createImportWorker): WorkerTask<ImportTable[]> {
  let cancelled = false, cancelWorker = () => {}
  const run = async (): Promise<ImportTable[]> => {
    let task: WorkerTask<ImportTable[]>
    try { task = runWorkerTask<{ file: File; language: ReturnType<typeof getLanguage> }, ImportTable[]>(create, { file, language: getLanguage() }) }
    catch { return readTables(file) }
    cancelWorker = task.cancel
    try { return await task.promise }
    catch (error) {
      if (cancelled || error instanceof WorkerReplyError || (error as Error | undefined)?.name === 'AbortError') throw error
      return readTables(file)
    }
  }
  const promise = run().then(
    result => { if (cancelled) throw abortError(); return result },
    error => { throw cancelled ? abortError() : error })
  return { promise, cancel: () => { cancelled = true; cancelWorker() } }
}
