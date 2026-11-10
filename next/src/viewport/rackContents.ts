import { elementHeight, type Rack } from '../warehouse/document'

export type ContentPart = { kind: string; material: 'wood' | 'cardboard' | 'bin' | 'label'; width: number; height: number; depth: number; x: number; y: number; z: number }
export function rackStructure(rack: Rack) {
  const turn = rack.depthMm > rack.widthMm, width = (turn ? rack.depthMm : rack.widthMm) / 1000, depth = (turn ? rack.widthMm : rack.depthMm) / 1000, height = elementHeight(rack) / 1000
  const bays = Math.max(1, Math.min(3, Math.ceil(width / 2.7))), span = width / bays
  const post = Math.min(.09, depth / 8, width / 12, height / 12)
  return { turn, width, depth, height, bays, span, post, usable: span - 2 * post, innerDepth: depth - 2 * post }
}
export function visualRackLevels(rack: Rack): number[] {
  if (rack.levels.length) return rack.levels.map(level => level.elevationMm / 1000).sort((a, b) => a - b)
  const count = rack.contents === 'bins' ? 5 : 3, height = elementHeight(rack) / 1000
  return Array.from({ length: count }, (_, index) => height * (index + .15) / count)
}

/** Disposable illustrative contents; positions are local to the rack, in metres. */
export function buildRackContents(rack: Rack): ContentPart[] {
  if (!rack.contents || rack.contents === 'shelves') return []
  const { width, height, span, post, usable, innerDepth, bays, turn } = rackStructure(rack), levels = visualRackLevels(rack)
  const access = turn ? ({ front: 'right', back: 'left', left: 'back', right: 'front' } as const)[rack.access] : rack.access
  const clearances = levels.map((level, i) => (levels[i + 1] ?? height) - level).filter(clear => clear >= .1)
  const minClear = Math.min(...clearances)
  const commonBin = [[.31,.5,.2],[.21,.35,.2],[.15,.235,.125],[.105,.165,.075]].find(([w,d,h]) => w + .02 <= usable && d <= innerDepth && h <= minClear - .05)
  const fallbackBin = [Math.min(.42, usable * .74), Math.min(.48, innerDepth * .84), Math.min(.24, minClear * .62)]
  const parts: ContentPart[] = [], perLevel = Math.max(1, Math.floor(320 / Math.max(1, levels.length)))
  const add = (kind: string, material: ContentPart['material'], x: number, y: number, z: number, w: number, h: number, d: number) => {
    if (w > 0 && h > 0 && d > 0) parts.push({ kind, material, width: turn ? d : w, height: h, depth: turn ? w : d, x: turn ? z : x, y, z: turn ? x : z })
  }
  for (let levelIndex = 0; levelIndex < levels.length; levelIndex++) {
    const base = levels[levelIndex], clear = (levels[levelIndex + 1] ?? height) - base
    if (rack.contents === 'pallets') {
      if (clear < .18) continue
      const deep = innerDepth >= 1, nominalWidth = deep ? .8 : 1.2
      const across = Math.max(1, Math.floor((usable + .05) / (nominalWidth + .05)))
      const pw = Math.min(nominalWidth, usable / across * .88), pd = Math.min(deep ? 1.2 : .8, innerDepth * .96)
      const ph = Math.min(.144, clear * .18), loadHeight = Math.min(1, clear - ph - .1)
      let count = 0
      for (let bay = 0; bay < bays && count < perLevel; bay++) for (let slot = 0; slot < across && count < perLevel; slot++, count++) {
        const x = -width / 2 + bay * span + post + usable * (slot + .5) / across
        for (let rail = 0; rail < 3; rail++) add('pallet-runner', 'wood', x + (rail - 1) * pw * .4, base + ph * .35, 0, pw * .14, ph * .7, pd)
        for (let slat = 0; slat < 5; slat++) add('pallet-slat', 'wood', x, base + ph * .85, (slat - 2) * pd * .22, pw, ph * .3, pd * .12)
        if (loadHeight > .05) {
          add('box', 'cardboard', x, base + ph + loadHeight / 2, 0, pw * .96, loadHeight, pd * .96)
          add('box-label', 'label', x, base + ph + loadHeight * .45, pd * .48 + .0005, pw * .2, Math.min(.12, loadHeight * .3), .001)
        }
      }
      continue
    }
    if (rack.contents === 'cartons') {
      const size = [[.4,.3,.3],[.3,.25,.2],[.2,.15,.12]].find(([w,d,h]) => w + .025 <= usable && d <= innerDepth && h + .04 <= clear)
      if (!size) continue
      const [w,d,h] = size, across = Math.max(1, Math.floor(usable / (w + .025))), rows = Math.max(1, Math.min(4, Math.floor(innerDepth / (d + .025))))
      let count = 0
      for (let row = 0; row < rows && count < perLevel; row++) for (let slot = 0; slot < across && count < perLevel; slot++) for (let bay = 0; bay < bays && count < perLevel; bay++, count++) {
        const x = -width / 2 + bay * span + post + usable * (slot + .5) / across, z = -innerDepth / 2 + innerDepth * (row + .5) / rows
        add('carton','cardboard',x,base+h/2,z,w,h,d)
        add('carton-tape','wood',x,base+h+.0005,z,w*.11,.001,d*.98)
        const side = access === 'front' || access === 'right' ? 1 : -1
        if (access === 'left' || access === 'right') add('carton-label','label',x+side*(w/2+.0005),base+h*.45,z,.001,h*.25,d*.35)
        else add('carton-label','label',x,base+h*.45,z+side*(d/2+.0005),w*.35,h*.25,.001)
      }
      continue
    }
    if (clear < .1) continue
    const size = commonBin
    const across = size ? Math.max(1, Math.floor(usable / (size[0] + .02))) : Math.max(1, Math.min(24, Math.floor(usable / .32)))
    const rows = Math.max(1, Math.min(8, Math.floor(innerDepth / (size?.[1] ?? .52))))
    const w = size?.[0] ?? Math.min(fallbackBin[0], usable / across * .74), d = size?.[1] ?? Math.min(fallbackBin[1], innerDepth / rows * .84), h = size?.[2] ?? fallbackBin[2]
    const t = Math.min(.018, w / 10, d / 10, h / 10)
    let count = 0
    // Spread the per-level budget over bays so dense racks do not leave all later bays empty.
    for (let slot = 0; slot < across && count < perLevel; slot++) for (let row = 0; row < rows && count < perLevel; row++) for (let bay = 0; bay < bays && count < perLevel; bay++, count++) {
      const x = -width / 2 + bay * span + post + usable * (slot + .5) / across
      const rowAt = access === 'front' ? rows - 1 - row : row, z = -innerDepth / 2 + innerDepth * (rowAt + .5) / rows
      add('bin-base','bin',x,base+t/2,z,w,t,d)
      const alongX = access === 'left' || access === 'right', positive = access === 'front' || access === 'right'
      const sign = positive ? 1 : -1
      if (alongX) {
        add('bin-front','bin',x+sign*(w-t)/2,base+h*.325,z,t,h*.65,d)
        add('bin-back','bin',x-sign*(w-t)/2,base+h/2,z,t,h,d)
        for (const side of [-1,1]) add('bin-side','bin',x,base+h/2,z+side*(d-t)/2,w,h,t)
        if (row === 0) add('bin-label','label',x+sign*(w-t)/2,base+h*.25,z,t*1.1,h*.2,d*.4)
      } else {
        add('bin-front','bin',x,base+h*.325,z+sign*(d-t)/2,w,h*.65,t)
        add('bin-back','bin',x,base+h/2,z-sign*(d-t)/2,w,h,t)
        for (const side of [-1,1]) add('bin-side','bin',x+side*(w-t)/2,base+h/2,z,t,h,d)
        if (row === 0) add('bin-label','label',x,base+h*.25,z+sign*(d-t)/2,w*.4,h*.2,t*1.1)
      }
    }
  }
  return parts
}
