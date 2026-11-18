import { t, setLanguage, type Language } from '../i18n'
import { readTables } from './imports'
import type { WorkerReply } from './workerTask'

self.onmessage = async (event: MessageEvent<{ file: File; language: Language }>) => {
  let reply: WorkerReply<Awaited<ReturnType<typeof readTables>>>
  try {
    setLanguage(event.data.language)
    reply = { ok: true, result: await readTables(event.data.file) }
  } catch (error) {
    reply = { ok: false, message: error instanceof Error ? error.message : t('No se pudo leer el archivo.') }
  }
  self.postMessage(reply)
}
