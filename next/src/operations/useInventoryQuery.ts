import { useEffect, useState } from 'react'

export const INVENTORY_QUERY_DELAY_MS = 180
/** Echo input immediately; group expensive filtering. Clearing a search takes effect immediately. */
export function useInventoryQuery(value: string) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    if (value === settled) return
    const timer = setTimeout(() => setSettled(value), INVENTORY_QUERY_DELAY_MS)
    return () => clearTimeout(timer)
  }, [value, settled])
  return value ? settled : ''
}
