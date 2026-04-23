import * as xlsx from 'xlsx'

/**
 * Extracts a column of string values from a CSV or Excel buffer.
 * Handles both files with a header row and headerless single-column files.
 * When `columnHint` is provided, finds the matching header (case-insensitive).
 */
export function parseColumnFromBuffer(
  buffer: Buffer,
  filename: string,
  columnHint?: string,
): string[] {
  const ext = filename.split('.').pop()?.toLowerCase()

  const workbook = xlsx.read(
    ext === 'csv' ? buffer.toString('utf-8') : buffer,
    { type: ext === 'csv' ? 'string' : 'buffer', raw: false },
  )

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return []

  const sheet = workbook.Sheets[sheetName]
  if (!sheet) return []

  // Read as raw arrays so we control header handling
  const rawRows = xlsx.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '', raw: false })
  if (rawRows.length === 0) return []

  const firstRow = rawRows[0] ?? []

  // Detect if the first row is a header: at least one cell contains a non-numeric character
  const isHeaderRow = firstRow.some(cell => cell !== '' && !/^\d+(\.\d+)?$/.test(cell.trim()))

  if (isHeaderRow) {
    // Find the target column index
    let colIndex = 0
    if (columnHint) {
      const found = firstRow.findIndex(h => h.trim().toLowerCase() === columnHint.toLowerCase())
      if (found !== -1) colIndex = found
    }
    return rawRows
      .slice(1)
      .map(row => String(row[colIndex] ?? '').trim())
      .filter(v => v !== '')
  }

  // No header row — use first column of all rows
  const all = rawRows
    .map(row => String(row[0] ?? '').trim())
    .filter(v => v !== '')

  // Belt-and-suspenders: skip first value if it's non-numeric (text header not caught above)
  if (all.length > 0 && !/^\d+(\.\d+)?$/.test(all[0]!)) {
    return all.slice(1)
  }
  return all
}
