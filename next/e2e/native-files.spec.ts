import { test } from './fixtures'
import { expect } from '@playwright/test'
import { warehouseAction } from './helpers'
import fs from 'node:fs/promises'

test('Guardar reutiliza el archivo elegido y Abrir vincula el archivo de origen', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { pickers:0, writes:[] as {file:string;source:string}[] }
    Object.assign(window, { nativeState:state })
    const handle = (name:string) => ({ name, getFile:async()=>new File([JSON.stringify({...JSON.parse(state.writes[0].source),name:'Desde disco'})],name), createWritable:async()=>({write:async(source:string)=>{state.writes.push({file:name,source})},close:async()=>{}}) })
    Object.assign(window, { showSaveFilePicker:async()=>{state.pickers++;return handle('elegido.json')},showOpenFilePicker:async()=>[handle('abierto.json')] })
  })
  const downloads: string[]=[];page.on('download',d=>downloads.push(d.suggestedFilename()))
  await page.goto('/app')
  await warehouseAction(page,'Guardar almacén')
  await expect(page.locator('.status-bar')).toContainText('guardado en el mismo archivo')
  await page.getByLabel('Nombre del almacén',{exact:true}).fill('Actualizado')
  await page.getByRole('button',{name:'Aplicar',exact:true}).click()
  await warehouseAction(page,'Guardar almacén')
  await expect.poll(()=>page.evaluate(()=> (window as unknown as {nativeState:{writes:unknown[]}}).nativeState.writes.length)).toBe(2)
  await warehouseAction(page,'Abrir')
  await expect(page.getByLabel('Nombre del almacén',{exact:true})).toHaveValue('Desde disco')
  await warehouseAction(page,'Guardar almacén')
  await expect.poll(()=>page.evaluate(()=> (window as unknown as {nativeState:{writes:unknown[]}}).nativeState.writes.length)).toBe(3)
  const state = await page.evaluate(()=> (window as unknown as {nativeState:{pickers:number;writes:{file:string;source:string}[]}}).nativeState)
  expect(state.pickers).toBe(1)
  expect(state.writes.map(w=>w.file)).toEqual(['elegido.json','elegido.json','abierto.json'])
  expect(JSON.parse(state.writes[1].source).name).toBe('Actualizado')
  expect(downloads).toEqual([])
})

test('cancelar Guardar no descarta cambios ni continúa la sustitución',async({page})=>{
  await page.addInitScript(()=>Object.assign(window,{showSaveFilePicker:async()=>{throw new DOMException('Cancelled','AbortError')}}))
  await page.goto('/app')
  await page.getByLabel('Nombre del almacén',{exact:true}).fill('Trabajo pendiente')
  await page.getByRole('button',{name:'Aplicar',exact:true}).click()
  await warehouseAction(page,'Nuevo almacén')
  await page.getByRole('dialog').getByRole('button',{name:'Guardar y continuar',exact:true}).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click()
  await expect(page.getByLabel('Nombre del almacén',{exact:true})).toHaveValue('Trabajo pendiente')
  await expect(page.locator('.status-meta')).toContainText('Cambios sin guardar')
})

test('una copia descargada anteriormente reconoce A60208 en inventario y recorrido',async({page})=>{
  const doc=JSON.parse(await fs.readFile('src/warehouse/examples/almacen-detallado.optiruta.json','utf8'))
  delete doc.locationPolicy
  await page.goto('/app')
  await page.getByLabel('Abrir archivo de almacén').setInputFiles({name:'Almacén detallado de escritorio.optiruta.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))})
  await page.getByRole('button',{name:'Inventario',exact:true}).click()
  const buffer=Buffer.from('referencia;descripcion;ubicacion;cantidad\nREF;Material;A60208;2\n')
  await page.getByLabel('Archivo de inventario').setInputFiles({name:'inventario.csv',mimeType:'text/csv',buffer})
  await page.getByRole('dialog').getByRole('button',{name:'Importar inventario',exact:true}).click()
  await expect(page.locator('.opd-unplaced')).toHaveCount(0)
  await page.getByRole('button',{name:'Ver A60208 en el plano',exact:true}).click()
  await page.getByRole('button',{name:'Órdenes de trabajo',exact:true}).click()
  await page.getByLabel('Archivo de OT').setInputFiles({name:'OT.csv',mimeType:'text/csv',buffer})
  await page.getByRole('dialog').getByRole('button',{name:'Importar OT',exact:true}).click()
  await page.getByRole('button',{name:'Recorridos',exact:true}).click()
  await page.getByRole('button',{name:'Calcular ruta',exact:true}).click()
  await expect(page.locator('.route-results')).toBeVisible({timeout:30000})
})

