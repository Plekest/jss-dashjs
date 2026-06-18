import Papa from 'papaparse'
import * as XLSX from 'xlsx'

export type SourceType = 'csv' | 'tsv' | 'json' | 'xlsx'

export interface ParsedFile {
  sourceType: SourceType
  columns: { title: string }[]
  data: (string | number)[][]
}

function coerce(val: unknown): string | number {
  if (typeof val === 'number') return val
  const s = String(val ?? '')
  const n = parseFloat(s)
  return !isNaN(n) && String(n) === s.trim() ? n : s
}

function rowsToTable(rows: unknown[][]): { columns: { title: string }[]; data: (string | number)[][] } {
  if (!rows.length) return { columns: [], data: [] }
  const headers = rows[0] as string[]
  const data = rows.slice(1).map((row) =>
    (row as unknown[]).map(coerce),
  ) as (string | number)[][]
  return { columns: headers.map((h) => ({ title: String(h ?? '') })), data }
}

function parseCsvTsv(file: File, delimiter: string): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      delimiter,
      skipEmptyLines: true,
      complete: (result) => {
        if (!result.data.length) return reject(new Error('Arquivo vazio'))
        const { columns, data } = rowsToTable(result.data as unknown[][])
        resolve({ sourceType: delimiter === '\t' ? 'tsv' : 'csv', columns, data })
      },
      error: reject,
    })
  })
}

function parseJson(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const raw = JSON.parse(reader.result as string)
        if (!Array.isArray(raw) || !raw.length) {
          return reject(new Error('JSON deve ser um array de objetos'))
        }
        const keys = Object.keys(raw[0])
        const columns = keys.map((k) => ({ title: k }))
        const data = raw.map((row: Record<string, unknown>) => keys.map((k) => coerce(row[k])))
        resolve({ sourceType: 'json', columns, data })
      } catch (e) {
        reject(e)
      }
    }
    reader.onerror = reject
    reader.readAsText(file)
  })
}

function parseXlsx(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const workbook = XLSX.read(reader.result, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
        if (!rows.length) return reject(new Error('Planilha vazia'))
        const { columns, data } = rowsToTable(rows)
        resolve({ sourceType: 'xlsx', columns, data })
      } catch (e) {
        reject(e)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

export function parseFile(file: File): Promise<ParsedFile> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'xlsx' || ext === 'xls') return parseXlsx(file)
  if (ext === 'json') return parseJson(file)
  if (ext === 'tsv') return parseCsvTsv(file, '\t')
  return parseCsvTsv(file, ',')
}
