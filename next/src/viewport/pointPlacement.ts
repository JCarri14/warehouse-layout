import type { Point } from '../operations/types'

export type PointCell = { xMm: number; yMm: number; widthMm: number; depthMm: number; point: Point; inside: boolean }
export const visibleGridStepMm = (width: number, depth: number, grid: number) => grid * Math.max(1, Math.ceil(Math.max(width, depth) / grid / 150))
/** Same decimation as the visible floor grid; never clamp an outside cursor into the plan. */
export function pointCell(cursor: Point, width: number, depth: number, grid: number): PointCell {
  const step = visibleGridStepMm(width, depth, grid)
  const xMm = Math.floor(cursor.xMm / step) * step, yMm = Math.floor(cursor.yMm / step) * step
  const inside = cursor.xMm >= 0 && cursor.yMm >= 0 && cursor.xMm < width && cursor.yMm < depth
  const widthMm = inside ? Math.min(step, width - xMm) : step, depthMm = inside ? Math.min(step, depth - yMm) : step
  return { xMm, yMm, widthMm, depthMm, inside, point: { xMm: Math.round(xMm + widthMm / 2), yMm: Math.round(yMm + depthMm / 2) } }
}
