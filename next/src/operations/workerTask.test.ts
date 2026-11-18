import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { readTables } from './imports'
import { readTablesInBackground, runWorkerTask, WorkerReplyError } from './workerTask'

class FakeWorker {
  static last: FakeWorker
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  terminated = 0
  posted: unknown[] = []
  constructor() { FakeWorker.last = this }
  postMessage(value: unknown) { this.posted.push(value) }
  terminate() { this.terminated++ }
  reply(data: unknown) { this.onmessage?.({ data } as MessageEvent) }
}
const create = () => new FakeWorker() as unknown as Worker

describe('runWorkerTask', () => {
  it('resuelve con result y termina el worker', async () => {
    const task = runWorkerTask<number, string>(create, 7)
    expect(FakeWorker.last.posted).toEqual([7])
    FakeWorker.last.reply({ ok: true, result: 'hecho' })
    await expect(task.promise).resolves.toBe('hecho')
    expect(FakeWorker.last.terminated).toBeGreaterThan(0)
  })
  it('rechaza con el mensaje del worker', async () => {
    const task = runWorkerTask<number, string>(create, 1)
    FakeWorker.last.reply({ ok: false, message: 'Fallo claro' })
    await expect(task.promise).rejects.toThrow('Fallo claro')
    expect(FakeWorker.last.terminated).toBeGreaterThan(0)
  })
  it('cancel rechaza con AbortError y termina', async () => {
    const task = runWorkerTask<number, string>(create, 1)
    task.cancel()
    await expect(task.promise).rejects.toMatchObject({ name: 'AbortError' })
    expect(FakeWorker.last.terminated).toBeGreaterThan(0)
  })
  it('sin Worker usa el hilo principal', async () => {
    const bytes = await readFile('../ejemplo-ERP.csv')
    const file = new File([bytes], 'ejemplo-ERP.csv')
    const task = readTablesInBackground(file, () => { throw new Error('sin Worker') })
    await expect(task.promise).resolves.toEqual(await readTables(file))
  })
  it('si el worker falla al cargar, usa el hilo principal', async () => {
    const file = new File([await readFile('../ejemplo-ERP.csv')], 'ejemplo-ERP.csv')
    const task = readTablesInBackground(file, create)
    setTimeout(() => FakeWorker.last.onerror?.({ message: 'load failed' } as ErrorEvent), 0)
    await expect(task.promise).resolves.toEqual(await readTables(file))
    expect(FakeWorker.last.terminated).toBeGreaterThan(0)
  })
  it('un error enviado por el worker no se reintenta en el hilo principal', async () => {
    const file = new File([await readFile('../ejemplo-ERP.csv')], 'ejemplo-ERP.csv')
    const task = readTablesInBackground(file, create)
    FakeWorker.last.reply({ ok: false, message: 'El archivo está vacío o supera 10 MiB.' })
    await expect(task.promise).rejects.toBeInstanceOf(WorkerReplyError)
  })
  it('cancel durante el respaldo descarta el resultado', async () => {
    const file = new File([await readFile('../ejemplo-ERP.csv')], 'ejemplo-ERP.csv')
    const task = readTablesInBackground(file, create)
    FakeWorker.last.onerror?.({ message: 'x' } as ErrorEvent)
    task.cancel()
    await expect(task.promise).rejects.toMatchObject({ name: 'AbortError' })
  })
})
