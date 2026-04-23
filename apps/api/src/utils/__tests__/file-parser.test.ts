import { describe, it, expect } from 'vitest'
import { parseColumnFromBuffer } from '../file-parser.js'

function csvBuffer(content: string): Buffer {
  return Buffer.from(content, 'utf-8')
}

describe('parseColumnFromBuffer', () => {
  it('parses a single-column CSV with header', () => {
    const buf = csvBuffer('property_id\n100\n200\n300\n')
    const values = parseColumnFromBuffer(buf, 'data.csv')
    expect(values).toEqual(['100', '200', '300'])
  })

  it('parses a headerless single-column CSV', () => {
    const buf = csvBuffer('100\n200\n300\n')
    const values = parseColumnFromBuffer(buf, 'data.csv')
    expect(values).toEqual(['100', '200', '300'])
  })

  it('extracts first column from multi-column CSV', () => {
    const buf = csvBuffer('id,name,status\n111,Hotel A,active\n222,Hotel B,inactive\n')
    const values = parseColumnFromBuffer(buf, 'data.csv')
    expect(values).toEqual(['111', '222'])
  })

  it('selects named column when columnHint is provided', () => {
    const buf = csvBuffer('name,hg_id\nHotel A,111\nHotel B,222\n')
    const values = parseColumnFromBuffer(buf, 'data.csv', 'hg_id')
    expect(values).toEqual(['111', '222'])
  })

  it('falls back to first column when columnHint is not found', () => {
    const buf = csvBuffer('name,hg_id\nHotel A,111\n')
    const values = parseColumnFromBuffer(buf, 'data.csv', 'nonexistent')
    expect(values).toEqual(['Hotel A'])
  })

  it('ignores empty cells', () => {
    const buf = csvBuffer('id\n100\n\n200\n\n')
    const values = parseColumnFromBuffer(buf, 'data.csv')
    expect(values).toEqual(['100', '200'])
  })

  it('trims whitespace from values', () => {
    const buf = csvBuffer('id\n  100  \n 200 \n')
    const values = parseColumnFromBuffer(buf, 'data.csv')
    expect(values).toEqual(['100', '200'])
  })

  it('returns empty array for empty file', () => {
    const buf = csvBuffer('')
    const values = parseColumnFromBuffer(buf, 'data.csv')
    expect(values).toEqual([])
  })

  it('returns empty array for header-only file', () => {
    const buf = csvBuffer('property_id\n')
    const values = parseColumnFromBuffer(buf, 'data.csv')
    expect(values).toEqual([])
  })

  it('skips text header even when xlsx does not detect it as a header row', () => {
    // Simulates a single-column CSV where isHeaderRow detection might miss the header
    const buf = csvBuffer('Hotel IDs\n100\n200\n300\n')
    const values = parseColumnFromBuffer(buf, 'data.csv')
    expect(values).toEqual(['100', '200', '300'])
  })
})
