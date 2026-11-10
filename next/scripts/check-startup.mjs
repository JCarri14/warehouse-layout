import fs from 'node:fs/promises'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import assert from 'node:assert/strict'

const manifest = JSON.parse(await fs.readFile('dist/.vite/manifest.json', 'utf8'))
const entry = Object.keys(manifest).find(key => manifest[key].isEntry)
assert(entry, 'Missing production entry')
const initial = new Set()
function visit(key) {
  if (initial.has(key)) return
  initial.add(key)
  for (const dependency of manifest[key].imports ?? []) visit(dependency)
}
visit(entry)
let bytes = 0, gzipBytes = 0
const files = []
for (const key of initial) {
  const file = manifest[key].file, content = await fs.readFile(path.join('dist', file))
  bytes += content.length; gzipBytes += gzipSync(content).length; files.push(file)
  assert(!content.includes('THREE.WebGLRenderer'), '3D engine must not be in the initial static graph')
  assert(!/WarehouseViewport|OperationsPanel|StartRack|three\.module/.test(file), 'Heavy features must load on demand')
}
assert(gzipBytes < 140000, `Initial JS ${gzipBytes} exceeds 140 kB gzip budget`)
const report = { initialJsBytes: bytes, initialJsGzipBytes: gzipBytes, files, previousInitialJsGzipBytes: 289170 + 420, note: 'Static production dependency graph. Optional home animation and feature modules are deferred; sizes are not network timing measurements.' }
await fs.mkdir('artifacts', { recursive: true })
await fs.writeFile('artifacts/startup-size.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
