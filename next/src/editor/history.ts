type Entry<T> = { value: T; label: string }
export type History<T> = { past: Entry<T>[]; present: T; future: Entry<T>[] }
export function createHistory<T>(value: T): History<T> { return { past: [], present: value, future: [] } }
export function pushHistory<T>(history: History<T>, value: T, label: string): History<T> {
  if (JSON.stringify(history.present) === JSON.stringify(value)) return history
  return { past: [...history.past, { value: history.present, label }].slice(-100), present: value, future: [] }
}
export function undoHistory<T>(history: History<T>): History<T> {
  const entry = history.past.at(-1)
  return entry ? { past: history.past.slice(0, -1), present: entry.value, future: [{ value: history.present, label: entry.label }, ...history.future] } : history
}
export function redoHistory<T>(history: History<T>): History<T> {
  const entry = history.future[0]
  return entry ? { past: [...history.past, { value: history.present, label: entry.label }], present: entry.value, future: history.future.slice(1) } : history
}
