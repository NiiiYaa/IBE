export interface ImportRowResult {
  row: number
  value: string
  succeeded: boolean
  error?: string
}

export interface ImportSummary {
  total: number
  successCount: number
  failureCount: number
  results: ImportRowResult[]
}

/**
 * Generic bulk import runner.
 * Iterates over a list of raw string values, calls `execute` for each,
 * and collects per-row success/failure results.
 * Never throws — all errors are captured per row.
 */
export async function runImport(
  values: string[],
  execute: (value: string, row: number) => Promise<void>,
): Promise<ImportSummary> {
  const results: ImportRowResult[] = []

  for (let i = 0; i < values.length; i++) {
    const value = values[i]!
    try {
      await execute(value, i + 1)
      results.push({ row: i + 1, value, succeeded: true })
    } catch (err) {
      results.push({
        row: i + 1,
        value,
        succeeded: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  const successCount = results.filter(r => r.succeeded).length
  return {
    total: results.length,
    successCount,
    failureCount: results.length - successCount,
    results,
  }
}
