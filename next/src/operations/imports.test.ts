import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { chooseHeader, draftToLines, formatQuantity, guessMapping, parseDelimited, parseQuantity, previewImport, readTables, validateDataLines } from './imports'

const template = '{S}{N}{C}'
describe('tabular imports', () => {
  it('reads quoted separators, newlines and physical source rows', () => {
    const table = parseDelimited('\uFEFFReferencia;Descripción;Ubicación;Cantidad\r\nx;"barra;\r\nlarga";a50110;2,70\r\ny;otra;A50111;0')
    expect(table.sourceRows).toEqual([2, 4])
    const result = previewImport(table, guessMapping(table), template, 'OT 1')
    expect(result.errors).toEqual([])
    expect(result.lines.map(l => [l.description, l.location, l.quantity, l.origin])).toEqual([['barra;\r\nlarga', 'A50110', 2.7, 'OT 1'], ['otra', 'A50111', 0, 'OT 1']])
  })
  it('finds ERP headers under a report title and distinguishes artículo', () => {
    const table = parseDelimited('Orden de trabajo nº: 7907\n\nArtículo;Descripción;Ubicación;Cantidad\nP;Barra;Z90101;1')
    expect(table.sourceRows).toEqual([4])
    expect(guessMapping(table)).toMatchObject({ reference: 0, description: 1 })
    expect(guessMapping(parseDelimited('Artículo;Ubicación\nBarra;A50101'))).toMatchObject({ reference: -1, description: 0, defaultQuantityOne: false })
  })
  it('omits placeholder locations before invalid quantities and preserves error source rows', () => {
    const table = parseDelimited('Referencia;Ubicación;Cantidad\nx;(Ubicación Defecto);oops\ny;-;oops\nz;bad;2\nw;A50101;-1')
    const result = previewImport(table, guessMapping(table), template)
    expect(result.omitted.map(x => x.row)).toEqual([2, 3])
    expect(result.errors.map(x => x.row)).toEqual([4, 5])
  })
  it('rejects malformed CSV and invalid mappings without partial interpretation', () => {
    for (const text of ['', 'A;B', 'A;B\n"x;y', 'A;B\n"x"z;y']) expect(() => parseDelimited(text)).toThrow()
    const table = parseDelimited('Referencia;Ubicación;Cantidad\nx;A50101;1')
    const mapping = guessMapping(table)
    expect(() => previewImport(table, { ...mapping, quantity: 1 }, template)).toThrow()
    expect(() => previewImport(table, { ...mapping, quantity: -1 }, template)).toThrow()
    expect(previewImport(table, { ...mapping, quantity: -1, defaultQuantityOne: true }, template).lines[0].quantity).toBe(1)
  })
  it('respects TSV files and consistent CSV headers with comma-rich descriptions', async () => {
    const text = 'Referencia\tDescripción\tUbicación\tCantidad\nP\tbar, rod, metal, inox, long, thin\tA50101\t2\nQ\tbar, rod, inox, long, metal\tA50102\t3'
    const tables = await readTables({ name: 'list.tsv', size: text.length, text: async () => text } as File)
    expect(tables[0].headers).toHaveLength(4)
    expect(previewImport(tables[0], guessMapping(tables[0]), template).lines).toHaveLength(2)
    const csv = parseDelimited(text.replace(/\t/g, ';'))
    expect(csv.headers).toHaveLength(4)
    expect(csv.rows[0][1]).toContain('bar, rod, metal')
    const titled = parseDelimited('Informe;noviembre\n' + text.replace(/\t/g, ';'))
    expect(titled.headers).toHaveLength(4)
    expect(previewImport(titled, guessMapping(titled), template).lines).toHaveLength(2)
  })
  it('retains unknown report titles and lets the user choose an explicit header row', () => {
    const table = parseDelimited('INFORME DE MATERIAL\n\nClave;Texto;Hueco;Saldo\nP;Barra;A50101;2')
    expect(table.headers).toEqual(['Clave', 'Texto', 'Hueco', 'Saldo'])
    expect(table.rawSourceRows).toEqual([1, 3, 4])
    const title = chooseHeader(table, 0)
    expect(title.headers).toEqual(['INFORME DE MATERIAL'])
    expect(() => previewImport(title, { ...guessMapping(title), reference: 0, location: 0 }, template)).toThrow()
    const selected = chooseHeader(title, 1)
    expect(selected.sourceRows).toEqual([4])
    expect(previewImport(selected, { reference: 0, description: 1, location: 2, quantity: 3, origin: -1, defaultQuantityOne: false }, template).lines[0].reference).toBe('P')
    expect(() => chooseHeader(selected, -1)).toThrow()
  })
  it('blocks inconsistent row widths and preserves long inventory text while bounding OT drafts', () => {
    const table = parseDelimited('Referencia;Ubicación;Cantidad\nP;A50101;1\nQ;A50102')
    expect(() => previewImport(table, guessMapping(table), template)).toThrow(/columnas/)
    const long = parseDelimited('Referencia;Ubicación;Cantidad\n' + 'P'.repeat(4097) + ';A50101;1')
    expect(previewImport(long, guessMapping(long), template).lines[0].reference).toHaveLength(4097)
    expect(validateDataLines([{ id: 'x', reference: 'P'.repeat(4097), location: 'A50101', quantity: 1, description: '', origin: '' }])).toBe(true)
    expect(draftToLines([{ id: 'x', reference: 'P'.repeat(4097), location: 'A50101', quantityText: '1', description: '', origin: '' }], template).errors).toHaveLength(1)
  })
  it('parses localized quantities without losing ordinary decimals', () => {
    for (const text of ['2,70', '2.70', ' 2,70 ']) expect(parseQuantity(text)).toBe(2.7)
    expect(parseQuantity('1.234,56')).toBe(1234.56)
    expect(parseQuantity('1,234.56')).toBe(1234.56)
    expect(parseQuantity('1 234,56')).toBe(1234.56)
    expect(formatQuantity(0.123456)).toBe('0,123456')
    for (const text of ['', '-1', 'NaN', 'Infinity', '1e3', '1,2,3', '1000000001']) expect(() => parseQuantity(text)).toThrow()
  })
  it('validates drafts and recovered data, allowing unknown well formed locations', () => {
    const draft = { id: 'x', reference: 'P', description: '', location: 'z90101', origin: '', quantityText: '2,7' }
    const result = draftToLines([draft], template)
    expect(result.lines[0]).toMatchObject({ location: 'Z90101', quantity: 2.7 })
    expect(draftToLines([{ ...draft, quantityText: '0' }], template).errors).toHaveLength(1)
    expect(validateDataLines(result.lines)).toBe(true)
    expect(validateDataLines([{ ...result.lines[0], quantity: Infinity }])).toBe(false)
    expect(validateDataLines([{ ...result.lines[0], reference: 3 }])).toBe(false)
  })
  it('rejects oversized and unsupported files before reading', async () => {
    await expect(readTables({ name: 'a.csv', size: 10485761 } as File)).rejects.toThrow()
    await expect(readTables({ name: 'a.html', size: 20 } as File)).rejects.toThrow()
  })
  it('bounds rows and columns and rejects damaged workbook signatures', async () => {
    expect(() => parseDelimited(Array.from({ length: 101 }, (_, i) => `C${i}`).join(';') + '\n' + Array(101).fill('x').join(';'))).toThrow(/100 columnas/)
    expect(() => parseDelimited('Referencia;Ubicación;Cantidad\n' + 'P;A50101;1\n'.repeat(50001))).toThrow(/50.000 filas/)
    await expect(readTables({ name: 'bad.xlsx', size: 10, arrayBuffer: async () => new ArrayBuffer(10) } as File)).rejects.toThrow(/Excel válido/)
  })
  it.each(['ejemplo-ERP.csv', 'ejemplo-inventario.csv', 'ejemplo-ERP-separadores.csv'])('imports the real %s export', async name => {
    const text = await readFile(new URL(`../../../${name}`, import.meta.url), 'utf8')
    const table = parseDelimited(text, name)
    const result = previewImport(table, guessMapping(table), name.includes('separadores') ? '{L}-{E}-{N}-{C}' : template)
    expect(result.errors).toEqual([])
    expect(result.lines.length).toBeGreaterThan(0)
  })
  it.each(['xls', 'xlsx'])('reads the real ERP %s report as text beneath its title', async extension => {
    const bytes = await readFile(new URL(`../../../ejemplo-informe-ERP.${extension}`, import.meta.url))
    const tables = await readTables({ name: `erp.${extension}`, size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } as File)
    expect(tables.length).toBeGreaterThan(0)
    const table = tables.find(t => guessMapping(t).location >= 0)!
    expect(table).toBeDefined()
    expect(table.sourceRows[0]).toBeGreaterThan(2)
    const result = previewImport(table, guessMapping(table), template)
    expect(result.errors).toEqual([])
    expect(result.lines.length).toBeGreaterThan(0)
    expect(result.omitted.length).toBeGreaterThan(0)
  })
})
