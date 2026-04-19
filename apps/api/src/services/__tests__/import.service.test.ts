import { describe, it, expect, vi } from 'vitest'
import { runImport } from '../import.service.js'

describe('runImport', () => {
  it('returns all succeeded when all execute calls resolve', async () => {
    const execute = vi.fn().mockResolvedValue(undefined)
    const result = await runImport(['100', '200', '300'], execute)

    expect(result.total).toBe(3)
    expect(result.successCount).toBe(3)
    expect(result.failureCount).toBe(0)
    expect(result.results.every(r => r.succeeded)).toBe(true)
  })

  it('captures per-row errors without throwing', async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Already exists'))
      .mockResolvedValueOnce(undefined)

    const result = await runImport(['1', '2', '3'], execute)

    expect(result.total).toBe(3)
    expect(result.successCount).toBe(2)
    expect(result.failureCount).toBe(1)

    const failed = result.results.find(r => !r.succeeded)!
    expect(failed.row).toBe(2)
    expect(failed.value).toBe('2')
    expect(failed.error).toBe('Already exists')
  })

  it('includes row number and raw value in each result', async () => {
    const execute = vi.fn().mockResolvedValue(undefined)
    const result = await runImport(['abc', 'def'], execute)

    expect(result.results[0]).toMatchObject({ row: 1, value: 'abc', succeeded: true })
    expect(result.results[1]).toMatchObject({ row: 2, value: 'def', succeeded: true })
  })

  it('handles non-Error thrown values gracefully', async () => {
    const execute = vi.fn().mockRejectedValue('raw string error')
    const result = await runImport(['x'], execute)

    expect(result.results[0]!.error).toBe('Unknown error')
  })

  it('returns empty summary for empty input', async () => {
    const execute = vi.fn()
    const result = await runImport([], execute)

    expect(result.total).toBe(0)
    expect(result.successCount).toBe(0)
    expect(result.failureCount).toBe(0)
    expect(execute).not.toHaveBeenCalled()
  })

  it('passes row index (1-based) to execute', async () => {
    const indices: number[] = []
    const execute = vi.fn().mockImplementation((_val, row) => { indices.push(row); return Promise.resolve() })
    await runImport(['a', 'b', 'c'], execute)

    expect(indices).toEqual([1, 2, 3])
  })
})
